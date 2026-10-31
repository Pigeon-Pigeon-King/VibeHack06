#!/usr/bin/env python3
"""Package selected self-contained GLBs; never alter provider originals or submit jobs."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import struct
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
BATCH = ROOT / "artifacts/asset-jobs/production-20261031"
PUBLIC = ROOT / "public/assets/generated/production-20261031"
DEFAULT_IDS = ["PROP-TANK", "ENV-LIGHTKIT-POLE", "PROP-VEH-TUG",
               "PROP-TERMINAL-CONSOLE", "BG-CRANE", "PROP-BENCH",
               "PROP-LIFE-MUG", "PROP-MEDICAL-BAG"]


def read_json(path):
    return json.loads(path.read_text())


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
    temp.replace(path)


def project_path(value):
    path = Path(value)
    if not path.is_absolute():
        path = ROOT / path
    path = path.resolve()
    path.relative_to(ROOT)
    return path


def inventory():
    records = {}
    for family, provider in [("hyper3d", "Hyper3D"), ("props", "Tripo")]:
        for asset in read_json(BATCH / family / "report.json")["assets"]:
            files = asset.get("files", {})
            if isinstance(files, dict):
                source = files.get("pbr_model", {}).get("path")
            else:
                source = next((f["path"] for f in files if f["path"].endswith(".glb")), None)
            if source:
                records[asset["id"]] = (asset, provider, project_path(source))
    return records


def inspect_glb(path):
    data = path.read_bytes()
    if len(data) < 20 or struct.unpack_from("<4sII", data) != (b"glTF", 2, len(data)):
        raise ValueError(f"Invalid GLB header: {path.name}")
    length, kind = struct.unpack_from("<II", data, 12)
    if kind != 0x4E4F534A:
        raise ValueError(f"Missing GLB JSON: {path.name}")
    doc = json.loads(data[20:20 + length])
    if any("uri" in x for x in doc.get("buffers", []) + doc.get("images", [])):
        raise ValueError(f"Runtime GLB must embed all dependencies: {path.name}")
    if doc.get("skins") or doc.get("animations"):
        raise ValueError(f"Static packaging requires an unskinned asset: {path.name}")
    triangles = 0
    bounds = []
    for mesh in doc.get("meshes", []):
        for primitive in mesh["primitives"]:
            if primitive.get("mode", 4) != 4:
                raise ValueError(f"Non-triangle primitive: {path.name}")
            position = doc["accessors"][primitive["attributes"]["POSITION"]]
            count = doc["accessors"][primitive["indices"]]["count"] if "indices" in primitive else position["count"]
            triangles += count // 3
            bounds.append({"min": position.get("min"), "max": position.get("max")})
    return {
        "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data),
        "triangles": triangles, "meshes": len(doc.get("meshes", [])),
        "materials": len(doc.get("materials", [])), "textures": len(doc.get("images", [])),
        "rawAccessorBoundsNotMeters": bounds, "externalDependencies": [],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ids", nargs="+", default=DEFAULT_IDS)
    parser.add_argument("--allow-pending", action="store_true")
    args = parser.parse_args()
    # This source-copy tool must not undo a separately reviewed runtime conversion.
    existing_manifest = PUBLIC / "manifest.json"
    if existing_manifest.exists():
        existing = read_json(existing_manifest)
        if existing.get("textureResizing") or existing.get("textureTranscoding") or existing.get("textureConversion") or any(
            item.get("sourceSha256") and item["sourceSha256"] != item.get("sha256")
            for item in existing.get("assets", [])
        ):
            parser.error("Optimized runtime already exists; prepare originals in a separate staging batch, then use the reviewed texture-conversion pipeline.")
    sources = inventory()
    PUBLIC.mkdir(parents=True, exist_ok=True)
    entries, pending = [], []
    for asset_id in sorted(set(args.ids)):
        if asset_id not in sources:
            pending.append(asset_id)
            continue
        asset, provider, source = sources[asset_id]
        metrics = inspect_glb(source)
        destination = PUBLIC / f"{asset_id}.glb"
        if not destination.exists() or hashlib.sha256(destination.read_bytes()).hexdigest() != metrics["sha256"]:
            shutil.copyfile(source, destination)
        if hashlib.sha256(destination.read_bytes()).hexdigest() != metrics["sha256"]:
            raise ValueError(f"Copy verification failed: {asset_id}")
        entries.append({
            "id": asset_id, "revision": "production-20261031-v1", "provider": provider,
            "status": "prepared", "name": asset.get("name", asset.get("label", asset_id)),
            "source": source.relative_to(ROOT).as_posix(),
            "runtime": destination.relative_to(ROOT).as_posix(),
            "url": f"assets/generated/production-20261031/{asset_id}.glb",
            "taskId": asset.get("task_id", asset.get("task_uuid")),
            "normalization": "Runtime wrapper applies Y-up, explicit yaw, bottom-center pivot and per-placement meter dimensions; source geometry/UV/PBR remain intact.",
            "collision": "Existing level collision stays separate; no collision inferred from generated mesh.",
            "evidence": "Source hash, self-contained GLB and byte-identical runtime copy checked; placement and runtime acceptance recorded separately.",
            **metrics,
        })
    manifest = {
        "updatedAt": datetime.now(timezone.utc).isoformat(), "batch": "production-20261031",
        "assets": entries, "pending": pending,
        "totalBytes": sum(e["bytes"] for e in entries),
        "sourceModified": False, "textureTranscoding": False,
        "limitations": ["Source PBR textures retained; no compression or generated mesh LOD yet.",
                        "Prepared copies alone do not establish in-game or Windows acceptance."],
    }
    write_json(PUBLIC / "manifest.json", manifest)
    write_json(BATCH / "runtime/prepared-assets.json", manifest)
    print(json.dumps({"packaged": len(entries), "bytes": manifest["totalBytes"], "pending": pending}))
    if pending and not args.allow_pending:
        raise SystemExit(1)


if __name__ == "__main__":
    main()

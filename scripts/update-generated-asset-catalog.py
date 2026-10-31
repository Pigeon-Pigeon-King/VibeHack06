#!/usr/bin/env python3
"""Reconcile local production reports without calling either paid API."""
import json
from pathlib import Path
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
BATCH = ROOT / "artifacts/asset-jobs/production-20261031"
REVIEW = ROOT / "design/art-review/20261031"


def read(path):
    return json.loads(path.read_text())


def write(path, value):
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
    temporary.replace(path)


def url(path):
    value = Path(path)
    if value.is_absolute():
        value = value.relative_to(ROOT)
    return "/" + value.as_posix()


def main():
    now = datetime.now(timezone.utc).isoformat()
    chars = read(BATCH / "characters/report.json")
    props = read(BATCH / "props/report.json")
    maps = read(BATCH / "hyper3d/report.json")
    roster = read(REVIEW / "core-roster.json")
    names = {entry["id"]: entry["name"] for entry in roster}
    names["CH-LU-CHILD"] = "陆闻川 · 儿童独立模型"
    prepared_path = BATCH / "runtime/prepared-assets.json"
    prepared = read(prepared_path) if prepared_path.exists() else {"assets": []}
    runtime = {a["id"]: a for a in prepared["assets"]}
    entries = []
    for asset in chars["assets"]:
        if not asset.get("modelUrl"):
            continue
        entry = {"id": asset["id"], "label": names.get(asset["id"], asset["id"]),
                 "provider": "tripo", "status": asset["status"], "modelUrl": asset["modelUrl"]}
        if asset.get("previewUrl"):
            entry["previewUrl"] = asset["previewUrl"]
        entries.append(entry)
    for asset in props["assets"]:
        files = asset.get("files", {})
        if not files.get("pbr_model"):
            continue
        entry = {"id": asset["id"], "label": asset.get("name", asset["id"]),
                 "provider": "tripo", "status": "model-downloaded",
                 "modelUrl": url(files["pbr_model"]["path"])}
        if files.get("rendered_image"):
            entry["previewUrl"] = url(files["rendered_image"]["path"])
        entries.append(entry)
    for asset in maps["assets"]:
        source = next((f for f in asset.get("files", []) if f["path"].endswith(".glb")), None)
        if source:
            entries.append({"id": asset["id"], "label": asset.get("label", asset["id"]),
                            "provider": "hyper3d", "status": "model-downloaded", "modelUrl": url(source["path"])})
    for entry in entries:
        if entry["id"] in runtime:
            entry["runtimeCopy"] = runtime[entry["id"]]["runtime"]
        if not (ROOT / entry["modelUrl"].lstrip("/")).is_file():
            raise ValueError(f"Missing model for catalog: {entry['id']}")
    if len({e["id"] for e in entries}) != len(entries):
        raise ValueError("Duplicate asset ID")
    entries.sort(key=lambda entry: (not entry["id"].startswith("CH-"), entry["id"]))
    write(BATCH / "production-catalog.json", {"updatedAt": now, "entries": entries})

    accepted_tasks = [t for a in chars["assets"] for t in a.get("tasks", []) if t.get("taskId")]
    model_count = sum(bool(a.get("modelTaskId") and a.get("sourceModelUrl")) for a in chars["assets"])
    rig_count = sum(a["status"] == "rig-downloaded" for a in chars["assets"])
    prop_count = sum(e["id"].startswith("PROP-") and e["provider"] == "tripo" for e in entries)
    map_count = sum(e["provider"] == "hyper3d" for e in entries)
    status = read(BATCH / "production-status.json")
    status.update({
        "status": "models-downloaded-runtime-in-progress" if len(entries) == 54 and rig_count == 13 else "production-and-runtime-in-progress",
        "updatedAt": now, "plannedModels": {"characters": 13, "props": 25, "mapRelated": 16},
        "characters": {"productionReferences": 13, "modelDownloads": model_count, "rigDownloads": rig_count,
                       "animationDownloads": 1, "sharedAnimationGate": "LU/ZHOU same canonical walk numerically checked and visually played; user approved expansion",
                       "creditsConsumed": chars["actualRecordedCredits"],
                       "freePrecheckResponsesUnknown": chars.get("freePrerigcheckResponseLossCount", 0)},
        "props": {"modelsDownloaded": prop_count, "providerCounts": props["counts"],
                  "creditsRecorded": props["actual_recorded_credits"]},
        "hyper3d": {"modelsDownloaded": map_count, "creditsConsumed": maps["accounting"]["known_consumed_credits"]},
        "runtimeIntegration": {"status": "in-progress", "preparedStaticAssets": len(runtime),
                               "manifest": "runtime/prepared-assets.json", "windowsAcceptance": "not-run"},
        "paidJobsSubmitted": len({t["taskId"] for t in accepted_tasks if t.get("provider", {}).get("consumed_credit", 0) > 0})
                             + len({a["task_id"] for a in props["assets"] if a.get("task_id")}) + map_count,
        "characterJobs": [{"assetId": a["id"], "stage": t["role"], "taskId": t["taskId"],
                           "state": t["state"], "credits": t.get("provider", {}).get("consumed_credit")}
                          for a in chars["assets"] for t in a.get("tasks", []) if t.get("taskId")],
        "reports": {name: f"{name}/report.json" for name in ("characters", "props", "hyper3d")},
    })
    write(BATCH / "production-status.json", status)
    char_by_id = {a["id"]: a for a in chars["assets"]}
    for entry in roster:
        char = char_by_id.get(entry["id"])
        if char:
            entry["production"] = "模型已下载" if char.get("sourceModelUrl") else char["status"]
            entry["rig"] = "41骨绑定已下载；显式语义映射完整" if char["status"] == "rig-downloaded" else char["status"]
            entry["animation"] = "同一canonical步行已数值检查及Three.js播放检查" if entry["id"] in ("CH-LU", "CH-ZHOU") else "共享成人动作待逐体型适配验收"
            entry["runtime"] = "主游戏人物接入待独立合并；资产预览器可查看"
        elif entry["id"] == "CH-CROWD":
            entry["production"] = "复用已有人物资产；不另建路人模型"
            entry["rig"] = "复用成人绑定"
    write(REVIEW / "core-roster.json", roster)
    print(json.dumps({"catalogEntries": len(entries), "characterModels": model_count, "rigs": rig_count,
                      "props": prop_count, "maps": map_count, "runtimeCopies": len(runtime)}))


if __name__ == "__main__":
    main()

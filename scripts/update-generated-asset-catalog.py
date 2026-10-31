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
    architecture_path = BATCH / "architecture/report.json"
    architecture = read(architecture_path) if architecture_path.exists() else {"assets": [], "accounting": {}}
    tactical_path = BATCH / "characters/tactical-animations/verification-summary.json"
    tactical = read(tactical_path) if tactical_path.exists() else None
    architecture_prepared_path = BATCH / "architecture/prepared-manifest.json"
    architecture_prepared = read(architecture_prepared_path) if architecture_prepared_path.exists() else {"assets": []}
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
    for asset in architecture["assets"]:
        if not asset.get("downloaded"):
            continue
        source = next((f for f in asset.get("source_files", []) if f["path"].endswith(".glb")), None)
        if source:
            entries.append({"id": asset["id"], "label": asset["id"], "provider": asset["provider"].lower(),
                            "status": "model-downloaded", "modelUrl": url(source["path"]),
                            "category": "reusable-map-module", "taskId": asset["task_uuid"]})
    prepared_map = {a["id"]: a for a in architecture_prepared["assets"]}
    for entry in entries:
        if entry["id"] in runtime:
            entry["runtimeCopy"] = runtime[entry["id"]]["runtime"]
        if entry["id"] in prepared_map:
            entry["preparedLODs"] = [{"level": level["level"], "path": level.get("geometryPath", level["path"]),
                                       "sha256": level.get("geometrySHA256", level["sha256"]),
                                       "requiresLOD0Materials": level["level"] > 0}
                                      for level in prepared_map[entry["id"]]["levels"]]
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
    map_count = len(maps["assets"]) + sum(bool(a.get("downloaded")) for a in architecture["assets"])
    hyper_count = sum(e["provider"] == "hyper3d" for e in entries)
    additional_tasks = [a for a in architecture["assets"] if a.get("task_uuid")]
    additional_credits = {provider: accounting.get("actual_recorded_credits", 0)
                          for provider, accounting in architecture.get("accounting", {}).items()}
    planned_map_count = 16 + len(architecture["assets"])
    status = read(BATCH / "production-status.json")
    status.update({
        "status": "models-downloaded-runtime-in-progress" if len(entries) == 38 + planned_map_count and rig_count == 13 else "production-and-runtime-in-progress",
        "updatedAt": now, "plannedModels": {"characters": 13, "props": 25, "mapRelated": planned_map_count},
        "characters": {"productionReferences": 13, "modelDownloads": model_count, "rigDownloads": rig_count,
                       "animationDownloads": 3 if tactical else 1, "sharedAnimationGate": "LU/ZHOU same canonical walk numerically checked and visually played; user approved expansion",
                       "creditsConsumed": chars["actualRecordedCredits"] + (tactical["actualNewCredits"] if tactical else 0),
                       "freePrecheckResponsesUnknown": chars.get("freePrerigcheckResponseLossCount", 0)},
        "props": {"modelsDownloaded": prop_count, "providerCounts": props["counts"],
                  "creditsRecorded": props["actual_recorded_credits"]},
        "hyper3d": {"modelsDownloaded": hyper_count, "creditsConsumed": maps["accounting"]["known_consumed_credits"] + additional_credits.get("Hyper3D", 0)},
        "additionalArchitecture": {"modelsDownloaded": sum(bool(a.get("downloaded")) for a in architecture["assets"]),
                                   "credits": additional_credits, "report": "architecture/report.json"},
        "runtimeIntegration": {"status": "in-progress", "preparedStaticAssets": len(runtime),
                               "manifest": "runtime/prepared-assets.json", "windowsAcceptance": "not-run",
                               "additionalMapAssetsPrepared": len(prepared_map),
                               "additionalMapManifest": "architecture/prepared-manifest.json",
                               "additionalMapStatus": "produced-see-instance-coverage-evidence",
                               "integrationEvidence": "artifacts/game-progress.md",
                               "statusScope": "production reports only; runtime coverage is not inferred from file counts"},
        "paidJobsSubmitted": len({t["taskId"] for t in accepted_tasks if t.get("provider", {}).get("consumed_credit", 0) > 0})
                             + len({a["task_id"] for a in props["assets"] if a.get("task_id")}) + len(maps["assets"]) + len(additional_tasks) + (2 if tactical else 0),
        "characterJobs": [{"assetId": a["id"], "stage": t["role"], "taskId": t["taskId"],
                           "state": t["state"], "credits": t.get("provider", {}).get("consumed_credit")}
                          for a in chars["assets"] for t in a.get("tasks", []) if t.get("taskId")],
        "reports": {name: f"{name}/report.json" for name in ("characters", "props", "hyper3d")},
    })
    status["providers"]["mapStructuresAndLandmarks"] = "Hyper3D and Tripo in parallel"
    if tactical:
        status["sharedTacticalAnimations"] = {key: tactical[key] for key in ("adultCount", "childIndependentCount", "clipCount", "totalFrames", "allNumericallyStable", "actualNewCredits")}
        status["sharedTacticalAnimations"].update({"status": "produced-see-runtime-integration-evidence", "visualAcceptance": "See artifacts/game-progress.md for enabled bodies/states and revision-specific evidence; production counts do not approve full motion or contact.",
                                                  "report": "characters/tactical-animations/verification-summary.json", "skinRisk": tactical["skinRisk"]})
    status["reports"]["architecture"] = "architecture/report.json"
    write(BATCH / "production-status.json", status)
    char_by_id = {a["id"]: a for a in chars["assets"]}
    for entry in roster:
        char = char_by_id.get(entry["id"])
        if char:
            entry["production"] = "模型已下载" if char.get("sourceModelUrl") else char["status"]
            entry["rig"] = "41骨绑定已下载；显式语义映射完整" if char["status"] == "rig-downloaded" else char["status"]
            entry["animation"] = "新增17个共用动作片段已按目标骨架烘焙；完整动作及持枪接触待实景验收" if tactical else ("同一canonical步行已数值检查及Three.js播放检查" if entry["id"] in ("CH-LU", "CH-ZHOU") else "共享成人动作待逐体型适配验收")
            entry["runtime"] = "主游戏接入版本与验收状态见 artifacts/game-progress.md；本表只记录资产生产"
        elif entry["id"] == "CH-CROWD":
            entry["production"] = "复用已有人物资产；不另建路人模型"
            entry["rig"] = "复用成人绑定"
    write(REVIEW / "core-roster.json", roster)
    print(json.dumps({"catalogEntries": len(entries), "characterModels": model_count, "rigs": rig_count,
                      "props": prop_count, "maps": map_count, "runtimeCopies": len(runtime)}))


if __name__ == "__main__":
    main()

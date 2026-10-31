#!/usr/bin/env python3
"""Freeze the runtime input of a dirty candidate without editing its checkout."""
import argparse
import hashlib
import json
import pathlib
import shutil
import subprocess
from datetime import datetime
from zoneinfo import ZoneInfo

parser = argparse.ArgumentParser()
parser.add_argument("--source", required=True, type=pathlib.Path)
parser.add_argument("--destination", required=True, type=pathlib.Path)
parser.add_argument("--manifest", required=True, type=pathlib.Path)
args = parser.parse_args()
source, destination = args.source.resolve(), args.destination.resolve()
if source == destination or destination.exists():
    raise SystemExit("Destination must be a new directory distinct from the source")
roots = ["src", "public", "tests", "scripts", "package.json", "package-lock.json", "tsconfig.json", "vite.config.ts", "index.html"]

def digest(root):
    entries = {}
    for name in roots:
        item = root / name
        files = [item] if item.is_file() else sorted(item.rglob("*"))
        for file in files:
            if file.is_file():
                data = file.read_bytes()
                entries[str(file.relative_to(root))] = {"sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)}
    return entries

before = digest(source)
destination.mkdir(parents=True)
for name in roots:
    item = source / name
    if item.is_dir():
        shutil.copytree(item, destination / name)
    elif item.is_file():
        shutil.copy2(item, destination / name)
copied, after = digest(destination), digest(source)
if before != copied or before != after:
    raise SystemExit("Candidate changed during snapshot; snapshot is not validated. Preserve it and use a new destination to retry.")
aggregate = hashlib.sha256(json.dumps(copied, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
git = lambda *argv: subprocess.check_output(["git", "-C", str(source), *argv], text=True).strip()
manifest = {
    "schemaVersion": 1,
    "capturedAt": datetime.now(ZoneInfo("Asia/Shanghai")).isoformat(),
    "sourceRoot": str(source), "frozenRoot": str(destination),
    "sourceCommit": git("rev-parse", "HEAD"), "sourceBranch": git("branch", "--show-current"),
    "sourceStatus": git("status", "--short").splitlines(),
    "aggregateSha256": aggregate, "fileCount": len(copied),
    "runtimeSnapshotVerified": True, "files": copied,
    "dependencyRoot": str(source / "node_modules"),
    "limitations": ["Dirty candidate snapshot, not a release commit", "Installed dependencies are shared by symlink and treated as read-only by convention; test/browser caches must be separate; package-lock.json is frozen", "No dist, private data, production originals, or untracked art/audio work copied"]
}
(destination / "node_modules").symlink_to(source / "node_modules", target_is_directory=True)
args.manifest.parent.mkdir(parents=True, exist_ok=True)
args.manifest.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
print(json.dumps({k: manifest[k] for k in ["capturedAt", "sourceCommit", "aggregateSha256", "fileCount", "frozenRoot"]}, ensure_ascii=False))

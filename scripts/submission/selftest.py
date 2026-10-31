#!/usr/bin/env python3
"""Small audit fixtures only. Writes exclusively below the required --out."""
import argparse
import copy
import importlib.util
import io
import json
from pathlib import Path
import struct
import shutil
import subprocess
import sys
import wave
import zipfile

sys.dont_write_bytecode = True
SCRIPT = Path(__file__).with_name("audit_package.py")
spec = importlib.util.spec_from_file_location("package_audit", SCRIPT)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


def put(root, name, value):
    p = root / name
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(value.encode() if isinstance(value, str) else value)


def glb(doc):
    data = json.dumps(doc).encode()
    data += b" " * (-len(data) % 4)
    return struct.pack("<4sII", b"glTF", 2, 20 + len(data)) + struct.pack("<II", len(data), 0x4E4F534A) + data


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()
    out = args.out.resolve()
    if out.exists():
        parser.error("use a fresh output directory so fixtures cannot overwrite user files")
    out.mkdir(parents=True)
    root = out / "fixture-project"
    root.mkdir()
    checks = []
    def check(name, condition):
        checks.append({"name": name, "pass": bool(condition)})
        if not condition:
            raise AssertionError(name)
    def cli(name, *extra):
        proc = subprocess.run([sys.executable, str(SCRIPT), "--root", str(root), "--out", str(out / name), *extra], capture_output=True, text=True)
        report = out / name / "package-audit.json"
        return proc.returncode, json.loads(report.read_text()) if report.is_file() else None
    try:
        pkg = {"version": "test", "dependencies": {"three": "1", "@dimforge/rapier3d-compat": "2"}, "devDependencies": {"electron": "3"}}
        lock = {"packages": {"node_modules/three": {"version": "1"}, "node_modules/@dimforge/rapier3d-compat": {"version": "2"}}}
        for name in ("src/a.ts", "desktop/main.cjs", "scripts/package-windows.mjs", "scripts/inspect-package.mjs", "index.html", "vite.config.ts", "tsconfig.json"):
            put(root, name, "fixture\n")
        put(root, "package.json", json.dumps(pkg))
        put(root, "package-lock.json", json.dumps(lock))
        for name, version, title in (("three", "1", "Three"), ("@dimforge/rapier3d-compat", "2", "Rapier")):
            text = "Fixture license: https://example.test/license\n"
            put(root, f"node_modules/{name}/package.json", json.dumps({"version": version}))
            put(root, f"node_modules/{name}/LICENSE", text)
            put(root, f"dist/licenses/dependencies/{title}.txt", text)
        put(root, "dist/index.html", '<script type="module" src="./assets/app.js"></script>')
        put(root, "dist/assets/app.js", 'const x="http://www.w3.org/1999/xhtml"; save.load("campaign"); const e=".css";')
        code, report = cli("valid-web", "--web", "dist")
        check("valid build incl. license URL and non-loader strings", code == 0 and report["status"] == "PASS_STATIC")
        put(root, "dist/assets/app.js", 'fetch("./missing.glb");')
        code, report = cli("missing-reference", "--web", "dist")
        check("missing runtime reference is failure", code == 1 and any(f["code"] == "RESOURCE_MISSING" for f in report["findings"]))
        (root / "empty").mkdir()
        code, report = cli("empty-web", "--web", "empty")
        check("empty directory is not PASS", code == 1)
        code, report = cli("missing-web", "--web", "absent")
        check("missing build is INCOMPLETE", code == 3)
        proc = subprocess.run([sys.executable, str(SCRIPT), "--root", str(out / "absent-root"), "--web", "dist", "--out", str(out / "missing-root")], capture_output=True)
        check("missing project is INCOMPLETE", proc.returncode == 3)
        proc = subprocess.run([sys.executable, str(SCRIPT), "--root", str(root), "--out", str(out / "no-selection")], capture_output=True)
        check("missing input selection has usage exit 3", proc.returncode == 3)
        proc = subprocess.run([sys.executable, str(SCRIPT), "--root", str(root), "--web", "dist", "--out", str(root / "dist" / "overwrite")], capture_output=True)
        check("reports cannot overwrite selected build", proc.returncode == 3 and not (root / "dist/overwrite").exists())
        linked = out / "linked-output"
        linked.mkdir()
        put(out, "sentinel.txt", "unchanged")
        (linked / "package-audit.json").symlink_to(out / "sentinel.txt")
        proc = subprocess.run([sys.executable, str(SCRIPT), "--root", str(root), "--web", "dist", "--out", str(linked)], capture_output=True)
        check("report symlink is rejected without touching target", proc.returncode == 3 and (out / "sentinel.txt").read_text() == "unchanged")
        (out / "sentinel.txt").unlink()
        audit = mod.Audit(root, "fixture")
        audit.glb("good.glb", glb({"asset": {"version": "2.0", "generator": "https://example.test/tool"}}))
        check("GLB generator metadata URL is not a dependency", not audit.findings and audit.result["glb"][0]["status"] == "PASS_HEADER")
        put(root, "vendor-runtime/assets/tripo/hero.glb", glb({"asset": {"version": "2.0"}}))
        audit = mod.Audit(root, "fixture")
        vendor_files = audit.tree(root / "vendor-runtime", "web")
        check("approved runtime may use a vendor-named directory", "assets/tripo/hero.glb" in vendor_files and not audit.findings)
        for uri in ("https://example.test/texture.png", "../texture.png", "/Users/example/texture.png"):
            audit = mod.Audit(root, "fixture")
            audit.glb("external.glb", glb({"asset": {"version": "2.0"}, "images": [{"uri": uri}]}))
            check("GLB external dependency blocked: " + mod.clean_uri(uri), any(f["code"] == "GLB_EXTERNAL_DEPENDENCY" for f in audit.findings))
        audit = mod.Audit(root, "fixture")
        audit.glb("bad.glb", b"broken")
        check("corrupt GLB is failure", any(f["code"] == "INVALID_GLB" for f in audit.findings))
        audit = mod.Audit(root, "fixture")
        for uri in ("https://example.test/asset.glb", "/models/weapon.glb", "../escape.glb"):
            audit.scan_text(root, "app.js", ('fetch(' + json.dumps(uri) + ')').encode(), {})
        check("remote, site-absolute and escaping references fail", len([f for f in audit.findings if f["severity"] == "error"]) == 3)
        put(root, "node_modules/@dimforge/rapier3d-compat/dist/rapier_wasm3d_bg.wasm", b"\0asm\x01\0\0\0")
        audit = mod.Audit(root, "fixture")
        audit.scan_text(root, "app.js", b'init({module_or_path:B.toByteArray("AGFzbQEAAAA=")}); function unused(){new URL("rapier_wasm3d_bg.wasm","<deleted>");} const imports={"./rapier_wasm3d_bg.js":{}};', {})
        check("Rapier compat exemption needs exact embedded WASM", not audit.findings and audit.result["checks"]["rapierEmbeddedWasm"][0]["matchesInstalled"])
        audit = mod.Audit(root, "fixture")
        audit.scan_text(root, "app.js", b'new URL("rapier_wasm3d_bg.wasm","<deleted>")', {})
        check("unproven WASM fallback is not exempt", any(f["code"] == "RESOURCE_MISSING" for f in audit.findings))
        audit = mod.Audit(root, "fixture")
        audit.scan_text(root, "assets/app.js", b'const base = new URL("./", document.baseURI);', {"index.html": {}})
        check("document-relative directory base is not a missing JS-adjacent file", not audit.findings)
        audit = mod.Audit(root, "fixture")
        audit.scan_text(root, "assets/app.js", b'fetch("./"); new URL("./missing.glb", document.baseURI);', {"index.html": {}})
        check("directory fetch and missing actual file still fail", len([f for f in audit.findings if f["code"] == "RESOURCE_MISSING"]) == 2)
        buf = io.BytesIO()
        with wave.open(buf, "wb") as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(48000); w.writeframes(b"\0\0" * 100)
        audit = mod.Audit(root, "fixture")
        audit.audio_header("sample.wav", buf.getvalue(), {"channels": 2})
        check("audio manifest discrepancy fails", any(f["code"] == "AUDIO_MANIFEST_MISMATCH" for f in audit.findings))
        put(root, "audio-empty/manifest.json", '{"assets":[]}')
        code, report = cli("empty-audio", "--audio-manifest", "audio-empty/manifest.json")
        check("empty audio manifest is not PASS", code == 1)
        # The independent narration batch is distinct from the existing SFX/music schema.
        audio_base = "audio/chapter-bridge-01/"
        manifest_name = "public/" + audio_base + "manifest.json"
        mp3 = b"\xff\xfb\xb4\xc0" + b"\0" * 572  # one synthetic MPEG frame; no listening claim
        source_digest, voice_digest = mod.sha(b"fixture source"), mod.sha(b"fixture voice")
        assets = []
        for index in (1, 2):
            cue = f"opening-fixture-{index:02d}"
            text = f"Fixture line {index}."
            assets.append({"cueId": cue, "sequenceId": "opening-fixture", "text": text,
                           "file": f"audio/opening-fixture/{cue}.t01.mp3", "durationSeconds": 0.024,
                           "bytes": len(mp3), "sha256": mod.sha(mp3), "sourceTextSha256": mod.sha(text.encode()),
                           "sourceFileSha256": source_digest, "referenceSha256": voice_digest, "speakerId": "fixture"})
        narration = {"schemaVersion": 1, "batch": "chapter-bridge-01", "expectedCueCount": 2, "complete": True,
                     "sourceTextSha256": source_digest, "sourceTextHashes": [{"path": "src/narration.json", "sha256": source_digest}],
                     "productionListSha256": mod.sha(b"fixture production list"),
                     "voice": {"speakerId": "fixture", "selection": "fixture", "referenceSha256": voice_digest},
                     "producer": {"model": "fixture", "revision": "fixture", "method": "fixture"},
                     "authorization": {"userMessage": "Synthetic selftest only", "scope": "Synthetic selftest only"}, "assets": assets}
        for prefix in ("public/", "dist/"):
            put(root, prefix + audio_base + "README.txt", "Synthetic narration fixture, not a production asset.\n")
            for asset in assets:
                put(root, prefix + audio_base + asset["file"], mp3)
        def write_narration(value):
            for prefix in ("public/", "dist/"):
                put(root, prefix + audio_base + "manifest.json", json.dumps(value))
        app = 'const files=' + json.dumps([a["file"] for a in assets]) + '; function base(e=document.baseURI){return new URL("' + audio_base + '",e)}'
        put(root, "dist/assets/app.js", app)
        write_narration(narration)
        code, report = cli("narration-valid", "--web", "dist", "--audio-manifest", manifest_name)
        check("explicit narration schema maps exact relative files and a real directory base", code == 0 and report["checks"]["audioManifest"]["buildComparisons"][0]["matchedFiles"] == 4)
        check("narration manifest does not require unrelated SFX/music metadata", not any(f["code"] == "MISSING_FILE" for f in report["findings"]))
        code, report = cli("narration-no-explicit-manifest", "--web", "dist")
        check("catalog remapping is not inferred without an explicit validated manifest", code == 1 and any(f["code"] == "RESOURCE_MISSING" for f in report["findings"]))
        target = assets[0]["file"]
        (root / ("public/" + audio_base + target)).unlink()
        code, report = cli("narration-missing-original", "--web", "dist", "--audio-manifest", manifest_name)
        check("missing source MP3 fails", code == 1 and any(f["code"] == "MISSING_FILE" for f in report["findings"]))
        put(root, "public/" + audio_base + target, mp3)
        (root / ("dist/" + audio_base + target)).unlink()
        code, report = cli("narration-missing-build", "--web", "dist", "--audio-manifest", manifest_name)
        check("missing packaged MP3 fails", code == 1 and any(f["code"] == "AUDIO_BUILD_MISSING" for f in report["findings"]))
        put(root, "dist/" + audio_base + target, mp3 + b"changed")
        code, report = cli("narration-changed-build", "--web", "dist", "--audio-manifest", manifest_name)
        check("packaged MP3 hash/bytes mismatch fails", code == 1 and any(f["code"] == "AUDIO_BUILD_MISMATCH" for f in report["findings"]))
        put(root, "dist/" + audio_base + target, mp3)
        mutations = [
            ("duplicate-cue", lambda m: m["assets"][1].update(cueId=m["assets"][0]["cueId"]), "AUDIO_DUPLICATE_ID"),
            ("wrong-sha", lambda m: m["assets"][0].update(sha256="0" * 64), "AUDIO_MANIFEST_MISMATCH"),
            ("wrong-bytes", lambda m: m["assets"][0].update(bytes=1), "AUDIO_MANIFEST_MISMATCH"),
            ("escape", lambda m: m["assets"][0].update(file="../outside.mp3"), "AUDIO_RUNTIME_PATH"),
            ("encoded-escape", lambda m: m["assets"][0].update(file="%2e%2e/outside.mp3"), "AUDIO_RUNTIME_PATH"),
            ("remote", lambda m: m["assets"][0].update(file="https://provider.test/file.mp3"), "AUDIO_RUNTIME_PATH"),
            ("unknown-schema", lambda m: m.update(batch="unknown-narration"), "NARRATION_MANIFEST_SCHEMA"),
            ("credential", lambda m: m.update(api_key="fixture-secret-do-not-print"), "SENSITIVE_METADATA_FIELD"),
            ("signed-url", lambda m: m.update(note="https://provider.test/file?token=fixture-secret-do-not-print"), "SENSITIVE_PAYLOAD_PATTERN"),
        ]
        for name, mutate, error in mutations:
            bad = copy.deepcopy(narration); mutate(bad); write_narration(bad)
            code, report = cli("narration-" + name, "--web", "dist", "--audio-manifest", manifest_name)
            check("narration rejects " + name, code == 1 and any(f["code"] == error for f in report["findings"]))
            check("narration failure does not expose secret values: " + name, "fixture-secret-do-not-print" not in json.dumps(report))
        write_narration(narration)
        for name, extra in (
            ("directory-fetch", 'fetch("' + audio_base + '");'),
            ("missing-slash", 'new URL("' + audio_base.rstrip("/") + '",document.baseURI);'),
            ("arbitrary-directory", 'new URL("' + audio_base + 'audio/",document.baseURI);'),
            ("remote-directory-origin", 'new URL("' + audio_base + '","https://provider.test/");'),
            ("unknown-directory-origin", 'new URL("' + audio_base + '",unknownBase);'),
            ("unknown-file", 'const other="audio/unknown.mp3";'),
        ):
            put(root, "dist/assets/app.js", app + extra)
            code, report = cli("narration-" + name, "--web", "dist", "--audio-manifest", manifest_name)
            check("narration mapping does not exempt " + name, code == 1 and any(f["code"] == "RESOURCE_MISSING" for f in report["findings"]))
        put(root, "dist/assets/app.js", app)
        legacy = {"assets": [{"id": "legacy-sfx", "cueId": "legacy-event", "file": "sample.mp3", "sha256": mod.sha(mp3), "bytes": len(mp3),
                              "sources": [{"author": "fixture", "license": "fixture", "source_id": "fixture"}]}]}
        put(root, "legacy-audio/manifest.json", json.dumps(legacy)); put(root, "legacy-audio/sample.mp3", mp3)
        for path in ("CREDITS.md", "README.md", "sfx-provenance.json", "music-provenance.json"):
            put(root, "legacy-audio/" + path, "{}")
        code, report = cli("legacy-audio-unchanged", "--audio-manifest", "legacy-audio/manifest.json")
        check("legacy id plus cueId remains the SFX/music schema", code == 0)
        (root / "legacy-audio/CREDITS.md").unlink()
        code, report = cli("legacy-audio-missing-credit", "--audio-manifest", "legacy-audio/manifest.json")
        check("legacy metadata requirements are not relaxed", code == 1 and any(f["code"] == "MISSING_FILE" for f in report["findings"]))
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as z:
            z.writestr("../escape.txt", "not read")
            z.writestr("assets/source/tripo/task.json", "not read")
        audit = mod.Audit(root, "fixture")
        with zipfile.ZipFile(io.BytesIO(buf.getvalue())) as z:
            entries = audit.archive_members(z, "fixture.zip")
        check("unsafe/private archive members never inventoried", not entries and any(f["code"] == "UNSAFE_ARCHIVE_MEMBER" for f in audit.findings))
    except Exception as exc:
        checks.append({"name": "selftest stopped: " + type(exc).__name__, "pass": False})
    success = all(c["pass"] for c in checks)
    result = {"status": "PASS" if success else "FAIL", "scope": "Audit tool fixtures, not game tests", "checks": checks}
    (out / "package-audit-selftest.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    if success:
        # --out was required to be fresh; these are only this test's generated data.
        # Retain the compact evidence, not synthetic licenses/source fixtures.
        for p in out.iterdir():
            if p.is_dir():
                shutil.rmtree(p)
    print(json.dumps({"status": result["status"], "checks": len(checks), "report": str(out / "package-audit-selftest.json")}))
    return 0 if success else 1


if __name__ == "__main__":
    sys.exit(main())

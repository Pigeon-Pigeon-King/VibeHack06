#!/usr/bin/env python3
"""Small audit fixtures only. Writes exclusively below the required --out."""
import argparse
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
        buf = io.BytesIO()
        with wave.open(buf, "wb") as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(48000); w.writeframes(b"\0\0" * 100)
        audit = mod.Audit(root, "fixture")
        audit.audio_header("sample.wav", buf.getvalue(), {"channels": 2})
        check("audio manifest discrepancy fails", any(f["code"] == "AUDIO_MANIFEST_MISMATCH" for f in audit.findings))
        put(root, "audio-empty/manifest.json", '{"assets":[]}')
        code, report = cli("empty-audio", "--audio-manifest", "audio-empty/manifest.json")
        check("empty audio manifest is not PASS", code == 1)
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

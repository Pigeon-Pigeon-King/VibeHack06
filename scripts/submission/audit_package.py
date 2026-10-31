#!/usr/bin/env python3
"""Read-only, standard-library audit of explicitly selected delivery inputs.

This is a static packaging check, never a game/runtime or legal acceptance.
Only reports are written, exclusively below --out. See README.md for limits.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
import os
import posixpath
import re
import struct
import subprocess
import sys
import stat
import tempfile
import time
import wave
import zipfile
from collections import Counter
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path, PurePosixPath
from urllib.parse import unquote, urlsplit

VERSION = "1.0.1"
MAX_TEXT = 24 * 1024 * 1024
MAX_MEMBER = 768 * 1024 * 1024
MAX_ARCHIVE = 3 * 1024 * 1024 * 1024
AUDIO_EXT = {".wav", ".ogg", ".mp3", ".m4a", ".aac", ".flac", ".opus"}
TEXT_EXT = {".html", ".js", ".mjs", ".cjs", ".css", ".ts", ".json"}
FORBIDDEN_PARTS = {".git", ".nativue", ".tools", ".ssh", ".aws", ".zero", "private", "credentials", "node_modules", "provider-responses", "raw-responses"}
FORBIDDEN_NAMES = re.compile(r"^(?:\.env(?:\..*)?|credentials?(?:\..*)?|id_rsa|id_ed25519)$|\.(?:pem|key|p12|pfx|safetensors|ckpt|blend|fbx)$", re.I)
RESOURCE_EXT = re.compile(r"\.(?:glb|gltf|bin|wasm|png|jpe?g|webp|avif|ktx2?|hdr|wav|ogg|mp3|m4a|aac|flac|opus|woff2?|ttf|css|js)(?:[?#].*)?$", re.I)
QUOTED = re.compile(r'''(["'`])([^"'`\r\n]{1,700})\1''')
PROPERTY_COLON = re.compile(r"\s*:")
SECRET_KEYS = re.compile(r"^(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|authorization|password|private[_-]?key)$", re.I)
SENSITIVE_URL = re.compile(r"(?:[?&](?:X-Amz-Signature|X-Goog-Signature|Signature|token|access_token|api_key)=)", re.I)


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def safe_name(name: str) -> bool:
    return bool(name) and "\\" not in name and not name.startswith("/") and not re.match(r"^[A-Za-z]:", name) and all(p not in {"", ".", ".."} for p in name.split("/"))


def forbidden(name: str) -> bool:
    # A vendor name is not a ban on its approved runtime output. Raw source
    # archives are excluded by their role/path; the explicit F-35B component
    # archive has a separate allowlist below.
    return (re.search(r"(?:^|/)assets/source(?:/|$)", name, re.I) is not None
            or any(p.lower() in FORBIDDEN_PARTS or FORBIDDEN_NAMES.search(p) for p in name.split("/")))


def clean_uri(value: str) -> str:
    """Never put credentials, URL query values, or source text in reports."""
    if value.startswith("data:"):
        return "data:<embedded>"
    if value.startswith("blob:"):
        return "blob:<runtime>"
    try:
        u = urlsplit(value)
        if u.scheme or u.netloc:
            host = u.hostname or ""
            return f"{u.scheme or 'https'}://{host}{u.path}" + ("?<redacted>" if u.query else "")
    except ValueError:
        return "<invalid-uri>"
    return value.split("?", 1)[0].split("#", 1)[0][:300]


class Audit:
    def __init__(self, root: Path, label: str):
        self.root = root
        self.findings = []
        self.seen = {}
        self.inventory = {"source": [], "web": [], "windows": [], "audio": []}
        self.result = {
            "schemaVersion": 1, "toolVersion": VERSION, "toolSha256": sha(Path(__file__).read_bytes()), "label": label,
            "recordedUtc": datetime.now(timezone.utc).isoformat(), "root": str(root),
            "python": sys.version.split()[0], "windowsRuntime": "NOT_RUN",
            "browserRuntime": "NOT_RUN", "sourceBuildCorrespondence": "NOT_REBUILT",
            "scope": "Static files, headers, references, provenance and package integrity only",
            "limits": ["No rendering, decoding/playback, first-run, network trace, or target-device test.",
                       "Static JavaScript matching does not resolve arbitrary computed URLs or every bundler transform.",
                       "A source snapshot does not prove these sources compiled to an existing build.",
                       "License/source presence and exact copies do not decide legal sufficiency or the whole-game license.",
                       "Raw provider responses, credential directories, model caches and unlisted originals are not inventoried."],
            "checks": {}, "references": [], "glb": [], "audioHeaders": [], "licenseCopies": [],
        }

    def finding(self, severity, code, path, message):
        entry = {"severity": severity, "code": code, "path": path, "message": message}
        if entry not in self.findings:
            self.findings.append(entry)

    def read(self, base: Path, name: str, limit=MAX_MEMBER):
        if not safe_name(name):
            self.finding("error", "UNSAFE_PATH", "<redacted>", "Relative path escapes its selected input.")
            return None
        path = base / name
        try:
            if path.is_symlink() or not path.resolve().is_relative_to(base.resolve()):
                raise ValueError("symlink or path escape")
            if not path.is_file():
                self.finding("error", "MISSING_FILE", name, "Required input file is absent.")
                return None
            before = path.stat()
            if before.st_size > limit:
                self.finding("error", "READ_LIMIT", name, "Input exceeds the documented audit read limit; it was not skipped as PASS.")
                return None
            data = path.read_bytes()
            after = path.stat()
            if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
                self.finding("error", "INPUT_CHANGED", name, "File changed during audit; rerun a frozen candidate.")
            digest = sha(data)
            key = str(path.resolve())
            if key in self.seen and self.seen[key] != digest:
                self.finding("error", "INPUT_CHANGED", name, "Repeated reads differ within this audit; rerun a frozen candidate.")
            self.seen[key] = digest
            return data
        except (OSError, ValueError):
            self.finding("error", "INPUT_UNREADABLE", name, "Cannot safely read this input.")
            return None

    def record(self, group, name, data):
        row = {"path": name, "bytes": len(data), "sha256": sha(data)}
        if row not in self.inventory[group]:
            self.inventory[group].append(row)
        return row

    def tree(self, base: Path, group: str):
        files = {}
        if not base.is_dir() or base.is_symlink():
            self.finding("error", "INPUT_MISSING", str(base), "Selected directory is absent or a symlink.")
            return files
        for directory, dirs, names in os.walk(base, followlinks=False):
            for name in sorted(dirs + names):
                p = Path(directory) / name
                rel = p.relative_to(base).as_posix()
                if p.is_symlink() or forbidden(rel):
                    self.finding("error", "EXCLUDED_UNSAFE_CONTENT", rel, "Not read or inventoried; this content must not enter a delivery package.")
                    if name in dirs:
                        dirs.remove(name)
                    continue
                if p.is_file():
                    data = self.read(base, rel)
                    if data is not None:
                        files[rel] = self.record(group, rel, data)
        return files

    def source_snapshot(self):
        for directory in ("src", "desktop"):
            base = self.root / directory
            if not base.is_dir():
                self.finding("error", "SOURCE_DIRECTORY_MISSING", directory, "Required source tree is absent.")
                continue
            for parent, dirs, names in os.walk(base, followlinks=False):
                dirs[:] = [d for d in dirs if not forbidden(d) and not (Path(parent) / d).is_symlink()]
                for name in sorted(names):
                    p = Path(parent) / name
                    rel = p.relative_to(self.root).as_posix()
                    if p.is_symlink() or forbidden(rel):
                        self.finding("error", "SOURCE_SKIPPED_UNSAFE", rel, "Excluded from source snapshot.")
                        continue
                    data = self.read(self.root, rel)
                    if data is not None:
                        self.record("source", rel, data)
        for name in ("package.json", "package-lock.json", "index.html", "vite.config.ts", "tsconfig.json", "scripts/package-windows.mjs", "scripts/inspect-package.mjs"):
            data = self.read(self.root, name)
            if data is not None:
                self.record("source", name, data)
        try:
            head = subprocess.run(["git", "-C", str(self.root), "rev-parse", "HEAD"], check=True, capture_output=True, text=True, timeout=10).stdout.strip()
            state = subprocess.run(["git", "-C", str(self.root), "status", "--porcelain", "--untracked-files=no"], check=True, capture_output=True, timeout=10).stdout
            self.result["git"] = {"head": head, "trackedDirty": bool(state), "untrackedPathsListed": False}
        except (OSError, subprocess.SubprocessError):
            self.finding("review", "GIT_NOT_RECORDED", "git", "No Git revision could be recorded.")

    def json(self, data, name):
        try:
            return json.loads(data)
        except (ValueError, TypeError, UnicodeDecodeError):
            self.finding("error", "INVALID_JSON", name, "Cannot parse required JSON.")
            return None

    def check_ref(self, base, name, uri, kind, available):
        if not uri or uri.startswith(("#", "data:", "blob:")):
            return
        uri = uri.replace("\\/", "/")
        redacted = clean_uri(uri)
        try:
            u = urlsplit(uri)
        except ValueError:
            self.finding("error", "INVALID_RESOURCE_URI", name, "Invalid static resource URI.")
            return
        row = {"from": name, "uri": redacted, "kind": kind}
        if u.scheme or u.netloc or uri.startswith("//"):
            self.finding("error", "NONPORTABLE_RUNTIME_URI", name, f"Runtime dependency is remote or absolute: {redacted}")
            row["status"] = "FAIL"
        elif uri.startswith("/") or re.match(r"^[A-Za-z]:", uri) or "\\" in uri:
            self.finding("error", "ABSOLUTE_RUNTIME_PATH", name, "Runtime dependency uses an absolute filesystem/site-root path.")
            row["status"] = "FAIL"
        else:
            decoded = unquote(u.path)
            target = posixpath.normpath(posixpath.join(posixpath.dirname(name), decoded))
            # A public/runtimePath catalog literal is resolved from the application base.
            candidates = [target]
            if kind in {"catalog", "resource-literal"}:
                candidates.append(posixpath.normpath(decoded))
            hit = next((p for p in candidates if safe_name(p) and p in available), None)
            row["resolved"] = hit or target
            row["status"] = "PRESENT" if hit else "MISSING"
            if not hit:
                self.finding("error", "RESOURCE_MISSING", name, f"Static resource does not resolve within the selected build: {redacted}")
        if row not in self.result["references"]:
            self.result["references"].append(row)

    def scan_text(self, base, name, data, available):
        if len(data) > MAX_TEXT:
            self.finding("error", "TEXT_SCAN_LIMIT", name, "Runtime text exceeds scan bound.")
            return
        try:
            text = data.decode("utf-8")
        except UnicodeDecodeError:
            self.finding("error", "TEXT_DECODE", name, "Runtime text is not UTF-8.")
            return
        if SENSITIVE_URL.search(text) or re.search(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----", text):
            self.finding("error", "SENSITIVE_PAYLOAD_PATTERN", name, "Potential signed URL or private key detected; value omitted.")
        ext = Path(name).suffix.lower()
        if ext == ".html":
            refs = []
            class Parser(HTMLParser):
                def handle_starttag(self, tag, attrs):
                    a = dict(attrs)
                    if tag in {"script", "img", "audio", "video", "source", "track", "iframe", "embed", "input"} and a.get("src"):
                        refs.append((a["src"], "html"))
                    if tag == "link" and a.get("href") and any(v in a.get("rel", "").split() for v in {"stylesheet", "preload", "modulepreload", "icon", "manifest"}):
                        refs.append((a["href"], "html"))
                    if tag == "video" and a.get("poster"):
                        refs.append((a["poster"], "html"))
                    if a.get("srcset"):
                        refs.extend((item.strip().split()[0], "html-srcset") for item in a["srcset"].split(",") if item.strip())
            Parser().feed(text)
            for uri, kind in refs:
                self.check_ref(base, name, uri, kind, available)
        if ext in {".css", ".html"}:
            for m in re.finditer(r'''url\(\s*["']?([^\s)'";]+)|@import\s+["']([^"']+)''', text):
                self.check_ref(base, name, m.group(1) or m.group(2), "css", available)
        if ext in {".js", ".mjs", ".cjs"}:
            # Rapier compat retains an unused external-WASM default and an import-object
            # key. Exempt the default only after proving the packaged embedded bytes
            # exactly match the pinned installed WASM, not merely finding its name.
            embedded_rapier = False
            encoded = re.search(r'''module_or_path\s*:\s*[\w$]+\.toByteArray\((["'`])(AGFzbQE[A-Za-z0-9+/=]+)\1\)''', text)
            if encoded:
                wasm_name = "node_modules/@dimforge/rapier3d-compat/dist/rapier_wasm3d_bg.wasm"
                installed = self.read(self.root, wasm_name)
                try:
                    wasm = base64.b64decode(encoded.group(2), validate=True)
                    embedded_rapier = installed is not None and wasm == installed and wasm[:8] == b"\0asm\x01\0\0\0"
                    self.result["checks"].setdefault("rapierEmbeddedWasm", []).append({"bundle": name, "bytes": len(wasm), "sha256": sha(wasm), "matchesInstalled": embedded_rapier})
                    if not embedded_rapier:
                        self.finding("error", "EMBEDDED_WASM_MISMATCH", name, "Embedded Rapier WASM differs from the selected installed binary.")
                except ValueError:
                    self.finding("error", "EMBEDDED_WASM_INVALID", name, "Cannot decode embedded Rapier WASM.")
            # Restrict loader calls to literal arguments. Never eval/import game code.
            calls = r'''(?:\bimport\s*\(|\bfetch\s*\(|\bnew\s+(?:URL|Audio|Worker)\s*\(|\.(?:load|loadAsync|setDecoderPath|setTranscoderPath)\s*\()\s*(["'`])([^"'`\r\n]+)\1'''
            found = set()
            for m in re.finditer(calls, text):
                uri = m.group(2)
                call = m.group(0)
                # Vite's relative BASE_URL is an origin for later asset URLs,
                # not a request for a file named './' beside the JS chunk.
                if uri in {".", "./"} and re.match(r"\bnew\s+URL\s*\(", call) and re.match(
                    r"\s*,\s*document\.baseURI\s*\)", text[m.end():]
                ):
                    found.add(uri)
                    self.check_ref(base, "index.html", "index.html", "document-directory-base", available)
                    continue
                if re.match(r"\.(?:load|loadAsync)\s*\(", call) and not RESOURCE_EXT.search(uri) and "/" not in uri:
                    continue  # e.g. the application's save.load('campaign') is not a fetch.
                if uri == "rapier_wasm3d_bg.wasm" and embedded_rapier:
                    continue
                if "${" in uri:
                    self.finding("review", "DYNAMIC_RESOURCE_TEMPLATE", name, "Computed URL requires a runtime request trace.")
                    continue
                found.add(uri)
                self.check_ref(base, name, uri, "loader-literal", available)
            for m in re.finditer(r'''\b(?:from|import)\s*(["'])([^"']+)\1''', text):
                if m.group(2).startswith((".", "/", "http:", "https:")):
                    found.add(m.group(2))
                    self.check_ref(base, name, m.group(2), "module", available)
            # Covers minified runtimePath catalogs and Vite lazy-chunk dependency arrays.
            for m in QUOTED.finditer(text):
                uri = m.group(2)
                if uri in found or "${" in uri or any(c.isspace() for c in uri) or not RESOURCE_EXT.search(uri):
                    continue
                if PROPERTY_COLON.match(text, m.end()) or re.fullmatch(r"\.[A-Za-z0-9]+", uri):
                    continue  # object keys / file-extension tests, not runtime resources.
                if uri.startswith(("assets/source/", "src/")) or re.match(r"^https?://(?:threejs.org|www.w3.org|github.com)/", uri):
                    continue  # Metadata/docs strings are not evidence of a fetch.
                if "/" in uri or uri.startswith("."):
                    self.check_ref(base, name, uri, "resource-literal", available)

    def glb(self, name, data):
        row = {"path": name, "bytes": len(data), "sha256": sha(data), "status": "FAIL"}
        self.result["glb"].append(row)
        try:
            if len(data) < 20:
                raise ValueError("header truncated")
            magic, version, length = struct.unpack_from("<4sII", data)
            if magic != b"glTF" or version != 2 or length != len(data):
                raise ValueError("GLB magic/version/declared length mismatch")
            chunks, pos = [], 12
            while pos < length:
                if pos + 8 > length:
                    raise ValueError("truncated chunk header")
                size, kind = struct.unpack_from("<II", data, pos)
                pos += 8
                if size % 4 or pos + size > length:
                    raise ValueError("chunk alignment or bounds invalid")
                chunks.append((kind, data[pos:pos + size]))
                pos += size
            if not chunks or chunks[0][0] != 0x4E4F534A or sum(c[0] == 0x4E4F534A for c in chunks) != 1:
                raise ValueError("GLB requires one leading JSON chunk")
            doc = json.loads(chunks[0][1].decode("utf-8").rstrip(" \x00"))
            if doc.get("asset", {}).get("version") != "2.0":
                raise ValueError("glTF asset version is not 2.0")
            bins = [c[1] for c in chunks if c[0] == 0x004E4942]
            buffers = doc.get("buffers", [])
            if len(bins) > 1 or any(int(b.get("byteLength", -1)) < 0 for b in buffers):
                raise ValueError("invalid buffers")
            external = []
            for category in ("buffers", "images"):
                for item in doc.get(category, []):
                    uri = item.get("uri")
                    if uri and not uri.startswith("data:"):
                        external.append(clean_uri(uri))
            if external:
                self.finding("error", "GLB_EXTERNAL_DEPENDENCY", name, "Current runtime requires embedded GLB; external URI values: " + ", ".join(external))
            for i, buf in enumerate(buffers):
                if "uri" not in buf and (i != 0 or not bins or not (0 <= len(bins[0]) - int(buf["byteLength"]) <= 3)):
                    raise ValueError("embedded buffer length mismatch")
            for view in doc.get("bufferViews", []):
                b = view.get("buffer", -1)
                offset, size = view.get("byteOffset", 0), view.get("byteLength", -1)
                if b < 0 or b >= len(buffers) or offset < 0 or size < 0 or offset + size > buffers[b]["byteLength"]:
                    raise ValueError("bufferView out of bounds")
            for image in doc.get("images", []):
                if "bufferView" in image and not 0 <= image["bufferView"] < len(doc.get("bufferViews", [])):
                    raise ValueError("image bufferView invalid")
            extensions = sorted(set(doc.get("extensionsUsed", []) + doc.get("extensionsRequired", [])))
            decoders = {"KHR_draco_mesh_compression", "EXT_meshopt_compression", "KHR_texture_basisu"} & set(extensions)
            if decoders:
                self.finding("error", "UNCONFIGURED_GLB_DECODER", name, "Current project has no configured decoder for: " + ", ".join(sorted(decoders)))
            row.update({"status": "PASS_HEADER" if not external and not decoders else "FAIL", "version": version, "externalUris": external,
                        "extensions": extensions, "images": len(doc.get("images", [])), "meshes": len(doc.get("meshes", [])),
                        "skins": len(doc.get("skins", [])), "animations": len(doc.get("animations", [])), "decoded": False})
        except (ValueError, TypeError, KeyError, IndexError, struct.error, UnicodeDecodeError):
            self.finding("error", "INVALID_GLB", name, "GLB header, chunk, embedded buffer or JSON structural check failed.")

    def audio_header(self, name, data, expected=None):
        row = {"path": name, "bytes": len(data), "sha256": sha(data), "decodePlayback": "NOT_RUN"}
        try:
            ext = Path(name).suffix.lower()
            if ext == ".wav":
                if len(data) < 12 or data[:4] != b"RIFF" or data[8:12] != b"WAVE" or struct.unpack_from("<I", data, 4)[0] + 8 != len(data):
                    raise ValueError("invalid RIFF/WAVE length")
                with wave.open(io.BytesIO(data), "rb") as w:
                    row.update({"format": "WAV/" + w.getcomptype(), "channels": w.getnchannels(), "sample_rate": w.getframerate(), "frames": w.getnframes(), "pcm_bits": w.getsampwidth() * 8})
                    row["duration_s"] = w.getnframes() / w.getframerate()
            elif ext in {".ogg", ".opus"}:
                if len(data) < 28 or data[:4] != b"OggS" or data[4] != 0:
                    raise ValueError("not Ogg")
                count = data[26]
                start = 27 + count
                packet = data[start:start + sum(data[27:start])]
                if packet.startswith(b"\x01vorbis") and len(packet) >= 30:
                    row.update({"format": "Ogg/Vorbis", "channels": packet[11], "sample_rate": struct.unpack_from("<I", packet, 12)[0]})
                elif packet.startswith(b"OpusHead") and len(packet) >= 19:
                    row.update({"format": "Ogg/Opus", "channels": packet[9], "sample_rate": 48000})
                else:
                    raise ValueError("unknown Ogg identification packet")
            elif ext == ".mp3":
                if not (data.startswith(b"ID3") or len(data) > 1 and data[0] == 255 and data[1] & 0xE0 == 0xE0):
                    raise ValueError("missing MP3 signature")
                row["format"] = "MP3/header-only"
            elif ext == ".flac" and data.startswith(b"fLaC"):
                row["format"] = "FLAC/header-only"
            elif ext in {".m4a", ".aac"}:
                if not (len(data) > 12 and data[4:8] == b"ftyp" or len(data) > 2 and data[0] == 255 and data[1] & 0xF6 == 0xF0):
                    raise ValueError("missing AAC/MP4 signature")
                row["format"] = "AAC/MP4/header-only"
            else:
                raise ValueError("unsupported or invalid audio")
            if expected:
                for key in ("bytes", "sha256", "channels", "sample_rate", "frames", "pcm_bits"):
                    if key in expected and key in row and expected[key] != row[key]:
                        self.finding("error", "AUDIO_MANIFEST_MISMATCH", name, f"Measured {key} differs from the manifest.")
            row["status"] = "PASS_HEADER"
        except (ValueError, wave.Error, EOFError, ZeroDivisionError, struct.error):
            row["status"] = "FAIL"
            self.finding("error", "INVALID_AUDIO_HEADER", name, "Audio signature/header check failed.")
        self.result["audioHeaders"].append(row)

    def license_copy(self, package, source_path, build_path, build_files, reader):
        original = self.read(self.root, source_path, MAX_TEXT)
        if original is None:
            return
        self.record("source", source_path, original)
        if build_path not in build_files:
            self.finding("error", "LICENSE_MISSING", build_path, f"Expected verbatim license copy for {package} is absent.")
            return
        copy = reader(build_path)
        same = copy is not None and sha(copy) == sha(original)
        self.result["licenseCopies"].append({"package": package, "source": source_path, "packaged": build_path, "sha256": sha(original), "byteIdentical": same})
        if not same:
            self.finding("error", "LICENSE_CHANGED", build_path, "License copy differs from selected installed/original text.")

    def dependencies(self, files, reader, desktop=False):
        pkg = self.json(self.read(self.root, "package.json"), "package.json")
        lock = self.json(self.read(self.root, "package-lock.json"), "package-lock.json")
        if not pkg or not lock:
            return
        expected = {"three": "Three.txt", "@dimforge/rapier3d-compat": "Rapier.txt"}
        for package in pkg.get("dependencies", {}):
            if package not in expected:
                self.finding("review", "NEW_RUNTIME_DEPENDENCY", package, "Add an explicit license/notice mapping for this runtime dependency.")
        for package, filename in expected.items():
            installed = self.json(self.read(self.root, f"node_modules/{package}/package.json", MAX_TEXT), package)
            pinned = pkg.get("dependencies", {}).get(package)
            locked = lock.get("packages", {}).get(f"node_modules/{package}", {}).get("version")
            if not installed or installed.get("version") != pinned or locked != pinned:
                self.finding("error", "DEPENDENCY_VERSION_MISMATCH", package, "package.json, lockfile and installed dependency versions do not match.")
            path = f"LICENSES/{filename}" if desktop else f"licenses/dependencies/{filename}"
            self.license_copy(package, f"node_modules/{package}/LICENSE", path, files, reader)
            for notice in ("NOTICE", "NOTICE.txt", "NOTICE.md"):
                p = self.root / f"node_modules/{package}/{notice}"
                if p.is_file():
                    text = self.read(self.root, p.relative_to(self.root).as_posix(), MAX_TEXT)
                    if text is not None and not any(r["sha256"] == sha(text) for r in files.values()):
                        self.finding("error", "DEPENDENCY_NOTICE_MISSING", package, "Installed dependency NOTICE has no byte-identical packaged copy.")

    def archive_members(self, archive, name, component_source=False):
        infos = archive.infolist()
        if sum(i.file_size for i in infos) > MAX_ARCHIVE or len(infos) > 30000:
            raise ValueError("archive exceeds limits")
        entries = {}
        for info in infos:
            if info.is_dir():
                continue
            member = info.filename
            symlink = (info.external_attr >> 16) & 0o170000 == 0o120000
            component_prefix = "assets/source/reused-aircraft/vtol-f35b/"
            blocked = forbidden(member[len(component_prefix):]) if component_source and member.startswith(component_prefix) else forbidden(member)
            if not safe_name(member) or blocked or symlink or info.flag_bits & 1:
                self.finding("error", "UNSAFE_ARCHIVE_MEMBER", name, "Unsafe, private, encrypted or symlink member omitted; value not printed.")
                continue
            if member in entries or info.file_size > MAX_MEMBER:
                self.finding("error", "INVALID_ARCHIVE_MEMBER", name, "Duplicate or oversized archive member.")
                continue
            entries[member] = info
        return entries

    def f35_bundle(self, data, name):
        checked, current, upstream = 0, 0, 0
        allowed_prefix = ("src/presentation/reused-aircraft/", "assets/source/reused-aircraft/vtol-f35b/")
        allowed_exact = {"src/presentation/reused-aircraft.ts", "src/presentation/EpilogueAirCover.ts", "src/presentation/DeferredAirCover.ts", "tests/reused-aircraft.test.ts", "tests/epilogue-air-cover.test.ts", "tests/deferred-air-cover.test.ts", "docs/REUSE_MILITARY_AIR_ASSETS.md", "scripts/package-reused-aircraft.py"}
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as z:
                entries = self.archive_members(z, name, component_source=True)
                if "MANIFEST.json" not in entries:
                    raise ValueError("missing manifest")
                manifest = json.loads(z.read("MANIFEST.json"))
                declared = set()
                for entry in manifest["files"]:
                    p = entry["path"]
                    if not safe_name(p) or not (p.startswith(allowed_prefix) or p in allowed_exact):
                        self.finding("error", "SOURCE_BUNDLE_OUTSIDE_ALLOWLIST", name, "Manifest asks for an unapproved source path; not opened.")
                        continue
                    declared.add(p)
                    if p not in entries:
                        self.finding("error", "SOURCE_BUNDLE_MEMBER_MISSING", p, "Declared component source is missing from ZIP.")
                        continue
                    body = z.read(p)  # zipfile also verifies CRC for each read.
                    if Path(p).suffix.lower() in TEXT_EXT | {".md", ".txt", ".py"} and SENSITIVE_URL.search(body.decode("utf-8", errors="replace")):
                        self.finding("error", "SOURCE_BUNDLE_SIGNED_URL", p, "Potential signed URL in source bundle; value omitted.")
                    checked += 1
                    if len(body) != entry["bytes"] or sha(body) != entry["sha256"]:
                        self.finding("error", "SOURCE_BUNDLE_HASH", p, "Archived bytes disagree with the embedded manifest.")
                    live = self.read(self.root, p)
                    if live is not None:
                        self.record("source", p, live)
                        if sha(live) == sha(body):
                            current += 1
                        else:
                            self.finding("error", "SOURCE_BUNDLE_STALE", p, "Packaged component source differs from selected current source.")
                if set(entries) - declared - {"README.md", "MANIFEST.json"}:
                    self.finding("review", "SOURCE_BUNDLE_UNDECLARED", name, "Archive contains members not covered by its manifest.")
                inner_name = "assets/source/reused-aircraft/vtol-f35b/f35b-source.zip"
                source_manifest = "assets/source/reused-aircraft/vtol-f35b/f35b-source-manifest.json"
                if inner_name in entries and source_manifest in entries:
                    meta = json.loads(z.read(source_manifest))
                    with zipfile.ZipFile(io.BytesIO(z.read(inner_name))) as inner:
                        inner_entries = self.archive_members(inner, inner_name)
                        for item in meta["files"]:
                            p = "headwind-f35b-source/" + item["path"]
                            if p not in inner_entries:
                                self.finding("error", "UPSTREAM_SOURCE_MISSING", item["path"], "Declared upstream file absent.")
                                continue
                            body = inner.read(p)
                            if sha(body) != item["sha256"] or len(body) != item["bytes"]:
                                self.finding("error", "UPSTREAM_SOURCE_HASH", item["path"], "Upstream archive and source manifest disagree.")
                            else:
                                upstream += 1
            self.result["checks"]["f35SourceBundle"] = {"manifestEntriesChecked": checked, "matchCurrentSource": current, "upstreamFilesMatched": upstream, "completeGameSource": False}
            self.finding("review", "GPL_DISTRIBUTION_SCOPE_REVIEW", name, "GPL-3.0 text and component source are present; overall distribution/corresponding-source sufficiency remains a separate review, not a legal PASS.")
        except (ValueError, KeyError, TypeError, zipfile.BadZipFile, RuntimeError):
            self.finding("error", "SOURCE_BUNDLE_INVALID", name, "Cannot validate the component/upstream ZIP and manifests.")

    def web(self, base: Path):
        self.result["webInput"] = str(base)
        files = self.tree(base, "web")
        if "index.html" not in files:
            self.finding("error", "WEB_ENTRY_MISSING", "index.html", "Selected web build has no entry; no product is not PASS.")
        if not any(p.endswith(".js") for p in files):
            self.finding("error", "WEB_SCRIPT_MISSING", "web", "Selected build contains no game JavaScript.")
        reader = lambda p: self.read(base, p)
        for name in files:
            if name.startswith(("licenses/", "sources/")):
                continue
            ext = Path(name).suffix.lower()
            if ext in TEXT_EXT or ext in AUDIO_EXT or ext == ".glb":
                data = reader(name)
                if data is None:
                    continue
                if ext in TEXT_EXT:
                    self.scan_text(base, name, data, files)
                elif ext == ".glb":
                    self.glb(name, data)
                    if name != "models/weapons/ak47-world-r1.glb":
                        self.finding("review", "GLB_SOURCE_LICENSE_REVIEW", name, "New GLB is permitted; add its explicit source/digest/license mapping before release review.")
                elif ext in AUDIO_EXT:
                    self.audio_header(name, data)
                    self.finding("review", "AUDIO_PROVENANCE_MAPPING_REQUIRED", name, "File audio is packaged; check its explicit source/manifest using --audio-manifest.")
        public = self.root / "public"
        public_count = 0
        if public.is_dir():
            for parent, dirs, names in os.walk(public, followlinks=False):
                for d in list(dirs):
                    if forbidden(d) or (Path(parent) / d).is_symlink():
                        self.finding("error", "PUBLIC_UNSAFE_CONTENT", d, "Excluded public directory would be copied by Vite.")
                        dirs.remove(d)
                for n in names:
                    p = Path(parent) / n
                    rel = p.relative_to(public).as_posix()
                    if forbidden(rel) or p.is_symlink():
                        self.finding("error", "PUBLIC_UNSAFE_CONTENT", rel, "Excluded public file would be copied by Vite.")
                        continue
                    data = self.read(public, rel)
                    if data is not None:
                        self.record("source", "public/" + rel, data)
                        if rel not in files or files[rel]["sha256"] != sha(data):
                            self.finding("error", "PUBLIC_BUILD_MISMATCH", rel, "Current public file is absent or different in selected web build.")
                        else:
                            public_count += 1
        self.dependencies(files, reader)
        ak = "models/weapons/ak47-world-r1.glb"
        if ak in files or (self.root / "src/assets/weapon-catalog.ts").is_file():
            original_name = "assets/source/WP-AK47/ak47_reloadable_world.glb"
            original = self.read(self.root, original_name)
            if original is not None:
                self.record("source", original_name, original)
                if ak not in files or files[ak]["sha256"] != sha(original):
                    self.finding("error", "AK47_SOURCE_RUNTIME_MISMATCH", ak, "Expected imported GLB does not match the archived original.")
            for license_name in ("LICENSE", "SOURCE_LICENSE.md"):
                self.license_copy("WP-AK47", "assets/source/WP-AK47/" + license_name, "licenses/WP-AK47/" + license_name, files, reader)
            if "licenses/WP-AK47/NOTICE.md" not in files:
                self.finding("error", "ASSET_NOTICE_MISSING", "WP-AK47", "Asset attribution notice is absent.")
            catalog = self.json(self.read(self.root, "assets/source/WP-AK47/catalog-entry.json", MAX_TEXT), "WP-AK47 catalog")
            if catalog and ak in files and catalog.get("sha256") != files[ak]["sha256"]:
                self.finding("error", "ASSET_CATALOG_HASH", ak, "Catalog and packaged asset digest disagree.")
        f35 = "sources/reused-aircraft/f35b-ganymede-source.zip"
        if (self.root / "src/presentation/reused-aircraft/f35b.js").is_file() or f35 in files:
            self.license_copy("F-35B", "assets/source/reused-aircraft/vtol-f35b/F35B-GPL-3.0.txt", "licenses/reused-aircraft/f35b/F35B-GPL-3.0.txt", files, reader)
            if "licenses/reused-aircraft/f35b/NOTICE.md" not in files:
                self.finding("error", "ASSET_NOTICE_MISSING", "F-35B", "Component notice is absent.")
            if f35 not in files:
                self.finding("error", "SOURCE_BUNDLE_MISSING", f35, "Selected component corresponding-source bundle is absent.")
            else:
                self.f35_bundle(reader(f35), f35)
        self.result["checks"]["web"] = {"files": len(files), "bytes": sum(r["bytes"] for r in files.values()), "publicFilesMatched": public_count, "fileAudioCount": sum(Path(p).suffix.lower() in AUDIO_EXT for p in files)}
        return files

    def asar(self, data):
        if len(data) < 16:
            raise ValueError("short ASAR")
        prefix, header_size, payload_size, json_size = struct.unpack_from("<4I", data)
        if prefix != 4 or header_size != payload_size + 4 or json_size > header_size - 8 or 8 + header_size > len(data):
            raise ValueError("invalid ASAR header")
        doc = json.loads(data[16:16 + json_size])
        start, files, spans = 8 + header_size, {}, []
        def walk(nodes, prefix=""):
            for name, entry in nodes.items():
                p = prefix + name
                if not safe_name(p) or forbidden(p):
                    raise ValueError("unsafe ASAR path")
                if "files" in entry:
                    walk(entry["files"], p + "/")
                else:
                    if "link" in entry or entry.get("unpacked"):
                        raise ValueError("ASAR links/unpacked require separate support")
                    offset, size = int(entry["offset"]), int(entry["size"])
                    if offset < 0 or size < 0 or start + offset + size > len(data) or p in files:
                        raise ValueError("invalid ASAR entry")
                    body = data[start + offset:start + offset + size]
                    integ = entry.get("integrity", {})
                    if integ and (integ.get("algorithm") != "SHA256" or integ.get("hash") != sha(body)):
                        self.finding("error", "ASAR_INTEGRITY", p, "ASAR entry integrity digest differs.")
                    files[p] = body
                    spans.append((offset, offset + size))
        walk(doc["files"])
        spans.sort()
        if any(a[1] > b[0] for a, b in zip(spans, spans[1:])):
            raise ValueError("overlapping ASAR entries")
        return files

    def windows(self, selected: Path, web_files):
        self.result["windowsInput"] = str(selected)
        if not web_files:
            self.finding("review", "WINDOWS_BASELINE_NOT_SELECTED", "Windows input", "No independent --web baseline: current asset/license completeness cannot be established from the portable package alone.")
        files, blob = {}, {}
        try:
            if selected.is_file() and selected.suffix.lower() == ".zip":
                archive_bytes = self.read(selected.parent, selected.name)
                if archive_bytes is None:
                    return
                self.result["checks"]["windowsZip"] = {"bytes": len(archive_bytes), "sha256": sha(archive_bytes), "crc": "FAIL"}
                with zipfile.ZipFile(io.BytesIO(archive_bytes)) as z:
                    entries = self.archive_members(z, "Windows ZIP")
                    roots = {p.split("/")[0] for p in entries}
                    prefix = next(iter(roots)) + "/" if len(roots) == 1 and all("/" in p for p in entries) else ""
                    for name in entries:
                        p = name[len(prefix):]
                        data = z.read(name)
                        files[p] = self.record("windows", p, data)
                        if p in {"resources/app.asar", "ReturnToGanymede.exe", "LICENSE", "LICENSES.chromium.html", "version"}:
                            blob[p] = data
                    self.result["checks"]["windowsZip"]["crc"] = "PASS_ALL_READ_MEMBERS"
            elif selected.is_dir():
                files = self.tree(selected, "windows")
                for p in ("resources/app.asar", "ReturnToGanymede.exe", "LICENSE", "LICENSES.chromium.html", "version"):
                    if p in files:
                        blob[p] = self.read(selected, p)
            else:
                self.finding("error", "INPUT_MISSING", str(selected), "Selected Windows ZIP/portable directory does not exist.")
                return
            required = {"ReturnToGanymede.exe", "resources/app.asar", "LICENSE", "LICENSES.chromium.html", "icudtl.dat", "resources.pak", "ffmpeg.dll", "chrome_100_percent.pak", "chrome_200_percent.pak", "v8_context_snapshot.bin", "START_HERE.txt", "version"}
            for p in sorted(required - set(files)):
                self.finding("error", "WINDOWS_MEMBER_MISSING", p, "Required portable-package member is missing.")
            if not any(p.startswith("locales/") and p.endswith(".pak") for p in files):
                self.finding("error", "WINDOWS_LOCALES_MISSING", "locales", "No Electron locale data in package.")
            exe = blob.get("ReturnToGanymede.exe", b"")
            if len(exe) < 64 or exe[:2] != b"MZ":
                raise ValueError("invalid PE header")
            at = struct.unpack_from("<I", exe, 0x3C)[0]
            if at + 6 > len(exe) or exe[at:at + 4] != b"PE\0\0" or struct.unpack_from("<H", exe, at + 4)[0] != 0x8664:
                raise ValueError("not x64 PE")
            contents = self.asar(blob["resources/app.asar"])
            asar_inventory = {p: {"path": p, "bytes": len(d), "sha256": sha(d)} for p, d in contents.items()}
            self.result["asarFiles"] = list(asar_inventory.values())
            top = sorted({p.split("/")[0] for p in contents})
            if top != ["LICENSES", "desktop", "dist", "package.json"]:
                self.finding("error", "ASAR_UNEXPECTED_ROOTS", "app.asar", "Expected only LICENSES, desktop, dist, package.json.")
            self.dependencies(asar_inventory, contents.get, desktop=True)
            embedded = json.loads(contents["package.json"])
            source_pkg = json.loads(self.read(self.root, "package.json"))
            if embedded.get("main") != "desktop/main.cjs" or embedded.get("version") != source_pkg.get("version"):
                self.finding("error", "ASAR_PACKAGE_METADATA", "package.json", "Embedded entry/version differs from selected project.")
            electron_version = blob.get("version", b"").decode("utf-8").strip().lstrip("v")
            if electron_version != source_pkg.get("devDependencies", {}).get("electron"):
                self.finding("error", "ELECTRON_VERSION_MISMATCH", "version", "Portable Electron version differs from pinned project version.")
            electron_license = self.read(self.root, "node_modules/electron/LICENSE", MAX_TEXT)
            if electron_license is not None and blob.get("LICENSE") != electron_license:
                self.finding("error", "ELECTRON_LICENSE_MISMATCH", "LICENSE", "Portable Electron license differs from selected installed version.")
            matched = 0
            for p, row in web_files.items():
                if "dist/" + p not in asar_inventory or asar_inventory["dist/" + p]["sha256"] != row["sha256"]:
                    self.finding("error", "WINDOWS_WEB_MISMATCH", "dist/" + p, "Windows ASAR is not the selected web candidate.")
                else:
                    matched += 1
            if web_files and {p[5:] for p in contents if p.startswith("dist/")} != set(web_files):
                self.finding("error", "WINDOWS_WEB_FILESET_MISMATCH", "dist", "Windows and selected web build contain different files.")
            for row in self.inventory["source"]:
                if row["path"].startswith("desktop/") and asar_inventory.get(row["path"], {}).get("sha256") != row["sha256"]:
                    self.finding("error", "WINDOWS_DESKTOP_MISMATCH", row["path"], "Packaged desktop code differs from selected source.")
            packaged_web = {p[5:]: row for p, row in asar_inventory.items() if p.startswith("dist/")}
            if "index.html" not in packaged_web:
                self.finding("error", "WINDOWS_WEB_ENTRY_MISSING", "dist/index.html", "Windows package has no web entry.")
            for p in packaged_web:
                data = contents["dist/" + p]
                if Path(p).suffix in TEXT_EXT and not p.startswith(("licenses/", "sources/")):
                    self.scan_text(None, p, data, packaged_web)
                elif p.endswith(".glb"):
                    self.glb("app.asar/dist/" + p, data)
                elif Path(p).suffix in AUDIO_EXT:
                    self.audio_header("app.asar/dist/" + p, data)
            self.result["checks"]["windows"] = {"files": len(files), "bytes": sum(x["bytes"] for x in files.values()), "executable": "PE/x86-64", "electronVersion": electron_version, "asarEntries": len(contents), "webFilesMatched": matched, "runtime": "NOT_RUN"}
        except (ValueError, KeyError, TypeError, UnicodeDecodeError, struct.error, zipfile.BadZipFile, RuntimeError, OSError):
            self.finding("error", "WINDOWS_PACKAGE_INVALID", "Windows input", "Could not validate ZIP/ASAR/PE structure; no runtime inference is made.")

    def audio_manifest(self, name):
        if not safe_name(name) or forbidden(name):
            self.finding("error", "AUDIO_MANIFEST_PATH", "<redacted>", "Manifest must be a safe project-relative path.")
            return
        data = self.read(self.root, name, MAX_TEXT)
        manifest = self.json(data, name)
        if not isinstance(manifest, dict) or not isinstance(manifest.get("assets"), list) or not manifest["assets"]:
            self.finding("error", "AUDIO_MANIFEST_EMPTY", name, "Expected a nonempty assets list; no audio is not PASS.")
            return
        self.record("source", name, data)
        base = (self.root / name).parent
        ids, paths, sources, music = set(), set(), {}, 0
        for a in manifest["assets"]:
            p = a.get("file", "")
            if a.get("id") in ids:
                self.finding("error", "AUDIO_DUPLICATE_ID", name, "Manifest contains duplicate asset IDs.")
            ids.add(a.get("id"))
            if not safe_name(p) or forbidden(p) or Path(p).suffix.lower() not in AUDIO_EXT:
                self.finding("error", "AUDIO_RUNTIME_PATH", name, "Asset file must be local relative audio; value omitted.")
                continue
            body = self.read(base, p)
            if body is None:
                continue
            paths.add(p)
            self.record("audio", p, body)
            self.audio_header(p, body, a)
            if not a.get("sha256") or not isinstance(a.get("bytes"), int):
                self.finding("error", "AUDIO_MANIFEST_DIGEST_MISSING", p, "Manifest needs explicit bytes and sha256.")
            if a.get("kind") == "music":
                music += 1
            else:
                origin = a.get("sources", [])
                if not origin:
                    self.finding("review", "AUDIO_SOURCE_EVIDENCE_MISSING", p, "No per-asset source entries.")
                for s in origin:
                    item = {"author": s.get("author"), "license": s.get("license"), "url": clean_uri(s.get("url", "")), "license_url": clean_uri(s.get("license_url", ""))}
                    sources[json.dumps(item, sort_keys=True)] = item
                    if not s.get("license") or not s.get("author") or not (s.get("url") or s.get("source_id")):
                        self.finding("review", "AUDIO_SOURCE_EVIDENCE_INCOMPLETE", p, "Source author/license/origin evidence needs review.")
        # Only explicitly named public metadata, never source/master/cache directories.
        for metadata in ("CREDITS.md", "README.md", "sfx-provenance.json", "music-provenance.json"):
            body = self.read(base, metadata, MAX_TEXT)
            if body is None:
                continue
            self.record("source", (Path(name).parent / metadata).as_posix(), body)
            text = body.decode("utf-8", errors="replace")
            abs_count = len(re.findall(r"(?:/Users/|/Volumes/|/home/|[A-Za-z]:\\\\)", text))
            if abs_count:
                self.finding("review", "PUBLIC_METADATA_LOCAL_PATHS", metadata, f"Metadata contains {abs_count} local-path occurrence(s); redact a distribution copy. These are not classified as runtime fetches.")
            if SENSITIVE_URL.search(text):
                self.finding("error", "PUBLIC_METADATA_SIGNED_URL", metadata, "Potential signed URL found; value omitted. Do not publish raw response metadata.")
            if metadata == "music-provenance.json":
                doc = self.json(body, metadata)
                def has_license(x):
                    if isinstance(x, dict):
                        return any("license" in k.lower() and bool(v) or has_license(v) for k, v in x.items())
                    return isinstance(x, list) and any(has_license(v) for v in x)
                if music and not has_license(doc):
                    self.finding("review", "GENERATED_MUSIC_LICENSE_EVIDENCE", metadata, "Generation/model revisions are recorded, but this distribution metadata contains no model/code/output-use license evidence. Keep pending; no legal conclusion.")
        self.result["checks"]["audioManifest"] = {"path": name, "declaredStatus": manifest.get("status"), "entries": len(manifest["assets"]), "uniqueFiles": len(paths), "bytes": sum(r["bytes"] for r in self.inventory["audio"]), "musicFiles": music, "sourceGroups": list(sources.values()), "gameIntegration": "NOT_TESTED", "decodePlayback": "NOT_RUN"}


def main(argv=None):
    class Parser(argparse.ArgumentParser):
        def error(self, message):
            self.print_usage(sys.stderr)
            self.exit(3, "audit input error: " + message + "\n")
    parser = Parser(description=__doc__)
    parser.add_argument("--root", required=True, type=Path, help="Project root, read-only")
    parser.add_argument("--web", type=Path, help="Explicit existing static build directory; relative to root")
    parser.add_argument("--windows", type=Path, help="Explicit Windows portable directory or ZIP; relative to root")
    parser.add_argument("--audio-manifest", help="Explicit project-relative prepared runtime manifest")
    parser.add_argument("--out", required=True, type=Path, help="Report-only output directory; absolute or relative to cwd")
    parser.add_argument("--label", default="unfrozen-local-audit")
    args = parser.parse_args(argv)
    root, out = args.root.resolve(), args.out.resolve()
    inputs = [((root / p).resolve() if not p.is_absolute() else p.resolve()) for p in (args.web, args.windows) if p]
    if not (args.web or args.windows or args.audio_manifest):
        parser.error("select at least one of --web, --windows, --audio-manifest")
    protected = inputs + [root / d for d in ("src", "desktop", "public", "assets", "design", "node_modules", "scripts")]
    if out == root or any(out == p or out.is_relative_to(p) for p in protected) or args.out.is_symlink():
        parser.error("--out must not be a source/build/asset input or a child of one")
    report_names = ("package-audit.json", "source-inventory.json", "package-audit.md")
    if out.exists() and not out.is_dir():
        parser.error("--out must be a directory")
    for name in report_names:
        p = out / name
        if p.is_symlink() or p.exists() and not stat.S_ISREG(p.lstat().st_mode):
            parser.error("refusing a report destination that is a symlink or non-regular file")
    audit = Audit(root, args.label)
    start = time.monotonic()
    try:
        if not root.is_dir():
            audit.finding("error", "INPUT_MISSING", str(root), "Project root is absent.")
        else:
            if args.web or args.windows:
                audit.source_snapshot()
            web_files = audit.web((root / args.web).resolve()) if args.web else {}
            if args.windows:
                audit.windows((root / args.windows).resolve(), web_files)
            if args.audio_manifest:
                audit.audio_manifest(args.audio_manifest)
    except Exception as exc:
        # Do not print input values or raw exception messages, which may contain secrets.
        audit.finding("error", "AUDITOR_INCOMPLETE", "auditor", "Unexpected " + type(exc).__name__ + "; audit is incomplete.")
    counts = Counter(x["severity"] for x in audit.findings)
    incomplete = any(f["code"] in {"INPUT_MISSING", "AUDITOR_INCOMPLETE"} for f in audit.findings)
    code = 3 if incomplete else 1 if counts["error"] else 2 if counts["review"] else 0
    status = {0: "PASS_STATIC", 1: "FAIL", 2: "REVIEW_REQUIRED", 3: "INCOMPLETE"}[code]
    audit.result.update({"status": status, "exitCode": code, "findings": audit.findings, "findingCounts": dict(counts),
                         "finishedUtc": datetime.now(timezone.utc).isoformat(),
                         "observedInputChanges": any(f["code"] == "INPUT_CHANGED" for f in audit.findings),
                         "atomicFilesystemSnapshot": False, "elapsedSeconds": round(time.monotonic() - start, 3)})
    for rows in audit.inventory.values():
        rows.sort(key=lambda x: x["path"])
    audit.result["inventorySha256"] = sha(json.dumps(audit.inventory, sort_keys=True, separators=(",", ":")).encode())
    out.mkdir(parents=True, exist_ok=True)
    def write_report(name, content):
        # Same-directory atomic replace never follows an output-file symlink.
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=out, prefix=".package-audit-", delete=False) as f:
            temporary = Path(f.name)
            f.write(content)
        try:
            os.replace(temporary, out / name)
        finally:
            temporary.unlink(missing_ok=True)
    write_report("package-audit.json", json.dumps(audit.result, ensure_ascii=False, indent=2) + "\n")
    write_report("source-inventory.json", json.dumps(audit.inventory, ensure_ascii=False, indent=2) + "\n")
    lines = [f"# Package audit: {args.label}", "", f"Status: **{status}** · exit {code}", "", f"Recorded: {audit.result['recordedUtc']}", f"Root: `{root}`", "", "Windows runtime: **NOT_RUN**. Browser runtime: **NOT_RUN**. Source-to-build reproduction: **NOT_REBUILT**.", "", "| Level | Code | Path | Finding |", "| --- | --- | --- | --- |"]
    for f in audit.findings:
        values = [f[k].replace("|", "\\|").replace("\n", " ") for k in ("severity", "code", "path", "message")]
        lines.append("| " + " | ".join(values) + " |")
    lines += ["", "## Boundaries", ""] + ["- " + x for x in audit.result["limits"]]
    write_report("package-audit.md", "\n".join(lines) + "\n")
    print(json.dumps({"status": status, "exitCode": code, "findings": dict(counts), "report": str(out / "package-audit.json"), "elapsedSeconds": audit.result["elapsedSeconds"]}, ensure_ascii=False))
    return code


if __name__ == "__main__":
    try:
        sys.exit(main())
    except OSError:
        print("Audit could not write/read an output; no successful audit is claimed.", file=sys.stderr)
        sys.exit(3)

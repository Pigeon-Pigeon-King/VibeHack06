"""Rebuild the allowlisted F-35B source bundle; no network or user-private files."""
from pathlib import Path
import hashlib
import json
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets/source/reused-aircraft/vtol-f35b'
TARGET = ROOT / 'public/sources/reused-aircraft/f35b-ganymede-source.zip'

paths = sorted(p for p in SOURCE.rglob('*') if p.is_file())
paths += sorted(p for p in (ROOT / 'src/presentation/reused-aircraft').rglob('*') if p.is_file())
paths += [ROOT / p for p in [
    'src/presentation/reused-aircraft.ts',
    'src/presentation/EpilogueAirCover.ts',
    'src/presentation/DeferredAirCover.ts',
    'tests/reused-aircraft.test.ts',
    'tests/epilogue-air-cover.test.ts',
    'tests/deferred-air-cover.test.ts',
    'docs/REUSE_MILITARY_AIR_ASSETS.md',
    'scripts/package-reused-aircraft.py',
]]
manifest = [{'path': p.relative_to(ROOT).as_posix(), 'bytes': p.stat().st_size,
             'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in paths]
TARGET.parent.mkdir(parents=True, exist_ok=True)

def put(archive, name, data):
    info = zipfile.ZipInfo(name, date_time=(2026, 10, 31, 0, 0, 0))
    info.compress_type = zipfile.ZIP_DEFLATED
    info.external_attr = 0o100644 << 16
    archive.writestr(info, data)

with zipfile.ZipFile(TARGET, 'w') as archive:
    for path in paths:
        put(archive, path.relative_to(ROOT).as_posix(), path.read_bytes())
    put(archive, 'MANIFEST.json', json.dumps({
        'scope': 'F-35B component and upstream material, not the complete game',
        'runtime': {'three': '0.186.0', 'typescript': '7.0.2'},
        'files': manifest,
    }, indent=2) + '\n')
    put(archive, 'README.md', '''# F-35B component source

This contains the original mesh/XML/converter archive and the modified runtime component.
The JavaScript factory is reusable with Three.js 0.186.0; the TypeScript adapters integrate
into the host game. No old project directory, online model or external texture is used
at runtime. Full game source is a separate competition delivery.

To reconstruct the original numerical data, extract the inner archive
assets/source/reused-aircraft/vtol-f35b/f35b-source.zip into a separate directory and
follow its included rebuild instructions. Do not overwrite archived originals.
Refer to docs/REUSE_MILITARY_AIR_ASSETS.md for axes, sharing, mechanisms, provenance
and validation boundaries. From the full project, run python3 scripts/package-reused-aircraft.py
after component changes to refresh this bundle.
''')

record_path = ROOT / 'artifacts/reuse-military-air-assets.json'
record = json.loads(record_path.read_text())
record.setdefault('hostIntegration', {})['sourceBundle'] = {
    'path': TARGET.relative_to(ROOT).as_posix(), 'bytes': TARGET.stat().st_size,
    'sha256': hashlib.sha256(TARGET.read_bytes()).hexdigest(), 'files': len(paths),
}
record['hostIntegration']['distVerified'] = False
record_path.write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(record['hostIntegration']['sourceBundle'], indent=2))

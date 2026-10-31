#!/usr/bin/env python3
"""Prepare the remaining approved Tripo props with the existing image-only converter.

Usage: python3 artifacts/model-integration/props/prepare-props.py SOURCE_CHECKOUT
No API calls; provider originals and the first integration snapshot are preserved.
"""
import hashlib
import importlib.util
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[3]
SOURCE = Path(sys.argv[1]).resolve()
OUT = ROOT / 'public/assets/generated/production-20261031-props-r1'
EVIDENCE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('resize_glb', ROOT / 'artifacts/asset-integration/scenery/resize-glb-textures.py')
resize_glb = importlib.util.module_from_spec(spec)
spec.loader.exec_module(resize_glb)
report = json.loads((SOURCE / 'artifacts/asset-jobs/production-20261031/props/report.json').read_text())
existing = {'PROP-BENCH', 'PROP-LIFE-MUG', 'PROP-MEDICAL-BAG', 'PROP-TERMINAL-CONSOLE', 'PROP-VEH-TUG'}
entries = []
for asset in report['assets']:
    if asset['id'] in existing:
        continue
    source = SOURCE / 'assets/source/tripo' / asset['id'] / Path(asset['files']['pbr_model']['path']).name
    if hashlib.sha256(source.read_bytes()).hexdigest() != asset['files']['pbr_model']['sha256']:
        raise ValueError('Source hash differs: ' + asset['id'])
    destination = OUT / (asset['id'] + '.glb')
    conversion = resize_glb.convert(source, destination)
    conversion['source'] = source.relative_to(SOURCE).as_posix()
    conversion['runtime'] = destination.relative_to(ROOT).as_posix()
    (EVIDENCE / (asset['id'] + '-textures.json')).write_text(json.dumps(conversion, ensure_ascii=False, indent=2) + '\n')
    metrics = asset['glb_metrics']
    record = {
        'id': asset['id'], 'name': asset['name'], 'revision': 'production-20261031-tex1024-v1', 'provider': 'Tripo',
        'runtimePath': destination.relative_to(ROOT / 'public').as_posix(),
        'sourcePath': source.relative_to(SOURCE).as_posix(), 'taskId': asset['task_id'],
        'sha256': conversion['runtimeSha256'], 'bytes': conversion['runtimeBytes'],
        'sourceSha256': conversion['sourceSha256'], 'sourceBytes': conversion['sourceBytes'],
        'sourceBounds': metrics['raw_accessor_bounds_not_meters'][0],
        'sourceCost': {'triangles': metrics['triangles'], 'meshes': metrics['meshes'], 'materials': metrics['materials'],
                       'embeddedImages': metrics['images'], 'animationClips': 0},
        'textureBudget': {'maxEdge': 1024, 'images': conversion['images'],
                          'estimatedRGBA8WithMipmapsBytes': conversion['estimatedRGBA8WithMipmapsBytes']},
        'concept': {'inputFile': Path(asset['image']).name, 'inputSha256': hashlib.sha256(Path(asset['image']).read_bytes()).hexdigest()},
        'status': 'prepared-integration-candidate-rendering-pending',
    }
    entries.append(record)
    print(asset['id'], conversion['runtimeBytes'], flush=True)
manifest = {'schemaVersion': 1, 'assets': entries, 'totalBytes': sum(a['bytes'] for a in entries),
            'sourceModified': False, 'textureResizing': True, 'sourceReport': 'artifacts/asset-jobs/production-20261031/props/report.json'}
(OUT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
(EVIDENCE / 'prepared-props.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
print('TOTAL', manifest['totalBytes'], flush=True)

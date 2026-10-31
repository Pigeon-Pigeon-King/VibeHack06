"""Freeze reviewed music/SFX and technically checked dialogue; never modify producers."""
import collections
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT.parent / 'VibeHack06' / 'design/audio'
OUTPUT = ROOT / 'public/audio'
EVIDENCE = ROOT / 'artifacts/asset-integration/audio'


def read(path):
    return json.loads(path.read_text())


def sha(data):
    return hashlib.sha256(data).hexdigest()


production_path = SOURCE / 'production-01/runtime/manifest.json'
voice_path = SOURCE / 'campaign-voice-01/dialogue-manifest.json'
production_bytes = production_path.read_bytes()
voice_bytes = voice_path.read_bytes()
production = json.loads(production_bytes)
voices = json.loads(voice_bytes)
approvals = read(SOURCE / 'production-01/metadata/music-approvals.json')['approvals']
music_provenance = read(SOURCE / 'production-01/runtime/music-provenance.json')['production']['music']
timings = read(SOURCE / 'campaign-voice-01/metadata/dialogue-timing-review.json')['records']
timing_flags = {x['lineId'] for x in timings if x['needsIntegrationTimingReview']}
selected, excluded, catalog, dialogue = [], [], {}, []


def freeze(id, source, relative, expected, kind, duration, provenance, gain=1):
    data = source.read_bytes()
    if sha(data) != expected:
        raise RuntimeError(f'Source changed or hash mismatch: {source.name}')
    target = OUTPUT / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    record = dict(id=id, source=str(source.relative_to(SOURCE)), file='audio/' + relative,
                  sha256=expected, bytes=len(data), duration=duration, kind=kind, provenance=provenance)
    selected.append(record)
    catalog[id] = dict(id=id, url=record['file'], sha256=expected, bytes=len(data), duration=duration, kind=kind, gain=gain)


for id, approval in approvals.items():
    if approval['status'] != 'user_approved':
        continue
    info = next(x for x in music_provenance if x['id'] == id)
    freeze(id, SOURCE / 'production-01' / approval['auditioned_path'],
           f'music/{id}-full.mp3', approval['auditioned_sha256'], 'music',
           info['actual_duration_s'], dict(approval=approval, sourceSha256=info['source_sha256'],
           method='Locally generated original instrumental cue; exact approved full MP3, no loop/exit edit.'))

sfx_ids = ['ak47-near-01', 'ak47-near-02', 'ak47-near-03', 'reload-generic-airsoft',
           'history.bombardment.near.01', 'history.collapse.beam.01', 'history.collapse.debris.01',
           'jet.aircover.approach.01', 'ui.hit_confirm.01', 'ui.kill_confirm.01']
sfx_ids += [f'move.run.{surface}.{n:02}' for surface in ['grating', 'hard_ground'] for n in range(1, 5)]
for id in sfx_ids:
    info = next(x for x in production['assets'] if x['id'] == id)
    freeze(id, production_path.parent / info['file'], f'sfx/{id}.wav', info['sha256'], 'sfx', info['duration_s'],
           {k: info.get(k) for k in ['sources', 'approval', 'notes', 'match', 'processing']})

scenarios = dict(S01='childhood', S02='mainhall', S03='nightshift', S04='workers', S05='frontgate',
                 S06='transfer', S07='flank', S08='escort', S09='relief', S10='rescue', S11='medical', S12='epilogue')
for line in voices['lines']:
    reason = None
    if line.get('productionStatus') != 'prepared_technical_check': reason = 'not-completed-at-freeze'
    elif not line.get('runtimeEligible') or line.get('sourceStatus') != 'implemented_main': reason = 'not-implemented-current-main'
    elif line.get('technicalFlags'): reason = 'technical-flags'
    elif line['lineId'] in timing_flags: reason = 'timing-needs-review'
    elif line['scene'] not in scenarios: reason = 'shared-or-compatibility-requires-explicit-event-mapping'
    elif line.get('readText') != line['originalText']: reason = 'spoken-text-differs-from-script'
    elif line.get('dynamicTemplateInstance'): reason = 'dynamic-line-needs-explicit-mapping'
    sources = []
    for source in line['sources']:
        path = ROOT / source['path']
        if path.is_file() and line['originalText'] in path.read_text():
            sources.append(dict(path=source['path'], sha256=sha(path.read_bytes())))
    if not sources: reason = reason or 'exact-text-not-found-in-current-checkout'
    export = None
    if not reason:
        export_path = SOURCE / 'campaign-voice-01/metadata/exports' / (Path(line['prepared_mp3']).stem + '.json')
        if not export_path.is_file(): reason = 'no-export-verification'
        else:
            export = read(export_path)
            if export.get('flags') or not export.get('mp3_decoded') or not export.get('prepared_analysis', {}).get('finite'):
                reason = 'export-needs-review'
            elif export.get('prepared_mp3_sha256') != line.get('prepared_mp3_sha256'):
                reason = 'manifest-export-disagree'
    if reason:
        excluded.append(dict(id=line['lineId'], scene=line['scene'], reason=reason))
        continue
    label = line['sourceSpeakerLabel']
    if label == '$player.name': label = '陆闻川' if line['speakerId'].startswith('lu.') else '周延'
    freeze(line['lineId'], SOURCE / 'campaign-voice-01' / line['prepared_mp3'],
           f"voice/{line['scene']}/{Path(line['prepared_mp3']).name}", line['prepared_mp3_sha256'],
           'voice', line['duration_s'], dict(sourceFreeze=voices['sourceFreeze'], currentSources=sources,
           speakerId=line['speakerId'], referenceApproved=line['reference']['approvalStatus'],
           referenceSha256=line['reference']['sha256'], sourceTextSha256=line['textSha256'],
           humanListeningApproval=False, technicalVerification='finite WAV, no export flags, MP3 decoded by producer; current exact source text; no ASR evidence',
           method='Original fictional character base; authorized local Qwen3-TTS production; no reference/base audio shipped.'))
    dialogue.append(dict(assetId=line['lineId'], scenario=scenarios[line['scene']], speaker=label,
                         text=line['originalText'], duration=line['duration_s']))

ledger = dict(frozenAtUtc=datetime.now(timezone.utc).isoformat(),
              sourceManifests=[dict(path=str(production_path.relative_to(SOURCE)), sha256=sha(production_bytes)),
                               dict(path=str(voice_path.relative_to(SOURCE)), sha256=sha(voice_bytes))],
              counts=dict(collections.Counter(x['kind'] for x in selected)), bytes=sum(x['bytes'] for x in selected),
              selected=selected, excludedVoices=excluded,
              limitations=['Technical candidate, not human listening or browser/Windows acceptance.',
                           'Full approved music is one-shot; loop/exit versions excluded.',
                           'Shot recordings are approved AK47 cuts; reload is an airsoft proxy.',
                           'Jet approach is approved F16 recording used as distant F35B proxy; no rotor layer.',
                           'Hit-confirm is a technically checked original cue, not separately user-auditioned.',
                           'Dialogue may be interrupted by a subsequent real say event; never extends mission timing.'])
(EVIDENCE / 'selection.json').write_text(json.dumps(ledger, ensure_ascii=False, indent=2) + '\n')
(OUTPUT / 'provenance.json').write_text(json.dumps(ledger, ensure_ascii=False, indent=2) + '\n')
(ROOT / 'src/audio/catalog.ts').write_text('// Frozen production candidates; provenance and hashes: public/audio/provenance.json.\n'
    + "import type { AudioAsset, DialogueAsset } from './contracts';\n"
    + 'export const AUDIO_CATALOG: Readonly<Record<string, AudioAsset>> = '
    + json.dumps(catalog, ensure_ascii=False, indent=2) + ';\n'
    + 'export const DIALOGUE_CATALOG: readonly DialogueAsset[] = '
    + json.dumps(dialogue, ensure_ascii=False, indent=2) + ';\n')
print(json.dumps(dict(counts=ledger['counts'], bytes=ledger['bytes'], excluded=collections.Counter(x['reason'] for x in excluded)), ensure_ascii=False))

"""Copy all approved implemented dialogue, preserving exclusions as history only."""
from pathlib import Path
from datetime import datetime, timezone
import collections, hashlib, json

ROOT = Path(__file__).resolve().parents[3]
PRODUCTION = ROOT.parent / 'VibeHack06/design/audio/campaign-voice-01'
EVIDENCE = ROOT / 'artifacts/asset-integration/audio'
def sha(data): return hashlib.sha256(data).hexdigest()
def read(path): return json.loads(path.read_text())
def dump(path, data): path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')

source = read(PRODUCTION / 'dialogue-manifest.json')
runtime = read(PRODUCTION / 'runtime/manifest.json')
approval = read(PRODUCTION / 'metadata/user-full-dialogue-approval.json')
assert approval['status'] == 'user_approved_for_integration'
prior = read(EVIDENCE / 'selection.json')
if not (EVIDENCE / 'selection-before-full-dialogue.json').exists():
    dump(EVIDENCE / 'selection-before-full-dialogue.json', prior)
selected = [x for x in prior['selected'] if x['kind'] != 'voice']
scenes = dict(S01='childhood', S02='mainhall', S03='nightshift', S04='workers', S05='frontgate',
              S06='transfer', S07='flank', S08='escort', S09='relief', S10='rescue', S11='medical', S12='epilogue')
by_id = {x['lineId']: x for x in source['lines']}
dialogue = []
for entry in runtime['entries']:
    line = by_id[entry['lineId']]
    assert line['runtimeEligible'] and not line['technicalFlags']
    data = (PRODUCTION / line['prepared_mp3']).read_bytes()
    assert sha(data) == entry['sha256'] == approval['approvedAudioSha256'][entry['lineId']]
    file = f"audio/voice/{line['scene']}/{Path(line['prepared_mp3']).name}"
    target = ROOT / 'public' / file
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists(): assert sha(target.read_bytes()) == entry['sha256']
    else: target.write_bytes(data)
    selected.append(dict(id=entry['lineId'], file=file, sha256=entry['sha256'], bytes=len(data),
        duration=entry['duration_s'], kind='voice', source='campaign-voice-01/'+line['prepared_mp3'],
        provenance=dict(sourceFreeze=source['sourceFreeze'], speakerId=entry['speakerId'],
            referenceSha256=entry['referenceSha256'], sourceTextSha256=entry['sourceTextSha256'],
            spokenText=entry['spokenText'], spokenTextSha256=entry['spokenTextSha256'],
            sourceStatus=entry['sourceStatus'], sourceRecords=line['sources'],
            approval=dict(status=approval['status'], userMessage=approval['userMessage'], scope='overall_batch',
                          recordSha256=sha((PRODUCTION / 'metadata/user-full-dialogue-approval.json').read_bytes())),
            asr=dict(needsListenback=entry['needsListenback'], disposition=entry['machineReviewStatus']),
            timing=dict(policy='Event queue plays the complete approved recording and presents its own subtitle; hard story boundaries cancel stale speech.'),
            method='Original approved local Qwen3-TTS Base export, unchanged bytes.')))
    # SHARED is an actual conditional combat bark in the implemented campaign,
    # while S02 has a separate Zhao recording. Never map either voice globally.
    scenarios = [scenes[line['scene']]] if line['scene'] in scenes else [s for s in scenes.values() if s not in ('childhood', 'mainhall')]
    aliases = [a for a in entry['aliases'] if not a.startswith('$')]
    speaker = entry['sourceSpeakerLabel']
    if speaker == '$player.name': speaker = '陆闻川' if entry['speakerId'].startswith('lu.') else '周延'
    for scenario in scenarios:
        dialogue.append(dict(assetId=entry['lineId'], scenario=scenario, speaker=speaker, aliases=aliases,
            speakerId=entry['speakerId'], text=entry['text'], duration=entry['duration_s'],
            optional=entry['previewCategory'] == 'optional_combat_bark', sourceStatus=entry['sourceStatus']))

# Production source paths are provenance, not runtime dependencies; remove
# private workstation paths while retaining frozen relative files and hashes.
for asset in selected:
    if asset['kind'] == 'voice':
        for record in asset['provenance']['sourceRecords']:
            record.pop('absolutePath', None)
ledger = dict(prior, revision=3, frozenAtUtc=datetime.now(timezone.utc).isoformat(),
    selected=selected, counts=dict(collections.Counter(x['kind'] for x in selected)), bytes=sum(x['bytes'] for x in selected),
    excludedVoices=[dict(id=x['lineId'], reason='script_candidate_not_implemented') for x in source['lines'] if not x['runtimeEligible']],
    limitations=['All 175 implemented voice files are included; trigger matching is scene/speaker/exact-text scoped.',
                 'The S04 novel-source candidate is not an implemented game event.',
                 'Human approval covers the batch. ASR history is retained, not treated as a production veto.',
                 'Actual rendering and audible in-game timing require runtime acceptance.'])
ledger['sourceManifests'] = [x for x in prior['sourceManifests'] if not x['path'].startswith('campaign-voice-01/')]
ledger['sourceManifests'] += [dict(path='campaign-voice-01/'+p, sha256=sha((PRODUCTION/p).read_bytes())) for p in
    ['dialogue-manifest.json', 'runtime/manifest.json', 'metadata/user-full-dialogue-approval.json']]
dump(EVIDENCE / 'selection.json', ledger)
dump(ROOT / 'public/audio/provenance.json', ledger)
catalog = {x['id']:dict(id=x['id'], url=x['file'], sha256=x['sha256'], bytes=x['bytes'], duration=x['duration'], kind=x['kind'], gain=1) for x in selected}
(ROOT / 'src/audio/catalog.ts').write_text('// Approved runtime audio; byte provenance: public/audio/provenance.json.\n'
    + "import type { AudioAsset, DialogueAsset } from './contracts';\n"
    + 'export const AUDIO_CATALOG: Readonly<Record<string, AudioAsset>> = '+json.dumps(catalog,ensure_ascii=False,indent=2)+';\n'
    + 'export const DIALOGUE_CATALOG: readonly DialogueAsset[] = '+json.dumps(dialogue,ensure_ascii=False,indent=2)+';\n')
assert ledger['counts']['voice'] == 175 and len({x['assetId'] for x in dialogue}) == 175
print(json.dumps({'counts':ledger['counts'], 'dialogueMappings':len(dialogue), 'bytes':ledger['bytes']}))

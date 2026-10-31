"""Reconcile frozen runtime candidates with completed ASR/timing review; never write producer files."""
import collections
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
BASE = ROOT.parent / 'VibeHack06/design/audio/campaign-voice-01'
OUT = ROOT / 'public/audio'
EVIDENCE = ROOT / 'artifacts/asset-integration/audio'

def sha(data): return hashlib.sha256(data).hexdigest()
def encode(data): return json.dumps(data, ensure_ascii=False, indent=2) + '\n'

snapshots = {}
def read(relative):
    path = BASE / relative
    data = path.read_bytes()
    snapshots[relative] = data
    return json.loads(data)

manifest = read('dialogue-manifest.json')
timing = read('metadata/dialogue-timing-review.json')
review = read('metadata/asr-review-decisions.json')
summary = read('metadata/asr-summary.json')
approval = read('metadata/voice-approval.json')
assert approval['campaignFullDubbingAuthorized']
assert summary['recordCount'] == 176 and summary['emptyCount'] == 0
cases = {x['lineId']: x for x in review['cases']}
timing_by_line = collections.defaultdict(list)
for entry in timing['records']: timing_by_line[entry['lineId']].append(entry)
scenarios = dict(S01='childhood', S02='mainhall', S03='nightshift', S04='workers', S05='frontgate',
                 S06='transfer', S07='flank', S08='escort', S09='relief', S10='rescue', S11='medical', S12='epilogue')
prior_path = EVIDENCE / 'selection-initial.json'
prior_bytes = prior_path.read_bytes() if prior_path.exists() else (EVIDENCE / 'selection.json').read_bytes()
prior = json.loads(prior_bytes)
old = {x['id']: x for x in prior['selected'] if x['kind'] == 'voice'}
selected = [x for x in prior['selected'] if x['kind'] != 'voice']
excluded, dialogue, copies, screenings = [], [], {}, []

for line in manifest['lines']:
    id = line['lineId']
    reasons = []
    if line.get('productionStatus') != 'asr_checked': reasons.append('asr-needs-review-or-incomplete')
    if not line.get('runtimeEligible') or line.get('sourceStatus') != 'implemented_main': reasons.append('not-current-main-dialogue')
    if line.get('technicalFlags'): reasons.append('technical-flags')
    if any(x['needsIntegrationTimingReview'] for x in timing_by_line[id]): reasons.append('timing-needs-review')
    if line['scene'] not in scenarios: reasons.append('shared-or-compatibility-needs-event-mapping')
    if line.get('readText') != line['originalText']: reasons.append('spoken-text-differs-from-script')
    if line.get('dynamicTemplateInstance'): reasons.append('dynamic-line-needs-explicit-mapping')
    current_sources = []
    for source in line['sources']:
        path = ROOT / source['path']
        if path.is_file() and line['originalText'] in path.read_text():
            current_sources.append(dict(path=source['path'], sha256=sha(path.read_bytes())))
    if not current_sources: reasons.append('exact-text-not-found-in-current-source')
    filename = Path(line['prepared_mp3']).stem
    export = read(f'metadata/exports/{filename}.json')
    asr = read(f'metadata/asr/{filename}.json')
    if export.get('flags') or not export.get('mp3_decoded') or not export.get('prepared_analysis', {}).get('finite'):
        reasons.append('export-needs-review')
    if export.get('prepared_mp3_sha256') != line.get('prepared_mp3_sha256'): reasons.append('export-hash-disagrees')
    if asr.get('source_sha256') != line.get('source_sha256') or asr.get('expected') != line.get('readText'):
        reasons.append('asr-source-disagrees')
    case = cases.get(id)
    flags = asr.get('reviewFlags', [])
    if flags and (not case or case.get('needsListenback') is not False
                  or case.get('sourceSha256') != line.get('source_sha256')):
        reasons.append('unresolved-asr-flags')
    if case and case.get('needsListenback'): reasons.append('asr-listenback-required')
    screenings.append(dict(id=id, productionStatus=line['productionStatus'], primaryAsrFlags=flags,
        disposition=case.get('disposition') if case else 'no-machine-flags',
        needsListenback=case.get('needsListenback') if case else False,
        timing=timing_by_line[id], excludedReasons=reasons))
    if reasons:
        excluded.append(dict(id=id, scene=line['scene'], reason=reasons[0], reasons=reasons))
        continue
    source = BASE / line['prepared_mp3']; data = source.read_bytes()
    assert sha(data) == line['prepared_mp3_sha256'], f'changed MP3 {id}'
    file = f"audio/voice/{line['scene']}/{source.name}"
    copies[file] = data
    source_text = line['originalText']
    assert sha(source_text.encode()) == line['textSha256']
    provenance = dict(sourceFreeze=manifest['sourceFreeze'], currentSources=current_sources,
        speakerId=line['speakerId'], referenceApproved=line['reference']['approvalStatus'],
        referenceSha256=line['reference']['sha256'], sourceTextSha256=line['textSha256'],
        humanListeningApproval=False,
        technicalVerification='Finite WAV, no export flags, MP3 decoded; exact current script text; completed source-linked ASR and final timing disposition.',
        asr=dict(record=f'metadata/asr/{filename}.json', recordSha256=sha(snapshots[f'metadata/asr/{filename}.json']),
            sourceSha256=asr['source_sha256'], primaryFlags=flags,
            disposition=case.get('disposition') if case else 'no-machine-flags',
            needsListenback=False, humanListeningApproval=False),
        timing=dict(records=timing_by_line[id], needsIntegrationTimingReview=False),
        method='Original fictional character base; authorized local Qwen3-TTS production; no references/bases shipped.')
    selected.append(dict(id=id, source='campaign-voice-01/'+line['prepared_mp3'], file=file,
        sha256=line['prepared_mp3_sha256'], bytes=len(data), duration=line['duration_s'], kind='voice', provenance=provenance))
    label = line['sourceSpeakerLabel']
    if label == '$player.name': label = '陆闻川' if line['speakerId'].startswith('lu.') else '周延'
    dialogue.append(dict(assetId=id, scenario=scenarios[line['scene']], speaker=label, text=source_text, duration=line['duration_s']))

# Do not freeze a producer snapshot that changed while it was being checked.
for relative, data in snapshots.items():
    assert (BASE / relative).read_bytes() == data, f'Producer still changing: {relative}'
new = {x['id']: x for x in selected if x['kind'] == 'voice'}
excluded_by_id = {x['id']: x for x in excluded}
revision = dict(recordedAtUtc=datetime.now(timezone.utc).isoformat(),
    initialSelectionSha256=sha(prior_bytes), previousVoiceCount=len(old), selectedVoiceCount=len(new),
    removed=[dict(id=id, reasons=excluded_by_id[id]['reasons'], previousSha256=old[id]['sha256']) for id in sorted(old.keys()-new.keys())],
    added=[dict(id=id, sha256=new[id]['sha256']) for id in sorted(new.keys()-old.keys())],
    replaced=[id for id in old.keys() & new.keys() if old[id]['sha256'] != new[id]['sha256']],
    screeningCounts=dict(initialAsrFlags=summary['flaggedCount'], unresolvedAsr=len(review['remainingListenbackLineIds']),
        timingOccurrences=len(timing['records']), timingFlaggedLineIds=sum(any(x['needsIntegrationTimingReview'] for x in values) for values in timing_by_line.values())),
    limits=['ASR is machine screening, not audible pronunciation/acting approval.',
        'No transcript, timeline, source audio or producer review disposition was modified.',
        'All music/SFX bytes remain identical to initial selection.',
        'Runtime must still drop a selected line if actual remaining subtitle time is shorter than decoded audio.'])
ledger = dict(prior)
ledger['frozenAtUtc'] = revision['recordedAtUtc']
ledger['revision'] = 2
ledger['counts'] = dict(collections.Counter(x['kind'] for x in selected))
ledger['bytes'] = sum(x['bytes'] for x in selected)
ledger['selected'] = selected
ledger['excludedVoices'] = excluded
ledger['sourceManifests'] = [x for x in prior['sourceManifests'] if not x['path'].startswith('campaign-voice-01/')]
ledger['sourceManifests'] += [dict(path='campaign-voice-01/'+p, sha256=sha(snapshots[p])) for p in
    ['dialogue-manifest.json', 'metadata/dialogue-timing-review.json', 'metadata/asr-review-decisions.json', 'metadata/asr-summary.json', 'metadata/voice-approval.json']]
ledger['limitations'] = [x for x in ledger['limitations'] if 'Dialogue may' not in x] + revision['limits']
if not prior_path.exists(): prior_path.write_bytes(prior_bytes)
for file, data in copies.items():
    target = ROOT / 'public' / file
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists() or target.read_bytes() != data: target.write_bytes(data)
for id in old.keys()-new.keys():
    target = ROOT / 'public' / old[id]['file']
    # Only delete our exact obsolete frozen copy, never a collaborator's replacement.
    if target.exists():
        assert sha(target.read_bytes()) == old[id]['sha256']
        target.unlink()
(EVIDENCE / 'voice-revision.json').write_text(encode(revision))
(EVIDENCE / 'voice-screening.json').write_text(encode(screenings))
(EVIDENCE / 'selection.json').write_text(encode(ledger))
(OUT / 'provenance.json').write_text(encode(ledger))
catalog = {x['id']: dict(id=x['id'], url=x['file'], sha256=x['sha256'], bytes=x['bytes'], duration=x['duration'], kind=x['kind'], gain=1) for x in selected}
(ROOT / 'src/audio/catalog.ts').write_text('// Frozen production candidates; provenance and hashes: public/audio/provenance.json.\n'
    + "import type { AudioAsset, DialogueAsset } from './contracts';\n"
    + 'export const AUDIO_CATALOG: Readonly<Record<string, AudioAsset>> = '+json.dumps(catalog, ensure_ascii=False, indent=2)+';\n'
    + 'export const DIALOGUE_CATALOG: readonly DialogueAsset[] = '+json.dumps(dialogue, ensure_ascii=False, indent=2)+';\n')
print(encode(dict(counts=ledger['counts'], bytes=ledger['bytes'], removed=len(revision['removed']), added=len(revision['added']), replaced=revision['replaced'],
                 scenes=dict(collections.Counter(x['id'].split('.')[0] for x in new.values())))))

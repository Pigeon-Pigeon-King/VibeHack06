import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AUDIO_CATALOG, DIALOGUE_CATALOG } from '../src/audio/catalog';

const root = resolve(import.meta.dirname, '..');
const bytes = (url: string) => readFileSync(resolve(root, 'public', url));
const sha = (data: Buffer | string) => createHash('sha256').update(data).digest('hex');

function mp3Frames(data: Buffer) {
  let offset = data.toString('ascii', 0, 3) === 'ID3'
    ? 10 + ((data[6] & 127) << 21 | (data[7] & 127) << 14 | (data[8] & 127) << 7 | data[9] & 127) + (data[5] & 16 ? 10 : 0) : 0;
  let duration = 0, frames = 0;
  while (offset + 4 <= data.length) {
    if (data.toString('ascii', offset, offset + 3) === 'TAG' && data.length - offset === 128) { offset += 128; break; }
    const h = data.readUInt32BE(offset);
    expect((h >>> 21) & 0x7ff).toBe(0x7ff);
    const version = h >>> 19 & 3, layer = h >>> 17 & 3, rateIndex = h >>> 10 & 3, bitrateIndex = h >>> 12 & 15;
    expect(version).not.toBe(1); expect(layer).toBe(1); expect(rateIndex).toBeLessThan(3);
    expect(bitrateIndex).toBeGreaterThan(0); expect(bitrateIndex).toBeLessThan(15);
    const bitrate = (version === 3 ? [0,32,40,48,56,64,80,96,112,128,160,192,224,256,320] : [0,8,16,24,32,40,48,56,64,80,96,112,128,144,160])[bitrateIndex];
    const sampleRate = [44100,48000,32000][rateIndex] / (version === 3 ? 1 : version === 2 ? 2 : 4);
    offset += Math.floor((version === 3 ? 144 : 72) * bitrate * 1000 / sampleRate) + (h >>> 9 & 1);
    duration += (version === 3 ? 1152 : 576) / sampleRate; ++frames;
    expect(offset).toBeLessThanOrEqual(data.length);
  }
  expect(offset).toBe(data.length); expect(frames).toBeGreaterThan(1);
  return duration;
}

describe('frozen production runtime audio', () => {
  it('matches the selection ledger, exact frozen hashes and byte lengths, with no private paths or original bases', () => {
    const ledgerText = readFileSync(resolve(root, 'public/audio/provenance.json'), 'utf8');
    const ledger = JSON.parse(ledgerText) as { selected: Array<{ id: string; sha256: string; bytes: number; file: string }>; bytes: number };
    expect(ledgerText).not.toMatch(/\/Users\/|api[_-]?key|access[_-]?token|private[_-]?key/i);
    expect(ledger.selected.length).toBe(Object.keys(AUDIO_CATALOG).length);
    let total = 0;
    for (const asset of Object.values(AUDIO_CATALOG)) {
      const data = bytes(asset.url), selected = ledger.selected.find(item => item.id === asset.id)!;
      expect(data.length, asset.id).toBe(asset.bytes); expect(sha(data), asset.id).toBe(asset.sha256);
      expect(selected.sha256).toBe(asset.sha256); expect(selected.file).toBe(asset.url); total += data.length;
      expect(asset.url).not.toMatch(/source|base\.wav|audition|rotor|hover/i);
    }
    expect(total).toBe(ledger.bytes);
    // The separately frozen narration batch has its own complete manifest/hash
    // audit; retain an explicit allowlist so no other production files can ship.
    expect(readdirSync(resolve(root, 'public/audio')).sort()).toEqual(['chapter-bridge-01', 'music', 'provenance.json', 'sfx', 'voice']);
  });
  it('parses the complete PCM WAV containers and confirms all selected effects have actual sample data', () => {
    for (const asset of Object.values(AUDIO_CATALOG).filter(asset => asset.kind === 'sfx')) {
      const data = bytes(asset.url); expect(data.toString('ascii', 0, 4)).toBe('RIFF'); expect(data.toString('ascii', 8, 12)).toBe('WAVE');
      expect(data.readUInt32LE(4) + 8).toBe(data.length);
      let offset = 12, rate = 0, channels = 0, block = 0, samples = 0;
      while (offset + 8 <= data.length) {
        const tag = data.toString('ascii', offset, offset + 4), size = data.readUInt32LE(offset + 4), body = offset + 8;
        expect(body + size).toBeLessThanOrEqual(data.length);
        if (tag === 'fmt ') {
          expect(data.readUInt16LE(body)).toBe(1); channels = data.readUInt16LE(body + 2); rate = data.readUInt32LE(body + 4);
          block = data.readUInt16LE(body + 12); expect(data.readUInt16LE(body + 14)).toBe(16);
        }
        if (tag === 'data') { samples = size; expect(data.subarray(body, body + size).some(value => value !== 0)).toBe(true); }
        offset = body + size + (size & 1);
      }
      expect(channels).toBe(1); expect(rate).toBe(48000); expect(samples).toBeGreaterThan(0);
      expect(samples / block / rate).toBeCloseTo(asset.duration, 3);
    }
  });
  it('parses every MP3 frame for selected music and voices, with measured duration close to frozen metadata', () => {
    for (const asset of Object.values(AUDIO_CATALOG).filter(asset => asset.kind !== 'sfx')) {
      const duration = mp3Frames(bytes(asset.url));
      expect(Math.abs(duration - asset.duration), asset.id).toBeLessThan(0.15);
    }
  });
  it('ships only the 11 exact approved full music cues and exact current script text for every voice', () => {
    const music = Object.values(AUDIO_CATALOG).filter(asset => asset.kind === 'music');
    expect(music).toHaveLength(11); expect(music.every(asset => asset.url.endsWith('-full.mp3'))).toBe(true);
    const ledger = JSON.parse(readFileSync(resolve(root, 'public/audio/provenance.json'), 'utf8'));
    for (const asset of music) {
      const selection = ledger.selected.find((item: { id: string }) => item.id === asset.id);
      expect(selection.provenance.approval.auditioned_sha256).toBe(asset.sha256);
    }
    const missionFiles = readdirSync(resolve(root, 'src/mission')).filter(name => name.endsWith('.ts')).map(name => readFileSync(resolve(root, 'src/mission', name), 'utf8'));
    const excluded = new Set(ledger.excludedVoices.map((item: { id: string }) => item.id));
    for (const line of DIALOGUE_CATALOG) {
      expect(missionFiles.some(text => text.includes(line.text)), line.assetId).toBe(true);
      expect(excluded.has(line.assetId)).toBe(false);
      const selection = ledger.selected.find((item: { id: string }) => item.id === line.assetId);
      expect(selection.provenance.sourceTextSha256).toBe(sha(line.text));
      expect(selection.provenance.approval.status).toBe('user_approved_for_integration');
      expect(selection.provenance.approval.scope).toBe('overall_batch');
      expect(selection.provenance.spokenTextSha256).toBe(sha(selection.provenance.spokenText));
      expect(selection.provenance.referenceSha256).toMatch(/^[a-f0-9]{64}$/);
    }
  });
  it('includes all 175 approved implemented voices, retaining ASR history and excluding only the unimplemented candidate', () => {
    const ledger = JSON.parse(readFileSync(resolve(root, 'public/audio/provenance.json'), 'utf8'));
    const files = readdirSync(resolve(root, 'public/audio/voice'), { recursive: true }).map(String).filter(path => path.endsWith('.mp3'));
    expect(files).toHaveLength(175);
    expect(new Set(DIALOGUE_CATALOG.map(line => line.assetId)).size).toBe(175);
    expect(DIALOGUE_CATALOG).toHaveLength(184); // One shared bark, ten adult campaign scenarios.
    expect(ledger.counts).toEqual({ music: 11, sfx: 18, voice: 175 });
    expect(ledger.excludedVoices).toHaveLength(1);
    expect(ledger.excludedVoices[0].reason).toBe('script_candidate_not_implemented');
    expect(ledger.selected.filter((item: {kind: string; provenance: {asr?: {needsListenback: boolean}}}) => item.kind === 'voice' && item.provenance.asr?.needsListenback)).toHaveLength(3);
    for (const item of ledger.excludedVoices as Array<{ id: string }>) {
      expect(AUDIO_CATALOG[item.id]).toBeUndefined();
      expect(files.some(path => path.includes(item.id))).toBe(false);
    }
    expect(DIALOGUE_CATALOG.some(line => line.scenario === 'epilogue')).toBe(true);
  });
  it('keeps speaker age, radio aliases, conditional dynamic lines and original subtitle spelling unambiguous', () => {
    const keys = DIALOGUE_CATALOG.map(line => [line.scenario, line.speaker, line.text].join('|'));
    expect(new Set(keys).size).toBe(keys.length);
    const shared = DIALOGUE_CATALOG.filter(line => line.assetId.startsWith('shared.'));
    expect(shared).toHaveLength(10); expect(shared.every(line => line.optional && !['childhood', 'mainhall'].includes(line.scenario))).toBe(true);
    expect(DIALOGUE_CATALOG.filter(line => line.scenario === 'mainhall' && line.speaker === '周延').every(line => line.speakerId === 'zhou.a23')).toBe(true);
    expect(DIALOGUE_CATALOG.filter(line => line.scenario === 'relief' && line.speaker === '周延').every(line => line.speakerId === 'zhou.a33')).toBe(true);
    const radio = DIALOGUE_CATALOG.find(line => line.assetId === 's12.zheng.531bba91d6')!;
    expect(radio.text).toContain('C03');
    const ledger = JSON.parse(readFileSync(resolve(root, 'public/audio/provenance.json'), 'utf8'));
    expect(ledger.selected.find((item: {id: string}) => item.id === radio.assetId).provenance.spokenText).toContain('C零三');
  });
});

/// <reference types="node" />
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CAMPAIGN_OPENING, CHAPTER_BRIDGES, CHAPTER_TRANSITION_SCRIPTS } from '../../src/chapter-transition/catalog';
import { getNarrationBaseURL, NARRATION_ASSETS } from '../../src/chapter-transition/narration-assets';

const root = fileURLToPath(new URL('../../', import.meta.url));
const runtime = resolve(root, 'public/audio/chapter-bridge-01');
const bytesAt = (path: string) => readFileSync(resolve(root, path));
const sha256 = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const frozen = {
  opening: '2cedf112062c87b7f30119f44f10623124cfe1a2d6ecb892b1c196c5d1533194',
  bridges: '3680b3bbf98aa365b652f732fad0f955e3ae4e2316b462ad0cbe9353d078d93d',
  production: '0d01be87fbf0024e8d7d72e9543a2288b0e7371194dd678fe77b930814360d39',
  manifest: '5b8a44bb60676fc5d41b0b2091198de7ef105b2c6e66166f308d594f8ecfe9be',
};
interface DeliveredAsset {
  cueId: string; sequenceId: string; text: string; file: string; durationSeconds: number;
  sha256: string; bytes: number; sourceTextSha256: string; sourceFileSha256: string;
}
const manifest = JSON.parse(readFileSync(resolve(runtime, 'manifest.json'), 'utf8')) as {
  assets: DeliveredAsset[]; sourceTextHashes: { path: string; sha256: string }[];
  productionListSha256: string; sourceTextSha256: string; expectedCueCount: number; complete: boolean;
};
const production = JSON.parse(bytesAt('docs/chapter-transition/narration-production.json').toString()) as {
  sources: { path: string; sha256: string }[];
  sequences: { id: string; cueIds: string[] }[];
  cues: { cueId: string; sequenceId: string; text: string; readingSeconds: number }[];
};
const copyAudit = JSON.parse(bytesAt('artifacts/chapter-transition-integration/audio/source-copy-audit.json').toString()) as {
  files: { file: string; bytes: number; sourceSha256: string; runtimeSha256: string; byteIdenticalToSource: boolean }[];
  audioBytes: number; runtimeBytes: number; sourceFilesUnchanged: boolean;
};

function filesBelow(directory: string, prefix = ''): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const relative = `${prefix}${entry.name}`;
    if (entry.isDirectory()) return filesBelow(resolve(directory, entry.name), `${relative}/`);
    expect(entry.isFile(), `Only regular runtime files: ${relative}`).toBe(true);
    return [relative];
  }).sort();
}

/** Structural check of every MPEG frame; not a substitute for listening or media decoding. */
function mp3FrameDuration(bytes: Buffer): number {
  expect(bytes.subarray(0, 3).toString()).toBe('ID3');
  expect(bytes[3]).toBe(4);
  const size = bytes.subarray(6, 10).reduce((value, byte) => value * 128 + (byte & 0x7f), 0);
  let offset = 10 + size + ((bytes[5] & 0x10) ? 10 : 0), frames = 0;
  while (offset < bytes.length) {
    expect(offset + 4).toBeLessThanOrEqual(bytes.length);
    const header = bytes.readUInt32BE(offset);
    expect(header >>> 21).toBe(0x7ff);
    expect((header >>> 19) & 3).toBe(3); // MPEG-1
    expect((header >>> 17) & 3).toBe(1); // Layer III
    expect((header >>> 12) & 15).toBe(11); // 192 kbps
    expect((header >>> 10) & 3).toBe(1); // 48 kHz
    expect((header >>> 6) & 3).toBe(3); // mono
    offset += Math.floor(144_000 * 192 / 48_000) + ((header >>> 9) & 1);
    expect(offset).toBeLessThanOrEqual(bytes.length);
    frames++;
  }
  expect(offset).toBe(bytes.length); expect(frames).toBeGreaterThan(0);
  return frames * 1152 / 48_000;
}

afterEach(() => vi.unstubAllGlobals());

describe('frozen chapter narration delivery', () => {
  it('matches every opening/bridge cue and the production table exactly, once and in play order', () => {
    expect(CAMPAIGN_OPENING.cues).toHaveLength(4);
    expect(CHAPTER_BRIDGES).toHaveLength(11);
    expect(CHAPTER_BRIDGES.flatMap(script => script.cues)).toHaveLength(27);
    const cues = CHAPTER_TRANSITION_SCRIPTS.flatMap(script => script.cues.map(cue => ({
      cueId: cue.id, sequenceId: script.id, text: cue.text, readingSeconds: cue.readingSeconds,
    })));
    expect(cues).toHaveLength(31); expect(production.cues).toEqual(cues);
    expect(production.sequences.map(sequence => sequence.id)).toEqual(CHAPTER_TRANSITION_SCRIPTS.map(script => script.id));
    expect(manifest.assets.map(({ cueId, sequenceId, text }) => ({ cueId, sequenceId, text })))
      .toEqual(cues.map(({ cueId, sequenceId, text }) => ({ cueId, sequenceId, text })));
    expect(new Set(NARRATION_ASSETS.map(asset => asset.cueId)).size).toBe(31);
    expect(manifest.expectedCueCount).toBe(31); expect(manifest.complete).toBe(true);
  });

  it('bundles only the five playback/digest fields from the delivered manifest', () => {
    expect(NARRATION_ASSETS).toEqual(manifest.assets.map(({ cueId, text, file, durationSeconds, sha256 }) => ({ cueId, text, file, durationSeconds, sha256 })));
    for (const asset of NARRATION_ASSETS) {
      expect(Object.keys(asset).sort()).toEqual(['cueId', 'durationSeconds', 'file', 'sha256', 'text']);
      expect(asset.durationSeconds).toBeGreaterThan(0); expect(Number.isFinite(asset.durationSeconds)).toBe(true);
    }
  });

  it('freezes both text sources, the 31-cue production table and the original runtime manifest', () => {
    expect(sha256(bytesAt('src/chapter-transition/opening.json'))).toBe(frozen.opening);
    expect(sha256(bytesAt('src/chapter-transition/bridges.json'))).toBe(frozen.bridges);
    expect(sha256(bytesAt('docs/chapter-transition/narration-production.json'))).toBe(frozen.production);
    expect(sha256(readFileSync(resolve(runtime, 'manifest.json')))).toBe(frozen.manifest);
    expect(manifest.sourceTextHashes).toEqual(production.sources);
    expect(manifest.sourceTextSha256).toBe(frozen.bridges);
    expect(manifest.productionListSha256).toBe(frozen.production);
    for (const asset of manifest.assets) {
      expect(sha256(asset.text)).toBe(asset.sourceTextSha256);
      expect(asset.sourceFileSha256).toBe(asset.sequenceId === 'opening-campaign' ? frozen.opening : frozen.bridges);
    }
  });

  it('ships exactly 31 selected MP3s and two source records, with no unused takes or mixes', () => {
    expect(filesBelow(runtime)).toEqual(['README.txt', 'manifest.json', ...NARRATION_ASSETS.map(asset => asset.file)].sort());
    expect(NARRATION_ASSETS.filter(asset => asset.file.endsWith('.t02.mp3')).map(asset => asset.cueId)).toEqual([
      'bridge-s04-s05-01', 'bridge-s08-s09-02', 'bridge-s10-s11-01',
    ]);
    expect(manifest.assets.reduce((sum, asset) => sum + asset.bytes, 0)).toBe(4_230_356);
    expect(copyAudit.audioBytes).toBe(4_230_356);
  });

  it('matches the frozen source byte inventory for all 33 copied files', () => {
    expect(copyAudit.files.map(file => file.file)).toEqual(filesBelow(runtime));
    for (const item of copyAudit.files) {
      const bytes = readFileSync(resolve(runtime, item.file));
      expect(bytes.length).toBe(item.bytes);
      expect(sha256(bytes)).toBe(item.sourceSha256);
      expect(item.runtimeSha256).toBe(item.sourceSha256);
      expect(item.byteIdenticalToSource).toBe(true);
    }
    expect(copyAudit.runtimeBytes).toBe(4_259_146); expect(copyAudit.sourceFilesUnchanged).toBe(true);
  });

  it.each(manifest.assets)('validates the path, full digest and complete MP3 frames: $cueId', asset => {
    expect(asset.file).toBe(`audio/${asset.sequenceId}/${asset.cueId}.${asset.file.endsWith('.t02.mp3') ? 't02' : 't01'}.mp3`);
    expect(asset.file).toMatch(/^audio\/[a-z0-9-]+\/[a-z0-9-]+\.t0[12]\.mp3$/);
    const path = resolve(runtime, asset.file);
    expect(lstatSync(path).isFile()).toBe(true); expect(lstatSync(path).isSymbolicLink()).toBe(false);
    const bytes = readFileSync(path);
    expect(bytes.length).toBe(asset.bytes); expect(sha256(bytes)).toBe(asset.sha256);
    expect(mp3FrameDuration(bytes)).toBeCloseTo(asset.durationSeconds, 9);
  });

  // Production originals need not ship with the game. Set this for the actual copy audit.
  const delivery = process.env.NARRATION_DELIVERY_RUNTIME;
  it.runIf(Boolean(delivery))('compares every copied file byte-for-byte with the production originals', () => {
    expect(filesBelow(delivery!)).toEqual(filesBelow(runtime));
    for (const file of copyAudit.files) {
      const original = readFileSync(resolve(delivery!, file.file));
      expect(readFileSync(resolve(runtime, file.file)).equals(original)).toBe(true);
      expect(sha256(original)).toBe(file.sourceSha256);
    }
  });
});

describe('entry-relative narration asset base', () => {
  it.each([
    ['https://game.test/index.html', 'https://game.test/audio/chapter-bridge-01/'],
    ['https://game.test/release/candidate/index.html?mode=campaign#start', 'https://game.test/release/candidate/audio/chapter-bridge-01/'],
    ['http://127.0.0.1:5191/', 'http://127.0.0.1:5191/audio/chapter-bridge-01/'],
    ['game://local/index.html', 'game://local/audio/chapter-bridge-01/'],
    ['game://local/candidate/index.html', 'game://local/candidate/audio/chapter-bridge-01/'],
    ['file:///offline/game/index.html', 'file:///offline/game/audio/chapter-bridge-01/'],
  ])('resolves beside the deployed document: %s', (documentURL, expected) => {
    expect(getNarrationBaseURL(documentURL).href).toBe(expected);
    for (const asset of NARRATION_ASSETS) {
      expect(new URL(asset.file, getNarrationBaseURL(documentURL)).href).toBe(`${expected}${asset.file}`);
    }
  });
  it('defaults to document.baseURI rather than a JS chunk location or origin root', () => {
    vi.stubGlobal('document', { baseURI: 'game://local/subdirectory/index.html' });
    expect(getNarrationBaseURL().href).toBe('game://local/subdirectory/audio/chapter-bridge-01/');
  });
});

import { it, expect } from 'vitest';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { Sound } from '../../../../src/presentation/Sound';
import { AUDIO_CATALOG, DIALOGUE_CATALOG } from '../../../../src/audio/catalog';
import { Context, buffer, flush } from './device';
const dir = 'artifacts/asset-integration/audio/trace';
const assets = Object.values(AUDIO_CATALOG).filter(a => a.kind === 'voice');
const catalog = Object.fromEntries(assets.map(a => [a.id, a]));
const traces = readdirSync(dir).filter(f => f.endsWith('.test.ts.json')).flatMap(f => JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')).map((t: any) => ({ ...t, file: f })));
it('replays actual public-input mission event traces through Sound using the approved recording durations', async () => {
  const results = [];
  for (const trace of traces) {
    if (!trace.records.length || !trace.end?.complete) continue;
    const context = new Context();
    context.decodeAudioData.mockImplementation(async data => {
      const index = new Uint8Array(data)[0] - 1, a = assets[index];
      return buffer(index + 1, a.duration, Math.ceil(a.duration * 100));
    });
    const played: Array<{id: string; time: number; offset: number}> = [];
    const sound = new Sound({ createContext: () => context.native, baseUrl: 'https://trace.test/', catalog,
      fetcher: async url => new Response(new Uint8Array([assets.findIndex(a => String(url).endsWith(a.url)) + 1])) });
    sound.setScene(1, trace.initial);
    if (trace.initial.elapsed === 0) sound.say({ epoch: 1, revision: 'initial', scenario: trace.scenario, speaker: trace.initial.speaker, text: trace.initial.subtitle, elapsed: 0, expiresAt: trace.initial.subtitleUntil });
    await sound.unlock(); await flush();
    let maxQueue = 0, clock = 0, previousElapsed = trace.initial.elapsed, atCompletion = 0, completionQueue = 0;
    const starts = new WeakMap<object, number>();
    const observe = () => {
      for (const source of context.sources) if (!source.loop && source.buffer && source.starts.length && !starts.has(source)) {
        starts.set(source, clock);
        played.push({ id: assets[source.buffer.marker! - 1].id, time: clock, offset: source.starts[0][1] ?? 0 });
      }
      maxQueue = Math.max(maxQueue, sound.getStatus().queuedDialogue);
    };
    observe();
    const tick = async (seconds: number) => {
      clock += seconds; context.currentTime = clock;
      for (const source of context.sources) {
        if (source.disconnected || !source.buffer || source.loop || !starts.has(source)) continue;
        if (clock - starts.get(source)! >= source.buffer.duration - (source.starts[0][1] ?? 0)) source.finish();
      }
      sound.advanceDialogue(seconds); await flush(); observe();
    };
    for (const record of trace.records) {
      const elapsed = record.mission.elapsed;
      let gap = Math.max(0, elapsed - previousElapsed);
      while (gap > 1 / 60 + 1e-7) { await tick(1 / 60); gap -= 1 / 60; }
      if (record.skipped) sound.stopTransient();
      sound.updateMission(record.mission);
      for (const cue of record.cues) sound.say(cue);
      await flush(); observe(); if (gap > 0) await tick(gap);
      previousElapsed = elapsed;
      if (record.mission.complete) { atCompletion = clock; completionQueue = sound.getStatus().queuedDialogue; }
    }
    while (sound.hasPendingDialogue() && clock - atCompletion < 300) await tick(1 / 60);
    const tail = +(clock - atCompletion).toFixed(3);
    results.push({ scenario: trace.scenario, test: trace.test, file: trace.file, startPhase: trace.initial.phase,
      startElapsed: trace.initial.elapsed, elapsed: trace.end.elapsed, skips: trace.skips, maxQueue,
      completionQueue, completionTailSeconds: tail, played: played.length, uniquePlayed: new Set(played.map(p => p.id)).size,
      errors: sound.getStatus().errors, playback: played });
    expect(sound.hasPendingDialogue(), `${trace.scenario} queue drains`).toBe(false);
    expect(maxQueue, `${trace.scenario} avoids overflow`).toBeLessThan(32);
    expect(tail, `${trace.scenario} keeps chapter-end dialogue below ten seconds`).toBeLessThan(10);
    expect(sound.getStatus().errors, `${trace.scenario} audio errors`).toEqual([]); sound.dispose();
  }
  writeFileSync('artifacts/asset-integration/audio/dialogue-route-metrics.json', JSON.stringify({
    evidence: 'Actual Simulation public-input traces replayed through the real Sound queue; controllable Web Audio device uses approved measured durations. No browser rendering or audible human acceptance is claimed.',
    runs: results,
  }, null, 2) + '\n');
  expect(results.length).toBeGreaterThan(12);
}, 120000);

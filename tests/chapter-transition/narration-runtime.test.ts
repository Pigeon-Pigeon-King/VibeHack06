/// <reference types="node" />
import { readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CHAPTER_TRANSITION_SCRIPTS } from '../../src/chapter-transition/catalog';
import { HtmlNarrationPlayer, type NarrationMedia } from '../../src/chapter-transition/HtmlNarrationPlayer';
import { getNarrationBaseURL, NARRATION_ASSETS } from '../../src/chapter-transition/narration-assets';
import { TransitionController } from '../../src/chapter-transition/TransitionController';
import type { TransitionScript } from '../../src/chapter-transition/types';

const publicBundle = new URL('../../public/audio/chapter-bridge-01/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', publicBundle), 'utf8')) as {
  assets: { cueId: string; text: string; file: string; durationSeconds: number }[];
};
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

/** Only the browser media boundary is replaced; playback/controller logic stays real. */
class EventMedia extends EventTarget implements NarrationMedia {
  src = ''; preload = ''; volume = 1;
  pauses = 0; releases = 0;
  constructor(private readonly request: (url: string) => void) { super(); }
  async play(): Promise<void> { this.request(this.src); }
  pause(): void { this.pauses++; }
  load(): void { this.releases++; }
  removeAttribute(name: string): void { if (name === 'src') this.src = ''; }
}

const deployments = [
  { name: 'HTTPS subpath', entry: 'https://game.test/releases/candidate/index.html', base: 'https://game.test/releases/candidate/audio/chapter-bridge-01/' },
  { name: 'desktop game://local', entry: 'game://local/index.html', base: 'game://local/audio/chapter-bridge-01/' },
];

describe.each(deployments)('frozen narration runtime: $name', deployment => {
  it.each(CHAPTER_TRANSITION_SCRIPTS.map((script, index) => ({ script, id: script.id, loadFirst: index % 2 === 0 })))
   ('runs every cue in $id and enters once (preload first: $loadFirst)', async ({ script, loadFirst }) => {
      const requested: string[] = [], media: EventMedia[] = [];
      const narrator = new HtmlNarrationPlayer(NARRATION_ASSETS, getNarrationBaseURL(deployment.entry), () => {
        const item = new EventMedia(url => requested.push(url)); media.push(item); return item;
      });
      narrator.setVolume(0); // Muting must preserve ended-driven narration, not skip it.
      const prepared = { sequenceId: script.id, next: script.to };
      let finishLoad!: (value: typeof prepared) => void, preloadCalls = 0;
      const loading = new Promise<typeof prepared>(resolve => { finishLoad = resolve; });
      const entered: { value: typeof prepared; script: TransitionScript }[] = [];
      const released: (typeof prepared)[] = [];
      const controller = new TransitionController<typeof prepared>({
        narration: narrator,
        preload: (sequence, signal, progress) => {
          preloadCalls++; expect(sequence.id).toBe(script.id); expect(signal.aborted).toBe(false);
          progress(0.5); return loading;
        },
        enter: (value, sequence) => entered.push({ value, script: sequence }),
        release: value => released.push(value),
      });
      try {
        expect(controller.start(script)).toBe(true);
        if (loadFirst) { finishLoad(prepared); await flush(); }
        const subtitles: string[] = [];
        const expectedURLs = script.cues.map(cue => {
          const asset = manifest.assets.find(item => item.cueId === cue.id)!;
          expect(asset.text).toBe(cue.text);
          expect(statSync(new URL(asset.file, publicBundle)).isFile()).toBe(true);
          return `${deployment.base}${asset.file}`;
        });

        for (const [index, cue] of script.cues.entries()) {
          const asset = manifest.assets.find(item => item.cueId === cue.id)!;
          expect(controller.snapshot).toMatchObject({ phase: 'active', narrationState: 'playing', cueIndex: index, cue });
          subtitles.push(controller.snapshot.cue!.text);
          expect(media).toHaveLength(index + 1);
          expect(requested).toEqual(expectedURLs.slice(0, index + 1));
          expect(media[index].src).toBe(expectedURLs[index]);
          expect(media[index].volume).toBe(0);

          // Even passing the file's reported duration cannot substitute for ended.
          controller.tick(asset.durationSeconds + 0.25); await flush();
          expect(controller.snapshot.cue).toEqual(cue); expect(entered).toHaveLength(0);

          controller.setPaused(true);
          expect(media[index].pauses).toBeGreaterThan(0);
          media[index].dispatchEvent(new Event('ended')); await flush();
          controller.tick(120);
          expect(controller.snapshot).toMatchObject({ paused: true, cueIndex: index, cue, narrationState: 'playing' });
          expect(media).toHaveLength(index + 1); expect(entered).toHaveLength(0);
          expect(media[index].src).toBe(''); expect(media[index].releases).toBe(1);

          controller.setPaused(false);
          expect(controller.snapshot.cue).toEqual(cue); expect(entered).toHaveLength(0);
          controller.tick(0);
          if (index + 1 < script.cues.length) {
            expect(controller.snapshot).toMatchObject({ cueIndex: index + 1, cue: script.cues[index + 1], narrationState: 'playing' });
            expect(entered).toHaveLength(0);
          }
        }

        expect(subtitles).toEqual(script.cues.map(cue => cue.text));
        expect(requested).toEqual(expectedURLs);
        if (!loadFirst) {
          expect(controller.snapshot).toMatchObject({ phase: 'active', narrationState: 'complete', loadState: 'loading', cue: null });
          controller.tick(120); expect(entered).toHaveLength(0);
          finishLoad(prepared); await flush();
          expect(entered).toHaveLength(0);
          controller.tick(0);
        }
        expect(entered).toEqual([{ value: prepared, script }]);
        expect(controller.snapshot).toMatchObject({ phase: 'entered', narrationState: 'complete', cue: null });
        controller.tick(120); expect(controller.start(script)).toBe(false);
        expect(entered).toHaveLength(1); expect(preloadCalls).toBe(1);
        expect(requested).toEqual(expectedURLs); expect(released).toHaveLength(0);
      } finally {
        controller.dispose(); narrator.dispose();
      }
    });
});

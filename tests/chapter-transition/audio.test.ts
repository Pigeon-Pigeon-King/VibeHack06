import { describe, expect, it, vi } from 'vitest';
import { HtmlNarrationPlayer, type NarrationMedia } from '../../src/chapter-transition/HtmlNarrationPlayer';

class Media extends EventTarget implements NarrationMedia {
  src = ''; preload = ''; volume = 1;
  play = vi.fn(() => Promise.resolve());
  pause = vi.fn(); load = vi.fn();
  removeAttribute = vi.fn((name: string) => { if (name === 'src') this.src = ''; });
}
const cue = { id: 'cue-01', text: '车队转向北闸。', readingSeconds: 5 };
const asset = { cueId: cue.id, text: cue.text, file: 'bridge/cue-01.mp3', durationSeconds: 4.5 };
function setup(file = asset.file, baseURL = 'https://game.test/campaign/audio/') {
  const media: Media[] = [];
  const player = new HtmlNarrationPlayer([{ ...asset, file }], new URL(baseURL), () => { const m = new Media(); media.push(m); return m; });
  return { player, media, signal: new AbortController() };
}

describe('local narration playback', () => {
  it('uses actual ended even when muted, and releases the source', async () => {
    const { player, media, signal } = setup(); player.setVolume(0);
    const playback = player.play(cue, signal.signal);
    expect(media[0].src).toBe('https://game.test/campaign/audio/bridge/cue-01.mp3'); expect(media[0].volume).toBe(0);
    let finished = false; void playback.finished.then(() => { finished = true; }); await Promise.resolve(); expect(finished).toBe(false);
    media[0].dispatchEvent(new Event('ended')); await expect(playback.finished).resolves.toBe('ended');
    expect(media[0].src).toBe(''); expect(media[0].load).toHaveBeenCalledOnce(); player.dispose();
  });
  it('falls back for missing cues and stale text without creating media', async () => {
    const { player, media, signal } = setup();
    await expect(player.play({ ...cue, id: 'missing' }, signal.signal).finished).resolves.toBe('unavailable');
    await expect(player.play({ ...cue, text: '改过的字幕。' }, signal.signal).finished).resolves.toBe('unavailable'); expect(media).toHaveLength(0);
  });
  it.each(['../outside.mp3', '/outside.mp3', 'https://remote.test/a.mp3', 'bridge\\bad.mp3', '%2e%2e/outside.mp3'])('rejects a source outside the local audio base: %s', async file => {
    const { player, media, signal } = setup(file); await expect(player.play(cue, signal.signal).finished).resolves.toBe('unavailable'); expect(media).toHaveLength(0);
  });
  it('falls back when audio errors or autoplay is rejected', async () => {
    const { player, media, signal } = setup(); let playback = player.play(cue, signal.signal);
    media[0].dispatchEvent(new Event('error')); await expect(playback.finished).resolves.toBe('unavailable');
    const rejected = new Media(); rejected.play.mockRejectedValue(new Error('NotAllowedError'));
    const blocked = new HtmlNarrationPlayer([asset], new URL('https://game.test/audio/'), () => rejected);
    playback = blocked.play(cue, signal.signal); await expect(playback.finished).resolves.toBe('unavailable');
  });
  it('pauses/resumes the same media and cancellation settles it once', async () => {
    const { player, media, signal } = setup(); const playback = player.play(cue, signal.signal);
    playback.pause(); await Promise.resolve(); playback.resume(); expect(media).toHaveLength(1); expect(media[0].play).toHaveBeenCalledTimes(2);
    signal.abort(); await expect(playback.finished).resolves.toBe('unavailable');
    media[0].dispatchEvent(new Event('ended')); playback.stop(); expect(media[0].load).toHaveBeenCalledOnce();
  });
  it('starting a cue stops the old cue; dispose blocks future playback', async () => {
    const { player, media, signal } = setup(); const first = player.play(cue, signal.signal); const second = player.play(cue, signal.signal);
    await expect(first.finished).resolves.toBe('unavailable'); expect(media[0].src).toBe('');
    player.dispose(); await expect(second.finished).resolves.toBe('unavailable'); await expect(player.play(cue, signal.signal).finished).resolves.toBe('unavailable'); expect(media).toHaveLength(2);
  });
  it('plays inside game://local and follows live volume, pause and actual ended', async () => {
    const { player, media, signal } = setup(asset.file, 'game://local/campaign/audio/');
    player.setVolume(0.35);
    const playback = player.play(cue, signal.signal);
    expect(media[0].src).toBe('game://local/campaign/audio/bridge/cue-01.mp3');
    expect(media[0].volume).toBe(0.35);
    player.setVolume(0); expect(media[0].volume).toBe(0);
    playback.pause(); await Promise.resolve(); playback.resume();
    expect(media[0].play).toHaveBeenCalledTimes(2);
    let finished = false; void playback.finished.then(() => { finished = true; });
    await Promise.resolve(); expect(finished).toBe(false);
    media[0].dispatchEvent(new Event('ended'));
    await expect(playback.finished).resolves.toBe('ended');
    expect(media[0].src).toBe(''); expect(media[0].load).toHaveBeenCalledOnce();
    player.dispose();
  });
  it('releases a cancelled desktop cue and rejects text changed after recording', async () => {
    const { player, media, signal } = setup(asset.file, 'game://local/audio/');
    await expect(player.play({ ...cue, text: `${cue.text}新文字。` }, signal.signal).finished).resolves.toBe('unavailable');
    expect(media).toHaveLength(0);
    const playback = player.play(cue, signal.signal); signal.abort();
    await expect(playback.finished).resolves.toBe('unavailable');
    media[0].dispatchEvent(new Event('ended'));
    expect(media[0].src).toBe(''); expect(media[0].load).toHaveBeenCalledOnce();
    player.dispose();
  });
  it.each([
    'game://remote/audio/', 'game://local:443/audio/', 'game://local.evil/audio/',
    'game://user@local/audio/', 'game://local/audio', 'game://local/audio/?from=provider',
    'game:///audio/', 'ftp://local/audio/',
  ])('rejects an unsupported desktop authority or non-directory base: %s', async base => {
    const { player, media, signal } = setup(asset.file, base);
    await expect(player.play(cue, signal.signal).finished).resolves.toBe('unavailable');
    expect(media).toHaveLength(0);
  });
  it.each([
    'game://remote/campaign/audio/cue.mp3', '//remote/campaign/audio/cue.mp3',
    'game://local/campaign/audio/cue.mp3', 'https://provider.test/cue.mp3',
    '../audio-other/cue.mp3', '%2e%2e%2foutside.mp3', 'bridge%5c..%5coutside.mp3',
    '/campaign/audio/cue.mp3', 'bridge/cue.mp3?url=https://provider.test/file',
  ])('keeps desktop playback within the explicit local audio base: %s', async file => {
    const { player, media, signal } = setup(file, 'game://local/campaign/audio/');
    await expect(player.play(cue, signal.signal).finished).resolves.toBe('unavailable');
    expect(media).toHaveLength(0);
  });
});

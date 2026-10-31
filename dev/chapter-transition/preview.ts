import { ChapterTransition, CHAPTER_BRIDGES, HtmlNarrationPlayer, type NarrationAsset } from '../../src/chapter-transition';
import './preview.css';

const controls = document.querySelector<HTMLElement>('#preview-controls')!;
const select = document.querySelector<HTMLSelectElement>('#bridge')!;
const loading = document.querySelector<HTMLSelectElement>('#loading')!;
const output = document.querySelector<HTMLOutputElement>('#result')!;
const transcript = document.querySelector<HTMLElement>('#transcript')!;
for (const bridge of CHAPTER_BRIDGES) select.add(new Option(`${bridge.from} → ${bridge.to} · ${bridge.heading}`, bridge.id));
function showText(): void {
  const bridge = CHAPTER_BRIDGES.find(item => item.id === select.value)!;
  transcript.replaceChildren(...bridge.cues.map(cue => { const p = document.createElement('p'); p.textContent = cue.text; return p; }));
}
select.addEventListener('change', showText); showText();

// Audio window supplies this manifest later; no remote URLs or synthetic speech in the preview.
const audioAssets: NarrationAsset[] = [];
const narration = new HtmlNarrationPlayer(audioAssets, new URL('./audio/', location.href));
let attempt = 0;
let releases = 0;
let entries = 0;
let demoMode = 'quick';
const transition = new ChapterTransition<{ stage: string }>(document.body, {
  narration,
  preload: (bridge, signal, progress) => new Promise((resolve, reject) => {
    const run = ++attempt;
    const duration = demoMode === 'slow' ? 35_000 : 2_000;
    const began = performance.now();
    const aborted = () => { clearInterval(timer); reject(new DOMException('Cancelled', 'AbortError')); };
    const timer = window.setInterval(() => {
      const fraction = Math.min(1, (performance.now() - began) / duration); progress(fraction);
      if (fraction < 1) return;
      clearInterval(timer); signal.removeEventListener('abort', aborted);
      if (demoMode === 'retry' && run === 1) reject(new Error('Preview loader: first attempt failed'));
      else resolve({ stage: bridge.to });
    }, 80);
    signal.addEventListener('abort', aborted, { once: true });
    if (signal.aborted) aborted();
  }),
  enter: (prepared, bridge) => {
    entries++; controls.inert = false;
    output.textContent = `已自动进入 ${prepared.stage} · ${bridge.heading}。本次进入 ${entries} 次。`;
  },
  release: () => { releases++; },
}, () => { controls.inert = false; output.textContent = `已返回预览，可重新选择段落。已释放准备资源 ${releases} 份。`; });

document.querySelector<HTMLFormElement>('#preview-form')!.addEventListener('submit', event => {
  event.preventDefault();
  transition.cancel(); entries = 0; attempt = 0; demoMode = loading.value;
  output.textContent = '过场播放中'; controls.inert = true;
  transition.start(CHAPTER_BRIDGES.find(item => item.id === select.value)!);
});
window.addEventListener('pagehide', () => { transition.dispose(); narration.dispose(); }, { once: true });

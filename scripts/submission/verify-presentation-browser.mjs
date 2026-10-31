/**
 * Minimal, fresh-profile browser check of the final local HTML presentation.
 * Run only after the coordinating window says “HTML媒体就绪”.
 * No game/3D capture, source edits, personal browser, or media production.
 *
 * node scripts/submission/verify-presentation-browser.mjs
 *   [--html artifacts/submission/presentation/index.html]
 *   [--out artifacts/submission/browser-qa/run-name]
 */
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const PLAYWRIGHT = '/Users/penguin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
const args = process.argv.slice(2);
const options = {};
for (let index = 0; index < args.length; index += 2) {
  if (!['--html', '--out'].includes(args[index]) || !args[index + 1]) {
    throw new Error('Usage: verify-presentation-browser.mjs [--html file] [--out directory]');
  }
  options[args[index].slice(2)] = args[index + 1];
}

const html = resolve(options.html ?? 'artifacts/submission/presentation/index.html');
const runName = new Date().toISOString().replace(/[:.]/g, '-');
const out = resolve(options.out ?? `artifacts/submission/browser-qa/${runName}`);
const reportPath = join(out, 'result.json');
const report = {
  schemaVersion: 1, startedAt: new Date().toISOString(), html,
  method: 'fresh throwaway headless Playwright context; file://; no personal browser',
  viewport: { width: 1920, height: 1080 }, expectedPages: 8,
  pages: [], consoleErrors: [], pageErrors: [], requestFailures: [],
  failedImages: [], configuredSlotFailures: [], unconfiguredImageSlots: [],
  video: null, failures: [], passed: false,
  scope: 'Eight arrow-navigated pages and PNGs; image/console errors; ~45s video metadata and playback time progression. No full-game test or 45s end-to-end viewing claim.',
};

async function main() {
  await mkdir(out, { recursive: true });
  let browser, acceptingEvents = true;
  try {
    await stat(html);
    const { chromium } = require(PLAYWRIGHT);
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: report.viewport, deviceScaleFactor: 1, serviceWorkers: 'block', permissions: [],
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on('console', event => {
      if (acceptingEvents && event.type() === 'error' && report.consoleErrors.length < 30) {
        report.consoleErrors.push({ text: event.text().slice(0, 2000), location: event.location() });
      }
    });
    page.on('pageerror', error => {
      if (acceptingEvents && report.pageErrors.length < 30) report.pageErrors.push(error.message);
    });
    page.on('requestfailed', request => {
      if (acceptingEvents && report.requestFailures.length < 50) report.requestFailures.push({
        url: request.url(), error: request.failure()?.errorText ?? 'unknown', type: request.resourceType(),
      });
    });

    await page.goto(pathToFileURL(html).href, { waitUntil: 'load', timeout: 30000 });
    await page.waitForSelector('.slide');
    await page.evaluate(() => document.fonts.ready);
    report.actualPages = await page.locator('.slide').count();
    if (report.actualPages !== 8) report.failures.push(`Expected 8 slides; found ${report.actualPages}.`);
    await page.waitForFunction(() => Object.entries(window.GANYMEDE_MEDIA?.images ?? {}).every(([id, src]) => {
      if (!src) return true;
      const slot = document.querySelector(`[data-slot="${id}"]`);
      return !!slot && (slot.dataset.loadError === 'true' || !!slot.querySelector('img')?.complete);
    }), undefined, { timeout: 15000 }).catch(error => report.failures.push(`Configured images did not settle: ${error.message.split('\n')[0]}`));

    await page.keyboard.press('Home');
    for (let index = 0; index < Math.min(report.actualPages, 8); index++) {
      if (index) await page.keyboard.press('ArrowRight');
      const id = `slide-${index + 1}`;
      await page.waitForFunction(id => {
        const slide = document.getElementById(id);
        return slide && !slide.hidden && getComputedStyle(slide).opacity === '1';
      }, id, { timeout: 10000 });
      const screenshot = join(out, `${String(index + 1).padStart(2, '0')}-${id}.png`);
      await page.screenshot({ path: screenshot, fullPage: false });
      report.pages.push(await page.evaluate(({ id, screenshot }) => {
        const slide = document.getElementById(id);
        return { id, title: slide.getAttribute('aria-label'), screenshot,
          imageCount: slide.querySelectorAll('img').length,
          failedImages: [...slide.querySelectorAll('img')].filter(img => !img.complete || img.naturalWidth === 0)
            .map(img => ({ src: img.currentSrc || img.src, complete: img.complete })) };
      }, { id, screenshot }));
    }

    const images = await page.evaluate(() => {
      const configuredSlotFailures = [], unconfiguredImageSlots = [];
      for (const [id, src] of Object.entries(window.GANYMEDE_MEDIA?.images ?? {})) {
        if (!src) { unconfiguredImageSlots.push(id); continue; }
        const slot = document.querySelector(`[data-slot="${id}"]`), image = slot?.querySelector('img');
        if (!slot || slot.dataset.loadError === 'true' || !image?.complete || !image.naturalWidth) {
          configuredSlotFailures.push({ id, src, loadError: slot?.dataset.loadError ?? null });
        }
      }
      return { configuredSlotFailures, unconfiguredImageSlots,
        failedImages: [...document.images].filter(img => !img.complete || img.naturalWidth === 0)
          .map(img => ({ src: img.currentSrc || img.src, complete: img.complete })) };
    });
    Object.assign(report, images);

    const trailer = page.locator('#trailer');
    const configuredVideo = await trailer.getAttribute('src');
    if (!configuredVideo) throw new Error('The final slide has no configured trailer source.');
    await page.waitForFunction(() => {
      const video = document.querySelector('#trailer');
      return video?.error || (video?.readyState >= 1 && Number.isFinite(video.duration));
    }, undefined, { timeout: 20000 });
    const initial = await trailer.evaluate(video => ({
      src: video.currentSrc || video.src, duration: video.duration, currentTime: video.currentTime,
      readyState: video.readyState, videoWidth: video.videoWidth, videoHeight: video.videoHeight,
      error: video.error ? { code: video.error.code, message: video.error.message } : null,
    }));
    report.video = { ...initial, durationToleranceSeconds: 0.15 };
    if (initial.error) throw new Error(`Trailer media error: ${initial.error.message || initial.error.code}`);
    if (Math.abs(initial.duration - 45) > 0.15) report.failures.push(`Trailer duration is ${initial.duration}s, expected approximately 45s.`);
    await trailer.waitFor({ state: 'visible' });
    const bounds = await trailer.boundingBox();
    if (!bounds) throw new Error('Trailer is not visible on the final slide.');
    // A genuine browser input grants playback activation; do not mute to bypass autoplay rules.
    await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await trailer.evaluate(video => video.play());
    const before = await trailer.evaluate(video => ({ currentTime: video.currentTime, performanceMs: performance.now() }));
    await page.waitForFunction(beforeTime => {
      const video = document.querySelector('#trailer');
      return video && !video.paused && video.currentTime >= beforeTime + 1;
    }, before.currentTime, { timeout: 12000 });
    const screenshot = join(out, '09-trailer-playing.png');
    await page.screenshot({ path: screenshot, fullPage: false });
    const after = await trailer.evaluate(video => ({ currentTime: video.currentTime, performanceMs: performance.now(),
      paused: video.paused, readyState: video.readyState, duration: video.duration,
      error: video.error ? { code: video.error.code, message: video.error.message } : null }));
    Object.assign(report.video, { before, after, advancedSeconds: after.currentTime - before.currentTime, screenshot,
      playbackAdvanced: after.currentTime > before.currentTime && !after.paused && !after.error });
    await trailer.evaluate(video => video.pause());
  } catch (error) {
    report.failures.push(String(error?.message ?? error));
  } finally {
    acceptingEvents = false;
    await browser?.close().catch(error => report.failures.push(`Browser close: ${error.message}`));
    if (report.consoleErrors.length) report.failures.push(`${report.consoleErrors.length} browser console error(s).`);
    if (report.pageErrors.length) report.failures.push(`${report.pageErrors.length} uncaught page error(s).`);
    if (report.failedImages.length || report.configuredSlotFailures.length) report.failures.push('One or more configured images failed to load.');
    const realRequestFailures = report.requestFailures.filter(item => !item.error.includes('ERR_ABORTED'));
    if (realRequestFailures.length) report.failures.push(`${realRequestFailures.length} non-aborted resource request failure(s).`);
    report.passed = report.failures.length === 0 && report.pages.length === 8 && report.video?.playbackAdvanced === true;
    report.finishedAt = new Date().toISOString();
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
    console.log(JSON.stringify({ passed: report.passed, reportPath, pages: report.pages.length,
      duration: report.video?.duration ?? null, playbackAdvancedSeconds: report.video?.advancedSeconds ?? null,
      failedImages: report.failedImages.length + report.configuredSlotFailures.length,
      consoleErrors: report.consoleErrors.length, failures: report.failures }, null, 2));
    if (!report.passed) process.exitCode = 1;
  }
}

await main();

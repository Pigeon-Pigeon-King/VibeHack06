// Interactive public-input browser evidence recorder. No gameplay state mutation.
import { createRequire } from 'node:module';
import { createInterface } from 'node:readline';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CAMPAIGN_QA_PLAYWRIGHT ?? '/Users/penguin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const runId = process.argv[2] ?? `run-${Date.now()}`;
if (!/^[a-z0-9-]+$/.test(runId)) throw new Error('Use a unique simple run ID');
const out = resolve(import.meta.dirname, '../../artifacts/campaign-qa/browser', runId);
if (existsSync(out)) throw new Error('Evidence run already exists; choose a new run ID');
mkdirSync(out, { recursive: true });
const startedAt = new Date().toISOString();
const manifestBytes = readFileSync(resolve(import.meta.dirname, '../../artifacts/campaign-qa/candidate-lock.json'));
const sourceManifestSha256 = createHash('sha256').update(manifestBytes).digest('hex');
const candidateAggregateSha256 = JSON.parse(manifestBytes).aggregateSha256;
const targetUrl = process.env.CAMPAIGN_QA_URL ?? 'http://127.0.0.1:5197/';
const errors = [], trace = [];
let browser, browserVersion = null, startupStatus = 'launching';
save();
try {
  browser = await chromium.launch({ headless: true, args: ['--use-angle=metal'] });
  browserVersion = browser.version();
} catch (error) {
  startupStatus = 'failed'; errors.push({ type: 'browser-launch', text: String(error) }); save();
  throw error;
}
const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
const page = await context.newPage();
page.setDefaultTimeout(20000);
page.on('pageerror', e => errors.push({ type: 'pageerror', text: e.message }));
page.on('console', m => { if (m.type() === 'error') errors.push({ type: 'console', text: m.text() }); });
page.on('response', response => { if (response.status() >= 400) errors.push({ type: 'http', status: response.status(), url: response.url() }); });
try {
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  startupStatus = 'navigated'; save();
} catch (error) {
  startupStatus = 'failed'; errors.push({ type: 'navigation', text: String(error) }); save(); await browser.close(); throw error;
}
async function observe(label) {
  await page.locator('.game-interface').waitFor({ timeout: 60000 });
  const state = { mode: await page.locator('.game-interface').getAttribute('data-mode'),
    phase: await page.locator('[data-ui="phase"]').textContent(),
    displayedGameTime: await page.locator('[data-ui="time"]').textContent(),
    diagnostics: await page.locator('[data-ui="diagnostics"]').textContent(),
    text: await page.locator('body').innerText(), url: page.url() };
  if (label) {
    if (!/^[a-z0-9-]+$/.test(label)) throw new Error('Use a simple evidence label');
    await page.screenshot({ path: resolve(out, `${label}.png`), timeout: 60000 });
    state.visual = `artifacts/campaign-qa/browser/${runId}/${label}.png`;
  }
  return state;
}
function save() {
  writeFileSync(resolve(out, 'session.json'), JSON.stringify({ schemaVersion: 1,
    kind: 'browser-public-input-tool-operation', runId, startupStatus, startedAt, updatedAt: new Date().toISOString(),
    environment: { browser: browserVersion, node: process.version, platform: process.platform, viewport: '1366x768', headless: true, targetUrl,
      sourceManifest: 'artifacts/campaign-qa/candidate-lock.json', sourceManifestSha256, candidateAggregateSha256,
      cleanContext: true, clockOverride: false, normalSpeedMeasured: false,
      performanceMeasured: false, realHumanPlaythrough: false, sourceReviewInformed: true }, trace, errors }, null, 2) + '\n');
}
try {
  const initialState = await observe('menu-clean');
  startupStatus = 'ready'; trace.push({ at: startedAt, input: { action: 'navigate', url: page.url() }, state: initialState });
  save(); console.log(JSON.stringify({ ready: true, runId, state: initialState }));
} catch (error) {
  startupStatus = 'failed'; errors.push({ type: 'initial-observation', text: String(error) }); save(); await browser.close(); throw error;
}
const readline = createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of readline) {
  if (!line.trim()) continue;
  const start = Date.now(); let command;
  try {
    command = JSON.parse(line);
    if (command.action === 'click') await page.getByRole('button', { name: command.name, exact: true }).click();
    else if (command.action === 'summary') await page.locator('summary').filter({ hasText: command.name }).click();
    else if (command.action === 'press') await page.keyboard.press(command.key);
    else if (command.action === 'hold') {
      if (!Number.isFinite(command.ms) || command.ms < 0 || command.ms > 20000 || !Array.isArray(command.keys)
        || !command.keys.every(key => typeof key === 'string')) throw new Error('Invalid public key hold');
      const pressed = [];
      try {
        for (const key of command.keys) { await page.keyboard.down(key); pressed.push(key); }
        await page.waitForTimeout(command.ms);
      } finally {
        for (const key of pressed.reverse()) await page.keyboard.up(key).catch(() => {});
      }
    } else if (command.action === 'wait') await page.waitForTimeout(Math.min(command.ms, 20000));
    else if (command.action === 'reload') await page.reload({ waitUntil: 'domcontentloaded' });
    else if (command.action === 'import') {
      command.checkpointRestored = true;
      command.path = resolve(command.path);
      command.checkpointSha256 = createHash('sha256').update(readFileSync(command.path)).digest('hex');
      const pending = page.waitForEvent('filechooser');
      await page.getByRole('button', { name: '检查点文件（开发验收）', exact: true }).click();
      await (await pending).setFiles(resolve(command.path));
    } else if (command.action === 'stop') {
      save(); await browser.close(); readline.close(); process.stdin.pause();
      console.log('{"stopped":true}'); process.exit(0);
    }
    else if (command.action !== 'observe') throw new Error('Unknown public input action');
    const state = await observe(command.label);
    trace.push({ at: new Date(start).toISOString(), wallSeconds: (Date.now() - start) / 1000, input: command, state });
    save(); console.log(JSON.stringify({ ok: true, state }));
  } catch (error) {
    trace.push({ at: new Date(start).toISOString(), input: command, error: String(error) });
    save(); console.log(JSON.stringify({ ok: false, error: String(error) }));
  }
}

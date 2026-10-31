import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const candidate = process.env.QA_CANDIDATE_ROOT;
if (!candidate) throw new Error('Set QA_CANDIDATE_ROOT to the explicitly authorized frozen candidate.');
const evidenceRoot = process.env.QA_EVIDENCE_DIR
  ? resolve(process.env.QA_EVIDENCE_DIR)
  : resolve(root, `artifacts/campaign-qa/replays/s05-s08-${Date.now()}`);
const lock = JSON.parse(readFileSync(resolve(root, 'artifacts/campaign-qa/candidate-lock.json'), 'utf8'));
const location = JSON.parse(readFileSync(resolve(root, 'artifacts/campaign-qa/candidate-location.json'), 'utf8'));
if (location.aggregateSha256 !== lock.aggregateSha256
  || ![lock.frozenRoot, location.currentRoot].map(path => resolve(path)).includes(resolve(candidate))) {
  throw new Error('Candidate path differs from the lock and its verified relocation.');
}
const requested = process.argv[2] ?? 'all';
if (!['baseline', 'boundary', 'all', 'remaining-natural'].includes(requested)) throw new Error('Mode must be baseline, boundary, all, or remaining-natural.');
const output = requested === 'remaining-natural' ? resolve(evidenceRoot, 'remaining-natural') : evidenceRoot;
const modes = requested === 'all' ? ['baseline', 'boundary'] : [requested];
const verifyLock = () => {
  const mismatches = Object.entries(lock.files).flatMap(([file, expected]) => {
    const actual = createHash('sha256').update(readFileSync(resolve(candidate, file))).digest('hex');
    return actual === expected.sha256 ? [] : [{ file, expected: expected.sha256, actual }];
  });
  if (mismatches.length) throw new Error(`Frozen candidate changed: ${JSON.stringify(mismatches)}`);
};
verifyLock();
mkdirSync(output, { recursive: true });
let exitCode = 0;
for (const mode of modes) {
  const started = new Date(), t0 = performance.now();
  const command = [resolve(candidate, 'node_modules/vitest/vitest.mjs'), 'run', '--configLoader', 'runner',
    '--config', resolve(root, 'tests/campaign-qa/s05-s08.config.mjs')];
  const timedCommand = ['-l', process.execPath, ...command];
  const result = spawnSync('/usr/bin/time', timedCommand, { cwd: root,
    env: { ...process.env, QA_CASE_MODE: mode, QA_EVIDENCE_DIR: output, RECORD_VISUAL_FIXTURES: '0' },
    encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  const wallSeconds = (performance.now() - t0) / 1000;
  writeFileSync(resolve(output, `${mode}-output.txt`), (result.stdout ?? '') + (result.stderr ?? ''));
  writeFileSync(resolve(output, `${mode}-run.json`), JSON.stringify({ schemaVersion: 1,
    command: ['/usr/bin/time', ...timedCommand], startedAt: started.toISOString(), wallSeconds,
    cpuTiming: `${mode}-output.txt contains /usr/bin/time -l user/system seconds`,
    exitCode: result.status ?? 1, signal: result.signal, error: result.error?.message,
    sourceCommit: lock.sourceCommit, candidateAggregateSha256: lock.aggregateSha256,
    candidate, browser: 'NOT_RUN', humanPlaythrough: 'NOT_RUN',
  }, null, 2) + '\n');
  process.stdout.write(result.stdout ?? ''); process.stderr.write(result.stderr ?? '');
  verifyLock();
  if (result.status !== 0) { exitCode = result.status ?? 1; break; }
}
process.exitCode = exitCode;

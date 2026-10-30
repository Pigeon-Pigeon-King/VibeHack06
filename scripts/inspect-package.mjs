import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractFile, listPackage } from '@electron/asar';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const packageDir = 'release/ReturnToGanymede-win32-x64';
const archive = path.join(root, packageDir, 'resources/app.asar');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const read = file => readFileSync(path.join(root, file));
function files(directory) {
  return readdirSync(path.join(root, directory), { withFileTypes: true })
    .flatMap(entry => entry.isDirectory() ? files(`${directory}/${entry.name}`) : entry.isFile() ? [`${directory}/${entry.name}`] : [])
    .sort();
}
const entries = listPackage(archive);
const top = [...new Set(entries.map(entry => entry.split('/')[1]))].sort();
assert.deepEqual(top, ['LICENSES', 'desktop', 'dist', 'package.json']);
for (const file of [...files('dist'), ...files('desktop')]) {
  assert.ok(read(file).equals(extractFile(archive, file)), `Packaged file differs from current build: ${file}`);
}
const embedded = JSON.parse(extractFile(archive, 'package.json'));
assert.equal(embedded.main, 'desktop/main.cjs');
const executable = read(`${packageDir}/ReturnToGanymede.exe`);
assert.equal(executable.toString('ascii', 0, 2), 'MZ');
const pe = executable.readUInt32LE(0x3c);
assert.equal(executable.toString('ascii', pe, pe + 4), 'PE\0\0');
assert.equal(executable.readUInt16LE(pe + 4), 0x8664, 'Expected x86-64 PE');
const report = JSON.parse(read('artifacts/test-results.json'));
assert.equal(report.success, true);
assert.equal(report.numFailedTests, 0);
const source = [...files('src'), ...files('desktop'), ...files('scripts'), ...files('tests'),
  'index.html', 'package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts'].sort();
const manifest = {
  candidate: 'whitebox-2026-10-31', recordedAt: new Date().toISOString(), node: process.version,
  target: 'Windows x64 portable directory', entry: `${packageDir}/ReturnToGanymede.exe`,
  runtimeVerifiedOnWindows: false,
  packageRoots: top,
  tests: { total: report.numTotalTests, passed: report.numPassedTests, failed: report.numFailedTests,
    files: report.testResults.length, reportSha256: sha(read('artifacts/test-results.json')) },
  sourceSha256: Object.fromEntries(source.map(file => [file, sha(read(file))])),
  distSha256: Object.fromEntries(files('dist').map(file => [file, sha(read(file))])),
  appAsarSha256: sha(readFileSync(archive)), executableSha256: sha(executable),
};
writeFileSync(path.join(root, 'artifacts/build-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ verified: 'package contents match current dist and desktop source',
  packageRoots: top, executable: 'PE x86-64', tests: manifest.tests, runtimeVerifiedOnWindows: false }, null, 2));

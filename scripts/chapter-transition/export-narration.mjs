import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = new URL('../../', import.meta.url);
const paths = ['src/chapter-transition/opening.json', 'src/chapter-transition/bridges.json'];
const contents = await Promise.all(paths.map(path => readFile(new URL(path, root), 'utf8')));
const scripts = [JSON.parse(contents[0]), ...JSON.parse(contents[1])];
const cueIds = new Set();
const manifest = {
  schemaVersion: 1,
  sources: paths.map((path, index) => ({ path, sha256: createHash('sha256').update(contents[index]).digest('hex') })),
  sequences: scripts.map(script => ({
    id: script.id, kind: script.from === null ? 'opening' : 'bridge', from: script.from, to: script.to,
    cueIds: script.cues.map(cue => cue.id),
  })),
  cues: scripts.flatMap(script => script.cues.map(cue => {
    if (!cue.id || cueIds.has(cue.id) || !cue.text.trim()) throw new Error(`Invalid or duplicate cue: ${cue.id}`);
    cueIds.add(cue.id);
    return { cueId: cue.id, sequenceId: script.id, text: cue.text, readingSeconds: cue.readingSeconds };
  })),
};
const output = new URL('docs/chapter-transition/narration-production.json', root);
const json = `${JSON.stringify(manifest, null, 2)}\n`;
if (process.argv.includes('--check')) {
  if (await readFile(output, 'utf8') !== json) throw new Error('Narration production manifest is stale. Run this script without --check.');
  console.log(`Narration manifest verified: ${scripts.length} sequences, ${cueIds.size} cues.`);
} else {
  await writeFile(output, json);
  console.log(`Wrote ${fileURLToPath(output)}: ${scripts.length} sequences, ${cueIds.size} cues.`);
}

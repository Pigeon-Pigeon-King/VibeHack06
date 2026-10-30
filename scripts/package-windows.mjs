import { packager } from '@electron/packager';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const stage = await mkdtemp(path.join(tmpdir(), 'ganymede-package-'));
try {
  await cp(path.join(root, 'dist'), path.join(stage, 'dist'), { recursive: true });
  await cp(path.join(root, 'desktop'), path.join(stage, 'desktop'), { recursive: true });
  await mkdir(path.join(stage, 'LICENSES'));
  await cp(path.join(root, 'node_modules/three/LICENSE'), path.join(stage, 'LICENSES/Three.txt'));
  await cp(path.join(root, 'node_modules/@dimforge/rapier3d-compat/LICENSE'), path.join(stage, 'LICENSES/Rapier.txt'));
  await writeFile(path.join(stage, 'package.json'), JSON.stringify({ name: pkg.name, version: pkg.version, author: pkg.author, main: pkg.main, private: true }, null, 2));
  const outputs = await packager({
    dir: stage, name: 'ReturnToGanymede', appVersion: pkg.version, platform: 'win32', arch: 'x64',
    electronVersion: pkg.devDependencies.electron, asar: true, prune: false,
    out: path.join(root, 'release'), overwrite: true,
  });
  for (const output of outputs) await writeFile(path.join(output, 'START_HERE.txt'),
    '重返木卫三 · 开发候选\n\n请保留整个文件夹，运行 ReturnToGanymede.exe。\n当前连续流程为S01—S07，另保留三个机制验证入口。美术与表演仍为占位，完整一小时战役仍在制作。\nWASD移动，Shift冲刺，C蹲伏，Space跳跃，左键/F射击，右键瞄准，R换弹，E交互，Esc暂停。\n当前构建在Mac完成，Windows实际输入、音频和性能需在目标电脑验收。\n');
  console.log(JSON.stringify({ outputs, target: 'Windows x64', runtimeVerifiedOnWindows: false }, null, 2));
} finally {
  await rm(stage, { recursive: true, force: true });
}

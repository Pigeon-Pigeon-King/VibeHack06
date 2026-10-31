import { createServer } from 'vite';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
const server = await createServer({ configFile: false, server: { middlewareMode: true, watch: null }, appType: 'custom', optimizeDeps: { noDiscovery: true } });
try {
  const { PortKit, readPortKitPrimitives } = await server.ssrLoadModule('/src/presentation/port-kit.ts');
  const { buildEnvironment } = await server.ssrLoadModule('/src/presentation/environment.ts');
  const { bindArchitecture } = await server.ssrLoadModule('/src/presentation/architecture-bindings.ts');
  const { SCENARIO_IDS } = await server.ssrLoadModule('/src/contracts.ts');
  const traces = new WeakMap(), part = PortKit.prototype.part, files = new Map();
  PortKit.prototype.part = function (...args) {
    const error = new Error(); server.ssrFixStacktrace(error); part.apply(this, args);
    const record = readPortKitPrimitives(this.root).filter(p => p.parent === this.root).at(-1);
    traces.set(record, error.stack.split('\n').filter(line => line.includes('/src/presentation/') && !line.includes('/port-kit.ts')).map(line => {
      const match = line.match(/at\s+(.*?)\s*\(([^()]*\/src\/[^:]+):(\d+):(\d+)\)/);
      if (!match) return { note: line.trim() };
      const file = 'src/' + match[2].split('/src/')[1];
      if (!files.has(file)) files.set(file, createHash('sha256').update(readFileSync(file)).digest('hex'));
      return { function: match[1].trim().replace(/^at\s*/, ''), file, line: Number(match[3]) };
    }));
  };
  const result = {
    scope: 'Code-constructed remaining PortKit physical primitives after planned successful architecture swaps; no WebGL/image/real-play acceptance. Prop-owned subtrees are delegated, not counted as architecture success. Scene meshes not made by PortKit are outside this numeric count.',
    collectedAt: new Date().toISOString(), scenarios: [], sourceHashes: {},
  };
  for (const scenario of SCENARIO_IDS) {
    const env = buildEnvironment(scenario), groups = bindArchitecture(env.root, scenario), parts = readPortKitPrimitives(env.root), plan = env.root.userData.architectureCoveragePlan;
    const remaining = plan.uncovered.map(gap => {
      const p = parts.find(p => p.parent.name === gap.parent && (p.solidId ?? `${p.batch}[${p.index}]`) === gap.entity);
      if (!p) return gap;
      const hiddenAncestors = []; for (let n = p.parent; n; n = n.parent) if (!n.visible) hiddenAncestors.push(n.name);
      return { ...gap, surface: p.surface, matrix: p.matrix.elements, visibleAtConstruction: !hiddenAncestors.length, hiddenAncestors, source: traces.get(p) };
    });
    result.scenarios.push({ scenario, replacementGroups: groups.filter(g => g.targets.length).length,
      additiveLandmarkGroups: groups.filter(g => !g.targets.length).length,
      targetedPrimitiveInstancesOrGroundMeshes: groups.reduce((n, g) => n + g.targets.reduce((m, t) => m + (t.indices?.length ?? 1), 0), 0),
      informationPrimitives: plan.informationPrimitives, delegatedPrimitives: plan.delegatedPrimitives, remaining });
    env.dispose();
  }
  result.sourceHashes = Object.fromEntries(files);
  writeFileSync(new URL('./architecture-remaining.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result.scenarios.map(s => ({ scenario: s.scenario, targets: s.targetedPrimitiveInstancesOrGroundMeshes, remaining: s.remaining.length }))));
} finally { await server.close(); }

import { beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// This independent supplement sends public Intent values only. Checkpoint
// restoration is explicitly marked; no player/NPC/health/phase/fact injection.
const root = process.env.QA_CANDIDATE_ROOT;
if (!root) throw new Error('QA_CANDIDATE_ROOT is required.');
const read = path => import(resolve(root, path));
const { Simulation, emptyIntent, distance } = await read('src/mission/Simulation.ts');
const { SaveStore } = await read('src/persistence/SaveStore.ts');
const { buildEnvironment } = await read('src/presentation/environment.ts');
const { initializePhysics, FIXED_DT } = await read('src/runtime/Physics.ts');
const { HISTORY: H } = await read('src/content/history-layout.ts');
const { WORKERS: W } = await read('src/content/chapter-layout.ts');
beforeAll(initializePhysics);
const out = process.env.QA_S01_S04_OUT ?? resolve(import.meta.dirname, '../../artifacts/campaign-qa/s01-s04');
const round = value => JSON.parse(JSON.stringify(value, (_, v) => typeof v === 'number' ? +v.toFixed(4) : v));

class Replay {
  constructor(scenario) {
    this.scenario = scenario; this.env = buildEnvironment(scenario);
    this.sim = new Simulation(scenario, this.env.solids); this.path = []; this.dest = ''; this.nav = this.sim.navigation;
    this.steps = 0; this.inputs = { move: 0, fire: 0, reload: 0, interact: 0, skip: 0 };
    this.trace = []; this.hurts = []; this.transitions = []; this.started = performance.now();
  }
  summary() {
    const s = this.sim;
    return round({ scenario: this.scenario, phase: s.mission.phase, elapsed: s.mission.elapsed,
      steppedSeconds: this.steps * FIXED_DT, hp: s.player.health, failed: s.mission.failed, complete: s.mission.complete,
      position: s.player.position, safe: s.safeCount, hits: s.hits, kills: s.kills, facts: s.mission.facts,
      ammo: [s.player.ammo, s.player.reserve], inputs: this.inputs, path: this.path.slice(0, 3), trace: this.trace.slice(-8) });
  }
  step(p = {}) {
    const s = this.sim, phase = s.mission.phase, hp = s.player.health;
    const input = { ...emptyIntent, yaw: s.player.yaw, pitch: s.player.pitch, ...p };
    if (input.forward || input.right) this.inputs.move++;
    for (const k of ['fire', 'reload', 'interact', 'skip']) if (input[k]) this.inputs[k]++;
    s.step(input); this.steps++; this.env.setFacts?.(s.mission.facts);
    if (s.player.health < hp) this.hurts.push(round({ at: s.mission.elapsed, from: hp, to: s.player.health,
      projectileHurt: s.events.some(e => e.type === 'hurt'), position: s.player.position }));
    if (phase !== s.mission.phase) this.transitions.push(round({ at: s.mission.elapsed, from: phase, to: s.mission.phase,
      interact: input.interact, safe: s.safeCount, position: s.player.position }));
    if (this.steps % 120 === 0) this.trace.push(this.short());
  }
  short() { const s = this.sim; return round({ phase: s.mission.phase, at: s.mission.elapsed, hp: s.player.health, position: s.player.position, safe: s.safeCount }); }
  drive(goal, opt = {}) {
    const s = this.sim, key = `${goal.join(',')}/${!!opt.direct}`;
    if (key !== this.dest || this.nav !== s.navigation) { this.path = []; this.dest = key; this.nav = s.navigation; }
    let mx = 0, mz = 0;
    if (s.mission.control !== 'staged' && distance(s.player.position, goal) > (opt.range ?? 1.6)) {
      if (!opt.direct && !this.path.length) this.path = s.navigation.path(s.player.position, goal);
      while (this.path.length && distance(s.player.position, this.path[0]) < 0.3) this.path.shift();
      const next = opt.direct ? goal : this.path[0] ?? goal;
      const dx = next[0] - s.player.position[0], dz = next[2] - s.player.position[2], n = Math.max(.001, Math.hypot(dx, dz));
      mx = dx / n; mz = dz / n;
    }
    const enemy = opt.combat !== false && s.mission.control === 'combat' ? s.aliveEnemies.slice()
      .sort((a, b) => distance(a.position, s.player.position) - distance(b.position, s.player.position))
      .find(a => s.physics.trace(s.playerEye, [a.position[0], a.position[1] + 1.62, a.position[2]], 'player')?.id === a.id) : undefined;
    const target = enemy ? [enemy.position[0], enemy.position[1] + 1.62, enemy.position[2]] : opt.lookAt;
    let yaw = mx || mz ? Math.atan2(-mx, -mz) : s.player.yaw, pitch = 0;
    if (target) { const dx = target[0] - s.player.position[0], dz = target[2] - s.player.position[2];
      yaw = Math.atan2(-dx, -dz); pitch = Math.atan2(target[1] - s.playerEye[1], Math.hypot(dx, dz)); }
    this.step({ yaw, pitch, forward: -Math.sin(yaw) * mx - Math.cos(yaw) * mz,
      right: Math.cos(yaw) * mx - Math.sin(yaw) * mz, sprint: opt.sprint !== false && !enemy,
      fire: !!enemy, ads: !!enemy, reload: s.mission.control === 'combat' && !s.player.ammo && !s.player.reload,
      interact: !!opt.interact && this.steps % 12 === 0 });
  }
  until(label, condition, action, seconds = 180, allowFailure = false) {
    const end = this.steps + seconds / FIXED_DT;
    while (!condition()) {
      if (this.steps >= end || (this.sim.mission.failed && !allowFailure)) throw new Error(`${label}: ${JSON.stringify(this.summary())}`);
      action();
    }
  }
  walk(goal, opt = {}) { this.until('walk', () => distance(this.sim.player.position, goal) <= (opt.range ?? 1.6), () => this.drive(goal, opt)); }
  restoreActualCheckpoint() {
    const saved = structuredClone(this.sim.checkpoint), memory = new Map();
    const store = new SaveStore({ getItem: k => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v), removeItem: k => memory.delete(k) });
    const chapter = { chapter: 'campaign', stage: this.scenario === 'mainhall' ? 'S02' : 'S04', elapsedBefore: 0 };
    expect(store.save('campaign', saved, chapter)).toEqual({ ok: true });
    const read = store.load('campaign'); expect(read.warning).toBeUndefined(); expect(read.save.snapshot).toEqual(saved);
    this.sim.dispose(); this.sim = new Simulation(this.scenario, this.env.solids, read.save.snapshot);
    expect(this.sim.snapshot()).toEqual(saved); expect(this.sim.ballistics.projectiles).toHaveLength(0);
    this.env.setFacts?.(this.sim.mission.facts); this.path = []; this.dest = ''; this.nav = this.sim.navigation;
    return round({ phase: saved.mission.phase, elapsed: saved.mission.elapsed, hp: saved.player.health, facts: saved.mission.facts });
  }
  finishHall() {
    this.until('S02 restored combat to collapse', () => this.sim.mission.phase === 4, () => {
      const s = this.sim;
      if (s.mission.phase < 3) this.drive([H.gatePanel, H.defenseA, H.defenseB][s.mission.phase], { interact: s.mission.phase === 0 });
      else {
        const threat = s.aliveEnemies.filter(e => s.workers.some(w => !w.safe && distance(e.position, w.position) < 10))
          .sort((a,b) => distance(a.position,s.player.position)-distance(b.position,s.player.position))[0];
        this.drive(threat ? [Math.round(threat.position[0]),0,Math.round(threat.position[2])] : H.defenseB, { range: threat ? 2.5 : 1.6 });
      }
    });
    this.until('S02 natural fixed outcome', () => this.sim.mission.complete, () => this.step(), 30);
  }
  finishWorkers() {
    this.until('checkpoint', () => this.sim.mission.phase >= 2, () => this.drive(W.checkpoint, { interact: true }));
    this.until('lower', () => this.sim.mission.phase >= 3, () => this.drive(W.lower, { interact: true }));
    this.walk(W.stairStart, { range: .35 }); this.walk(W.stairTop, { direct: true, range: .3, sprint: false });
    this.until('upper', () => this.sim.mission.phase >= 4, () => this.drive(W.overlook, { direct: true, range: .8, sprint: false }));
    expect(this.sim.player.position[1]).toBeGreaterThan(2.8);
    this.walk(W.descent, { direct: true, range: .3, sprint: false });
    this.until('yard', () => this.sim.mission.phase >= 5, () => this.drive(W.yardGate, { interact: true }));
    this.until('release', () => this.sim.mission.phase >= 6, () => this.drive(W.release));
    this.until('nine at safety', () => this.sim.mission.phase >= 7, () => {
      const s = this.sim, threat = s.aliveEnemies.filter(e => distance(e.position, W.safe) < 24 || s.workers.some(w => !w.safe && distance(w.position,e.position)<10))
        .sort((a,b)=>distance(a.position,s.player.position)-distance(b.position,s.player.position))[0];
      this.drive(threat ? [Math.round(threat.position[0]),0,Math.round(threat.position[2])] : W.safe, {range: threat ? 2.5 : 1.6});
    }, 240);
    this.until('promise', () => this.sim.mission.complete, () => this.drive(W.post, {interact:true}));
  }
  save(name, extra) { mkdirSync(out,{recursive:true}); const { status: assertionBodyStatus, ...rest } = extra; writeFileSync(resolve(out,name),JSON.stringify({schemaVersion:1,candidate:root,
    method:'public Intent only, then genuine checkpoint serialization/reload; no state injection', wallSeconds:(performance.now()-this.started)/1000,
    final:this.summary(),hurtEvents:this.hurts,transitions:this.transitions,assertionBodyStatus,...rest,
    verdictNotice:'Body assertions are diagnostic only; final test verdict is authoritative in test-results.json (including after-body timeout/disposal).'},null,2)+'\n'); }
  dispose() { this.sim.dispose(); this.env.dispose(); }
}

describe('independent S01–S04 ordinary failure and checkpoint retry', () => {
  it('S02 fails to real enemy projectiles, retries the real gate checkpoint, then completes naturally', () => {
    const r = new Replay('mainhall'); let details = {};
    try {
      r.step({ interact: true }); expect(r.sim.mission.phase).toBe(1);
      r.until('ordinary enemy death', () => r.sim.mission.failed, () => r.drive([14,0,-10],{combat:false}),90,true);
      expect(r.sim.player.health).toBe(0); expect(r.hurts.some(e=>e.projectileHurt)).toBe(true);
      expect(r.sim.mission.complete).toBe(false); expect(r.sim.mission.facts).not.toContain('history-collapse');
      const failed = r.summary(), checkpoint = r.restoreActualCheckpoint();
      expect(r.sim.mission.failed).toBe(false); expect(r.sim.player.health).toBeGreaterThan(0);
      r.finishHall(); expect(r.sim.safeCount).toBe(6); expect(r.sim.player.health).toBe(42);
      expect(r.sim.mission.facts).toContain('zhao-executed'); expect(r.sim.mission.failed).toBe(false);
      details = {status:'PASS',failed,checkpoint};
    } catch(error) { details={...details,status:'FAIL',error:String(error)}; throw error; }
    finally {r.save('s02-failure-retry.json',details); r.dispose();}
  });
  it('S04 fails to real enemy projectiles, retries the observed-convoy checkpoint, then hands off nine identities', () => {
    const r = new Replay('workers'); let details = {};
    try {
      r.until('observe convoy', () => r.sim.mission.phase===1, () => r.drive(W.observation,{combat:false,lookAt:[W.convoy[0],1.62,W.convoy[2]]}));
      r.until('ordinary enemy death', () => r.sim.mission.failed, () => r.drive([7,0,10],{combat:false}),90,true);
      expect(r.sim.player.health).toBe(0); expect(r.hurts.some(e=>e.projectileHurt)).toBe(true);
      expect(r.sim.mission.complete).toBe(false); expect(r.sim.mission.facts).not.toContain('technicians-received');
      const failed = r.summary(), checkpoint = r.restoreActualCheckpoint();
      r.finishWorkers(); expect(r.sim.mission.failed).toBe(false); expect(r.sim.safeCount).toBe(9);
      expect(r.sim.workers.map(a=>a.id)).toEqual(Array.from({length:9},(_,i)=>`worker-${i}`));
      expect(r.sim.mission.facts).toEqual(expect.arrayContaining(['technicians-received','family-escort-promised','reception-damage-known']));
      details = {status:'PASS',failed,checkpoint};
    } catch(error) {details={...details,status:'FAIL',error:String(error)}; throw error;}
    finally {r.save('s04-failure-retry.json',details);r.dispose();}
  });
});

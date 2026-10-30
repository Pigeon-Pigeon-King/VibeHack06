import type { CharacterRole, ControlMode, ScenarioId, SolidSpec, Vec3 } from '../contracts';
import { LAYOUT } from '../content/layout';
import { NIGHT, WORKERS } from '../content/chapter-layout';
import { HISTORY } from '../content/history-layout';
import { FRONTGATE } from '../content/frontgate-layout';
import { TRANSFER } from '../content/transfer-layout';
import { FLANK } from '../content/flank-layout';
import { openingObjective, populateOpening, updateOpening } from './Opening';
import { frontgateObjective, populateFrontgate, updateFrontgate } from './Frontgate';
import { populateTransfer, transferObjective, updateTransfer } from './Transfer';
import { flankObjective, populateFlank, updateFlank } from './Flank';
import { Physics, FIXED_DT } from '../runtime/Physics';
import { Random } from '../runtime/random';
import { Ballistics } from '../combat/Ballistics';
import { Navigation, type NavBounds } from '../actors/Navigation';
import type { Intent } from '../player/Input';

export interface Actor {
  id: string; name: string; role: CharacterRole; position: Vec3; health: number; yaw: number;
  goals: Vec3[]; path: Vec3[]; walk: number; aiming: boolean; aimTime: number;
  cooldown: number; safe: boolean; released: boolean; down: boolean;
}
export interface Player {
  position: Vec3; yaw: number; pitch: number; health: number; ammo: number; reserve: number;
  height: number; crouched: boolean; reload: number; cooldown: number; hurtAt: number;
  walk: number; recoil: number; ads: boolean; name: string;
}
export interface Mission {
  scenario: ScenarioId; phase: number; elapsed: number; phaseTime: number; control: ControlMode;
  facts: string[]; complete: boolean; failed: boolean; checkpointLabel: string;
  subtitle: string; speaker: string; subtitleUntil: number; spawned: number; nextSpawn: number;
}
export interface Snapshot {
  schema: 1; player: Player; actors: Actor[]; mission: Mission; random: number; hits: number; kills: number;
}
export interface GameEvent { type: 'shot' | 'impact' | 'hit' | 'hurt' | 'reload' | 'objective' | 'checkpoint'; position?: Vec3; enemy?: boolean }
export function distance(a: Vec3, b: Vec3): number { return Math.hypot(a[0] - b[0], a[2] - b[2]); }
function eye(foot: Vec3, height = 1.8): Vec3 { return [foot[0], foot[1] + height - 0.14, foot[2]]; }
function clone<T>(value: T): T { return structuredClone(value); }
export const emptyIntent: Intent = { forward: 0, right: 0, sprint: false, crouch: false, jump: false, fire: false, ads: false, reload: false, interact: false, skip: false, yaw: 0, pitch: 0 };

export class Simulation {
  readonly physics: Physics;
  navigation: Navigation;
  private cartNavigation: Navigation;
  readonly ballistics: Ballistics;
  readonly random = new Random();
  actors: Actor[] = [];
  player: Player;
  mission: Mission;
  checkpoint!: Snapshot;
  events: GameEvent[] = [];
  hits = 0; kills = 0; hitFlash = 0; hurtFlash = 0;
  private checkpointPending = false;
  private readonly navBounds?: NavBounds;
  private readonly pathRetry = new Map<string, number>();

  constructor(readonly scenario: ScenarioId, readonly solids: SolidSpec[], saved?: Snapshot, priorFacts: readonly string[] = []) {
    this.physics = new Physics(solids);
    this.navBounds = scenario === 'nightshift' ? NIGHT.bounds : scenario === 'workers' ? WORKERS.bounds
      : scenario === 'childhood' || scenario === 'mainhall' ? HISTORY.bounds : scenario === 'frontgate' ? FRONTGATE.bounds
      : scenario === 'transfer' ? TRANSFER.bounds : scenario === 'flank' ? FLANK.bounds : undefined;
    this.navigation = new Navigation(solids, this.navBounds);
    this.cartNavigation = new Navigation(solids, this.navBounds, 1.3);
    this.ballistics = new Ballistics((a, b, except) => this.physics.trace(a, b, except));
    const layout = LAYOUT[scenario];
    this.player = { position: [...layout.spawn], yaw: layout.yaw, pitch: 0, health: 100,
      ammo: scenario === 'nightshift' || scenario === 'childhood' ? 0 : 25, reserve: scenario === 'nightshift' || scenario === 'childhood' ? 0 : 150, height: scenario === 'prologue' || scenario === 'childhood' ? 1.1 : 1.8, crouched: false,
      reload: 0, cooldown: 0, hurtAt: -10, walk: 0, recoil: 0, ads: false,
      name: scenario === 'prologue' || scenario === 'childhood' ? '陆闻川 · 九岁' : scenario === 'mainhall' ? '周延 · 二十三岁' : scenario === 'northgate' || scenario === 'frontgate' || scenario === 'flank' ? '周延 · 三十三岁' : '陆闻川 · 十九岁' };
    this.mission = { scenario, phase: 0, elapsed: 0, phaseTime: 0, control: scenario === 'northgate' || scenario === 'frontgate' || scenario === 'flank' ? 'combat' : 'work',
      facts: [...new Set(priorFacts)], complete: false, failed: false, checkpointLabel: '进入区域',
      subtitle: '', speaker: '', subtitleUntil: 0, spawned: 0, nextSpawn: 12 };
    if (saved) {
      this.player = clone(saved.player); this.mission = clone(saved.mission); this.actors = clone(saved.actors);
      this.random.state = saved.random; this.hits = saved.hits; this.kills = saved.kills;
      this.checkpoint = clone(saved);
    } else this.populate();
    this.physics.add('player', this.player.position, this.player.height);
    for (const actor of this.actors) if (!actor.down) {
      if (actor.role === 'cart') this.physics.addCart(actor.id, actor.position, actor.yaw);
      else this.physics.add(actor.id, actor.position, actor.role === 'child' ? 1.1 : 1.8);
    }
    this.syncTopology(false);
    this.physics.step();
    if (!saved) this.saveCheckpoint('进入区域');
    this.events = [];
  }

  private populate(): void {
    if (this.scenario === 'childhood' || this.scenario === 'mainhall') { populateOpening(this); return; }
    if (this.scenario === 'frontgate') { populateFrontgate(this); return; }
    if (this.scenario === 'transfer') { populateTransfer(this); return; }
    if (this.scenario === 'flank') { populateFlank(this); return; }
    const l = LAYOUT[this.scenario];
    if (this.scenario === 'nightshift') {
      this.createActor('xu', '许岚', 'medic', NIGHT.xu);
      this.createActor('meng', '孟齐', 'ally', NIGHT.meng);
      this.createActor('zhou', '周延', 'ally', NIGHT.zhou);
      this.say('许岚', '闻川，通风又停了。你修完，把架上的保温毯送过来；我还得把这班交完。');
      return;
    }
    l.workerSpawns.forEach((p, i) => this.createActor(`worker-${i}`, this.scenario === 'prologue' ? `撤离者 ${i + 1}` : `港务员 ${i + 1}`, 'worker', p));
    if (this.scenario === 'workers') {
      this.actors[0].name = '罗敬';
      this.actors[0].position = [21, 0, 17]; this.actors[1].position = [24, 0, 17];
      this.createActor('zheng', '郑铎', 'ally', WORKERS.zheng);
      this.createActor('meng', '孟齐', 'ally', WORKERS.meng);
      this.say('郑铎', '街角有遮护。右前方那辆军用车上，怎么都是港务的人？先看清楚，报给周延。');
      return;
    }
    this.createActor('zheng', '郑铎', 'ally', this.scenario === 'northgate' ? [10, 0, 24] : [4, 0, 6]);
    if (this.scenario === 'northgate') {
      for (let i = 0; i < 3; i++) this.spawnEnemy(false);
      const laneGuard = this.actors.find(a => a.id === 'enemy-0')!;
      laneGuard.position = [-9, 0, -4];
      laneGuard.goals = [[-9, 0, -4]];
      this.say('郑铎', '北门有人。到称重台接通撤离线，我守住后路。');
    } else if (this.scenario === 'prologue') {
      this.createActor('father', '父亲', 'father', l.terminal);
      this.say('父亲', '抓紧我。过了检修门，就是主厅。');
    } else {
      this.createActor('medic', '医护', 'medic', [18, 0, 26]);
      this.say('罗敬', '家里人已经接到安全区。我愿意留下，把通路接好。');
    }
  }

  createActor(id: string, name: string, role: CharacterRole, position: Vec3): Actor {
    const actor: Actor = { id, name, role, position: [...position], health: role === 'enemy' ? 68 : 100,
      yaw: role === 'enemy' ? Math.PI : 0, goals: [], path: [], walk: 0,
      aiming: false, aimTime: 0, cooldown: this.random.between(0.7, 1.4), safe: false, released: false, down: false };
    this.actors.push(actor);
    return actor;
  }
  private spawnEnemy(addBody = true, east = false): void {
    if (this.scenario === 'northgate' && (this.aliveEnemies.length >= 6 || this.mission.spawned >= 24)) return;
    const l = LAYOUT[this.scenario];
    const index = east && this.scenario === 'northgate' ? 3 : this.mission.spawned % Math.min(3, l.enemySpawns.length);
    const position = [...l.enemySpawns[index]] as Vec3;
    position[0] += this.random.between(-1, 1);
    const actor = this.createActor(`enemy-${this.mission.spawned}`, '敌方步枪兵', 'enemy', position);
    this.mission.spawned++;
    actor.goals = [east ? [14, 0, -2] : [this.random.between(-9, 9), 0, this.random.between(-15, -9)]];
    if (addBody) this.physics.add(actor.id, actor.position);
  }
  route(actor: Actor, goals: Vec3[]): void { actor.goals = clone(goals); actor.path = []; actor.released = true; }
  private syncTopology(clearPaths = true): void {
    if (!this.physics.applyFacts(this.mission.facts)) return;
    this.navigation = new Navigation(this.solids.filter(solid => !solid.openFact || !this.has(solid.openFact)), this.navBounds);
    this.cartNavigation = new Navigation(this.solids.filter(solid => !solid.openFact || !this.has(solid.openFact)), this.navBounds, 1.3);
    if (clearPaths) { for (const actor of this.actors) actor.path = []; this.pathRetry.clear(); }
  }
  spawnChapterGroup(group: string, positions: Vec3[], goals?: Vec3[]): void {
    const budget = group === 'E04' || group === 'E05' ? 44 : group === 'E02' ? 20 : 18;
    const used = this.actors.filter(actor => actor.id.startsWith(`enemy-${group}-`)).length;
    const count = Math.min(positions.length, Math.max(0, 8 - this.aliveEnemies.length), Math.max(0, budget - used));
    for (let i = 0; i < count; i++) {
      const actor = this.createActor(`enemy-${group}-${this.mission.spawned++}`, '敌方步枪兵', 'enemy', positions[i]);
      if (goals?.[i]) actor.goals = [goals[i]];
      this.physics.add(actor.id, actor.position);
    }
  }
  exposedThreat(point: Vec3, radius: number): boolean {
    return this.aliveEnemies.some(actor => distance(actor.position, point) < radius
      && !this.physics.trace(eye(point), eye(actor.position), undefined, true));
  }
  private workerThreatened(actor: Actor): boolean {
    return this.aliveEnemies.some(enemy => distance(actor.position, enemy.position) < 8
      && !this.physics.trace(eye(actor.position), eye(enemy.position), actor.id, true));
  }
  fact(id: string): void { if (!this.mission.facts.includes(id)) this.mission.facts.push(id); }
  has(id: string): boolean { return this.mission.facts.includes(id); }
  say(speaker: string, subtitle: string, seconds = 7): void {
    Object.assign(this.mission, { speaker, subtitle, subtitleUntil: this.mission.elapsed + seconds });
  }
  phase(phase: number, subtitle: string, control: ControlMode = 'combat', speaker = this.player.name): void {
    Object.assign(this.mission, { phase, phaseTime: 0, control });
    this.say(speaker, subtitle);
    this.events.push({ type: 'objective' });
    this.checkpointPending = true;
  }

  get workers(): Actor[] { return this.actors.filter(a => a.role === 'worker'); }
  get safeCount(): number { return this.workers.filter(a => a.safe).length; }
  get aliveEnemies(): Actor[] { return this.actors.filter(a => a.role === 'enemy' && !a.down); }
  get playerEye(): Vec3 { return eye(this.player.position, this.player.height); }

  snapshot(): Snapshot {
    return clone({ schema: 1, player: this.player, mission: this.mission, actors: this.actors,
      random: this.random.state, hits: this.hits, kills: this.kills });
  }
  private saveCheckpoint(label: string): void {
    this.mission.checkpointLabel = label;
    this.checkpoint = this.snapshot();
    this.events.push({ type: 'checkpoint' });
  }

  step(intent: Intent, dt = FIXED_DT): void {
    if (this.mission.complete || this.mission.failed) return;
    this.events = [];
    const p = this.player, m = this.mission;
    m.elapsed += dt; m.phaseTime += dt;
    this.hitFlash = Math.max(0, this.hitFlash - dt * 5);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2);
    p.recoil *= Math.exp(-dt * 12);
    p.yaw = intent.yaw; p.pitch = intent.pitch;
    const canMove = m.control !== 'staged';
    const canShoot = m.control === 'combat';
    p.ads = canShoot && intent.ads && !intent.sprint;
    p.cooldown = Math.max(0, p.cooldown - dt);
    if (intent.reload && !p.reload && p.ammo < 25 && p.reserve > 0 && canShoot) {
      p.reload = 2.1; this.events.push({ type: 'reload' });
    }
    if (p.reload > 0) {
      p.reload = Math.max(0, p.reload - dt);
      if (!p.reload) { const count = Math.min(25 - p.ammo, p.reserve); p.ammo += count; p.reserve -= count; }
    }
    const isChild = this.scenario === 'childhood' || this.scenario === 'prologue' && m.phase < 2;
    const desiredHeight = isChild ? 1.1 : this.scenario === 'mainhall' && m.phase >= 4 ? 0.65 : (intent.crouch ? 1.2 : 1.8);
    if (this.physics.setHeight('player', desiredHeight)) p.height = desiredHeight;
    p.crouched = !isChild && p.height < 1.5;
    const speed = m.control === 'cooperative' ? 1.5 : isChild ? 1.55 : p.crouched ? 1.35 : intent.sprint && !p.ads ? 6.3 : p.ads ? 1.65 : 2.1;
    const length = Math.max(1, Math.hypot(intent.forward, intent.right));
    const forward = canMove ? intent.forward / length * speed : 0, right = canMove ? intent.right / length * speed : 0;
    this.physics.move('player', -Math.sin(p.yaw) * forward + Math.cos(p.yaw) * right,
      -Math.cos(p.yaw) * forward - Math.sin(p.yaw) * right, dt, canMove && m.control !== 'cooperative' && intent.jump);

    this.updateActors(dt);
    this.physics.step();
    const previous = p.position;
    p.position = this.physics.foot('player');
    p.walk += distance(previous, p.position) * 4;
    for (const actor of this.actors) if (this.physics.bodies.has(actor.id)) actor.position = this.physics.foot(actor.id);
    if (canShoot && intent.fire && !p.reload && !p.cooldown && p.ammo > 0) {
      p.ammo--; p.cooldown = 0.115; p.recoil = Math.min(1, p.recoil + 0.45);
      const spread = p.ads ? 0.002 : 0.008;
      const yaw = p.yaw + this.random.between(-spread, spread), pitch = p.pitch + this.random.between(-spread, spread);
      const direction: Vec3 = [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
      const sight = this.playerEye;
      const far = sight.map((v, i) => v + direction[i] * 80) as Vec3;
      let aimPoint = this.physics.trace(sight, far, 'player')?.point ?? far;
      // A conservative physical muzzle proxy stays in front of the body. If the
      // barrel would cross a wall, this shot must end at that obstruction even
      // when the eye can see above a low cover. Never reroute it over the cover.
      const side = p.ads ? 0 : 0.14;
      const muzzle: Vec3 = [sight[0] + direction[0] * 0.65 + Math.cos(p.yaw) * side,
        sight[1] + direction[1] * 0.65 - 0.12, sight[2] + direction[2] * 0.65 - Math.sin(p.yaw) * side];
      const barrelHit = this.physics.trace(sight, muzzle, 'player', true);
      const origin = barrelHit ? sight : muzzle;
      if (barrelHit) aimPoint = barrelHit.point;
      this.ballistics.fire('player', origin, aimPoint.map((v, i) => v - origin[i]) as Vec3, 34);
      this.events.push({ type: 'shot', position: this.playerEye });
    }
    for (const impact of this.ballistics.update(dt)) {
      const { projectile, hit } = impact;
      this.events.push({ type: 'impact', position: hit.point, enemy: hit.id.startsWith('enemy-') });
      if (hit.id === 'player' && this.actors.some(source => source.id === projectile.owner && source.role === 'enemy')) {
        p.health = Math.max(0, p.health - projectile.damage); p.hurtAt = m.elapsed; this.hurtFlash = 1;
        this.events.push({ type: 'hurt' });
      } else {
        const actor = this.actors.find(a => a.id === hit.id && !a.down);
        const playerShot = projectile.owner === 'player';
        const friendlyShot = playerShot || this.actors.some(source => source.id === projectile.owner && source.role === 'ally');
        if (actor?.role === 'enemy' && friendlyShot) {
          actor.health -= projectile.damage;
          if (playerShot) { this.hits++; this.hitFlash = 1; this.events.push({ type: 'hit' }); }
          if (actor.health <= 0) { actor.down = true; actor.aiming = false; this.physics.remove(actor.id); if (playerShot) this.kills++; }
        } else if (actor && actor.role !== 'enemy' && projectile.owner === 'player') {
          this.say(this.scenario === 'mainhall' ? '赵启明' : '郑铎', '停火，自己人！', 2);
        }
      }
    }
    if (p.health <= 0 || p.position[1] < -4) {
      m.failed = true; this.say('', '战斗中失去行动能力。可从最近检查点重试。'); return;
    }
    if (m.elapsed - p.hurtAt > 6) p.health = Math.min(100, p.health + dt * 7);
    this.updateMission(intent, dt);
    this.syncTopology();
    if (this.checkpointPending) { this.checkpointPending = false; this.saveCheckpoint(this.objective.phase); }
  }

  private updateActors(dt: number): void {
    const m = this.mission;
    const closest = this.aliveEnemies.slice().sort((a, b) => distance(a.position, this.player.position) - distance(b.position, this.player.position)).slice(0, 2);
    for (const a of this.actors) {
      if (a.down || !this.physics.bodies.has(a.id)) continue;
      let speed = a.role === 'enemy' ? 1.5 : a.role === 'cart' ? 1.25 : 2.1;
      if (this.scenario === 'transfer' && a.id === 'xu') speed = 1.2;
      a.cooldown = Math.max(0, a.cooldown - dt);
      a.aiming = false;
      if (a.role === 'enemy') {
        const visible = distance(a.position, this.player.position) < 52 && !this.physics.trace(eye(a.position), this.playerEye, a.id, true);
        if (visible && m.control === 'combat' && closest.includes(a)) {
          a.aimTime += dt; a.aiming = true;
          a.yaw = Math.atan2(this.player.position[0] - a.position[0], this.player.position[2] - a.position[2]);
          if (a.aimTime > 0.8 && a.cooldown === 0) {
            const from = eye(a.position), target = this.playerEye;
            const range = Math.max(1, distance(a.position, this.player.position));
            const spread = range * 0.03;
            this.ballistics.fire(a.id, from, [target[0] - from[0] + this.random.between(-spread, spread),
              target[1] - from[1] + this.random.between(-spread, spread), target[2] - from[2] + this.random.between(-spread, spread)], 9, 360);
            a.cooldown = this.random.between(0.8, 1.5);
            this.events.push({ type: 'shot', position: from, enemy: true });
          }
          speed = 0;
        } else a.aimTime = 0;
      }
      if (a.role === 'worker' && a.released && !a.safe && this.workerThreatened(a)) speed = 0;
      if (a.role === 'ally' && a.id !== 'meng' && !a.goals.length && m.control === 'combat' && (this.scenario === 'mainhall' || this.scenario === 'frontgate' || this.scenario === 'flank')) {
        const target = this.aliveEnemies.find(enemy => distance(a.position, enemy.position) < 48
          && !this.physics.trace(eye(a.position), eye(enemy.position), a.id, true));
        if (target) {
          a.aiming = true; a.yaw = Math.atan2(target.position[0] - a.position[0], target.position[2] - a.position[2]);
          if (a.cooldown === 0) {
            const from = eye(a.position), to = eye(target.position);
            this.ballistics.fire(a.id, from, [to[0] - from[0] + this.random.between(-0.8, 0.8),
              to[1] - from[1], to[2] - from[2] + this.random.between(-0.8, 0.8)], 17, 420);
            a.cooldown = this.random.between(1.6, 2.8);
            this.events.push({ type: 'shot', position: from });
          }
        }
      }
      let vx = 0, vz = 0;
      if (a.goals.length && speed) {
        const goal = a.goals[0];
        if (distance(a.position, goal) < 0.85) { a.goals.shift(); a.path = []; }
        else {
          // The short stepped walkway has authored successive support points.
          // Its walkers follow those through actual physics, not the ground-only
          // navigation grid. Carts use their own full-width clearance grid.
          const authored = this.scenario === 'flank' && (a.id.startsWith('walker-') || a.role === 'worker');
          if (!a.path.length && m.elapsed >= (this.pathRetry.get(a.id) ?? 0)) {
            a.path = authored ? [[...goal]] : (a.role === 'cart' ? this.cartNavigation : this.navigation).path(a.position, goal);
            this.pathRetry.set(a.id, a.path.length ? 0 : m.elapsed + 1);
          }
          while (a.path.length && distance(a.position, a.path[0]) < 0.35) a.path.shift();
          const next = a.path[0];
          if (next) {
            const dx = next[0] - a.position[0], dz = next[2] - a.position[2], len = Math.hypot(dx, dz);
            vx = dx / len * speed; vz = dz / len * speed;
            a.yaw = Math.atan2(vx, vz); a.walk += dt * speed * 4;
          }
        }
      }
      if (a.role === 'cart' && (vx || vz)) {
        const length = Math.hypot(vx, vz), dx = vx / length, dz = vz / length;
        const queueAhead = this.actors.some(other => {
          if (other === a || other.role !== 'cart' || other.safe) return false;
          const x = other.position[0] - a.position[0], z = other.position[2] - a.position[2];
          const ahead = x * dx + z * dz;
          return ahead > 0 && ahead < 3.6 && Math.abs(x * dz - z * dx) < 1.0;
        });
        if (queueAhead) { vx = 0; vz = 0; a.walk -= dt * speed * 4; }
        this.physics.orient(a.id, a.yaw);
      }
      this.physics.move(a.id, vx, vz, dt);
    }
  }

  private releaseWorkers(): void {
    const l = LAYOUT[this.scenario];
    this.workers.forEach((a, i) => {
      const goals: Vec3[] = this.scenario === 'northgate' ? [[-12, 0, a.position[2]], [-12, 0, 25 + i % 3]]
        : this.scenario === 'handover' ? [[-8, 0, 4], [-2 + i * 2, 0, 1]] : [[-8, 0, 10], [-8 + i, 0, 23]];
      this.route(a, goals);
    });
    this.fact('workers-released');
  }

  private updateMission(input: Intent, dt: number): void {
    const m = this.mission, p = this.player, l = LAYOUT[this.scenario];
    for (const a of this.workers) {
      const target = this.scenario === 'handover' ? l.post : l.safe;
      if (a.released && !a.goals.length && distance(a.position, target) < (this.scenario === 'handover' ? 4 : 5)) a.safe = true;
    }
    const at = (target: Vec3, range = 2.8) => distance(p.position, target) < range;
    if (this.scenario === 'childhood' || this.scenario === 'mainhall') { updateOpening(this, input); return; }
    if (this.scenario === 'frontgate') { updateFrontgate(this, input); return; }
    if (this.scenario === 'transfer') { updateTransfer(this, input); return; }
    if (this.scenario === 'flank') { updateFlank(this, input); return; }
    if (this.scenario === 'nightshift') this.updateNight(input);
    else if (this.scenario === 'workers') this.updateWorkers(input);
    else if (this.scenario === 'northgate') {
      if (m.phase === 0 && input.interact && at(l.terminal)) {
        this.fact('evac-line-open'); this.releaseWorkers(); this.phase(1, '撤离线接通。先让称重台的人往南走。');
      } else if (m.phase === 1 && this.safeCount >= 3) {
        this.phase(2, '东侧车道来敌！守住后路，余下人员继续走。');
        for (let i = 0; i < 2; i++) this.spawnEnemy(true, true);
      } else if (m.phase === 2 && this.safeCount === this.workers.length) {
        this.fact('all-workers-safe'); this.phase(3, '人员到齐。郑铎，来接阵位，我们分批撤。');
        this.route(this.actors.find(a => a.id === 'zheng')!, [l.post]);
      } else if (m.phase === 3 && !this.has('handoff') && input.interact && at(l.post) && distance(this.actors.find(a => a.id === 'zheng')!.position, l.post) < 1) {
        this.fact('handoff'); this.say('郑铎', '阵位接住了。沿南侧通道撤，我跟上。'); this.checkpointPending = true;
      } else if (m.phase === 3 && this.has('handoff') && at(l.exit)) this.finish('七名港务员已到达，阵位已交接。通路留给下一班。');
      if (m.phase > 0 && m.phase < 3 && m.elapsed > m.nextSpawn && this.aliveEnemies.length < 6 && m.spawned < 24) {
        this.spawnEnemy(true, m.phase === 2); m.nextSpawn = m.elapsed + 8;
      }
    } else if (this.scenario === 'prologue') {
      const father = this.actors.find(a => a.id === 'father')!;
      if (m.phase === 0 && input.interact && at(l.terminal)) {
        this.route(father, [l.post]); this.phase(1, '抓紧我，别松手。', 'staged', '父亲');
      } else if (m.phase === 1) {
        // A single anchor owns both participants during this staged carry.
        const forward = [Math.sin(father.yaw), Math.cos(father.yaw)];
        const right = [Math.cos(father.yaw), -Math.sin(father.yaw)];
        this.physics.teleport('player', [father.position[0] + forward[0] * 0.5 + right[0] * 0.35,
          father.position[1] + 0.55, father.position[2] + forward[1] * 0.5 + right[1] * 0.35]);
        p.position = this.physics.foot('player');
        if (input.skip || distance(father.position, l.post) < 1) {
          this.physics.teleport('father', l.post); father.position = [...l.post]; father.goals = []; father.path = [];
          this.fact('father-and-child-through-door');
          p.name = '周延 · 二十三岁'; this.physics.setHeight('player', 1.8); p.height = 1.8;
          this.physics.teleport('player', [4, 0, 12]); p.position = [4, 0, 12];
          this.releaseWorkers(); for (let i = 0; i < 3; i++) this.spawnEnemy();
          this.phase(2, '周延，守住主厅，让他们从南门出去。', 'combat', '赵启明');
        }
      } else if (m.phase === 2 && this.safeCount === this.workers.length) {
        this.fact('hall-evacuated'); this.phase(3, '最后一个人过去了。撤！', 'staged', '赵启明');
      } else if (m.phase === 3 && (m.phaseTime > 5 || input.skip)) this.finish('撤离者已经穿过南门。主厅在身后失守。');
    } else {
      const rescue = LAYOUT.handover.rescue;
      const zheng = this.actors.find(a => a.id === 'zheng')!;
      if (m.phase === 0 && input.interact && at(l.terminal)) {
        this.fact('knows-shaoyuan-route'); this.fact('knows-escort-risk'); this.fact('lu-keeps-promise');
        this.releaseWorkers(); this.phase(1, '邵原的追击通路仍然可用。但护送的人在这里——先带他们过去。', 'work');
      } else if (m.phase === 1 && this.safeCount === this.workers.length && at(l.post) && input.interact) {
        p.name = '周延'; this.route(zheng, [l.post]); this.phase(2, '来得正好。等你站稳，我把阵位交出来。', 'work');
      } else if (m.phase === 2 && at(l.post) && distance(zheng.position, l.post) < 1 && input.interact) {
        this.fact('zhou-growth-complete'); this.fact('zhou-accepts-protection');
        this.phase(3, '护具扣好了。东北支线反扑，孟齐被压在前面——我跟你去！', 'combat', '郑铎');
        const meng = this.createActor('meng', '孟齐', 'ally', rescue); meng.down = true;
        for (let i = 0; i < 3; i++) this.spawnEnemy();
      } else if (m.phase === 3 && at(rescue) && input.interact) {
        this.fact('meng-rescued'); this.fact('zhou-wounded-asks-help');
        this.phase(4, '郑铎，帮我一下……我们一起把孟齐送回去。', 'cooperative');
        this.ballistics.clear();
      } else if (m.phase === 4) {
        const meng = this.actors.find(a => a.id === 'meng')!;
        const f: Vec3 = [-Math.sin(p.yaw), 0, -Math.cos(p.yaw)];
        meng.position = [p.position[0] + f[0], 0.75, p.position[2] + f[2]];
        meng.yaw = p.yaw; meng.down = true;
        this.physics.teleport('zheng', [p.position[0] + f[0] * 2, 0, p.position[2] + f[2] * 2]);
        zheng.position = this.physics.foot('zheng'); zheng.yaw = p.yaw + Math.PI; zheng.goals = []; zheng.path = [];
        if (at(l.safe, 3)) {
          this.fact('medical-handoff'); meng.position = [14, 0.65, 25];
          this.route(this.actors.find(a => a.id === 'medic')!, [[16, 0, 25]]);
          this.phase(5, '把担架交给我们。两个人都送进去，继续救治。', 'staged', '医护');
        }
      } else if (m.phase === 5 && (m.phaseTime > 9 || input.skip)) {
        const medic = this.actors.find(a => a.id === 'medic')!;
        this.physics.teleport('medic', [16, 0, 25]); medic.position = [16, 0, 25]; medic.goals = []; medic.path = [];
        const meng = this.actors.find(a => a.id === 'meng')!;
        meng.position = [14, 0.65, 25]; meng.goals = []; meng.path = [];
        this.fact('meng-survives'); this.fact('zhou-dies-after-treatment');
        this.finish('孟齐已经转入治疗。周延没有抢救过来。');
      }
    }
    if (m.phaseTime > 1 && input.skip && m.control !== 'staged') { /* Enter never completes unfinished combat. */ }
    void dt;
  }

  finish(text: string): void { this.mission.complete = true; this.ballistics.clear(); this.say('', text, 100); this.events.push({ type: 'objective' }); }

  private updateNight(input: Intent): void {
    const m = this.mission;
    const at = (point: Vec3) => distance(this.player.position, point) < 2.8;
    if (m.phase === 0 && input.interact && at(NIGHT.fan)) {
      this.fact('fan-cleared'); this.phase(1, '堵塞物拿出来了。到旁边的面板复位。', 'work');
    } else if (m.phase === 1 && input.interact && at(NIGHT.fanReset)) {
      this.fact('fan-restarted'); this.phase(2, '风起来了。我去拿保温毯。', 'work');
    } else if (m.phase === 2 && input.interact && at(NIGHT.supplies)) {
      this.fact('supplies-collected'); this.phase(3, '箱子放交接台就好，我先核对转运名单。', 'cooperative', '许岚');
    } else if (m.phase === 3 && input.interact && at(NIGHT.delivery)) {
      this.fact('supplies-delivered'); this.phase(4, '收到。孟齐已经看过转运路线，你们在旧样本室碰头。', 'work', '许岚');
    } else if (m.phase === 4 && input.interact && at(NIGHT.map)) {
      this.fact('fleet-approaching'); this.phase(5, '舰队已经抵近。先带回港务技工，再接通接收中心。护送到站后，我带人回北闸换班。', 'staged', '孟齐');
    } else if (m.phase === 5) {
      if (m.phaseTime > 4 && !this.has('briefing-zhou-spoke')) {
        this.fact('briefing-zhou-spoke'); this.say('周延', '看到邵原的消息，彼此都说一声。护送的人先接稳——装备我再替你核一遍。');
      }
      if (m.phaseTime > 9 || input.skip) {
        this.fact('briefing-zhou-spoke');
        this.fact('sharing-promised'); this.fact('handoff-planned');
        this.phase(6, '明白。消息一起看，护送之后换班。我的装备我自己核。', 'work');
      }
    } else if (m.phase === 6 && input.interact && at(NIGHT.weapons)) {
      this.player.ammo = 25; this.player.reserve = 150;
      this.fact('weapon-collected'); this.phase(7, '弹匣、备用弹、通信，都在。出发。', 'work');
    } else if (m.phase === 7 && at(NIGHT.exit)) {
      this.fact('departed-for-port'); this.phase(8, '', 'work');
      this.finish('夜班交接完毕。带着共享情报与护送后接防的约定，前往占领区。');
    }
  }

  private updateWorkers(input: Intent): void {
    const m = this.mission, p = this.player, w = WORKERS;
    const at = (point: Vec3, height = false) => distance(p.position, point) < 2.8 && (!height || Math.abs(p.position[1] - point[1]) < 0.5);
    if (m.phase === 0 && input.interact && at(w.observation) && this.lookingAtConvoy()) {
      this.fact('convoy-reported'); this.fact('zhou-adopts-lu-report');
      for (let i = 0; i < 2; i++) this.route(this.workers[i], [[44, 0, 17], [44, 0, -130], [-32, 0, -130], [-32, 0, -99], w.workers[i]]);
      this.spawnChapterGroup('E01', w.checkpointEnemies); m.nextSpawn = m.elapsed + 14;
      this.phase(1, '看清了，是港务的人。采纳你的判断：从检查口进去，走西侧检修线，别从宿舍正门撞进去。', 'combat', '周延');
    } else if (m.phase === 1 && input.interact && at(w.checkpoint) && !this.exposedThreat(w.checkpoint, 19)) {
      this.fact('checkpoint-open'); this.spawnChapterGroup('E02', w.maintenanceEnemies); m.nextSpawn = m.elapsed + 18;
      this.phase(2, '检查口已开。西边下层有检修隔离面板，先把通道接通。', 'combat', '郑铎');
    } else if (m.phase === 2 && input.interact && at(w.lower) && !this.exposedThreat(w.lower, 14)) {
      this.fact('maintenance-access');
      this.phase(3, '电源接好了。沿台阶上去，看清上层和生活院的后门。', 'combat', '郑铎');
    } else if (m.phase === 3 && input.interact && at(w.overlook, true) && !this.exposedThreat(w.overlook, 18)) {
      this.fact('maintenance-overlook-secured');
      this.phase(4, '后门在院南侧。下面还能走，从另一头台阶下去，我给你看着后路。', 'combat', '郑铎');
    } else if (m.phase === 4 && input.interact && at(w.yardGate)) {
      this.fact('yard-open'); this.spawnChapterGroup('E03', w.yardEnemies); m.nextSpawn = m.elapsed + 16;
      this.phase(5, '门开了！先清掉院里的威胁，让他们从西侧集合点出来。');
    } else if (m.phase === 5 && input.interact && at(w.release) && !this.exposedThreat(w.release, 30)) {
      this.fact('workers-released');
      this.workers.forEach((actor, i) => this.route(actor, [[-8, 0, -108 - i % 3 * 0.6], [20 + i % 3 * 2, 0, -111 - Math.floor(i / 3) * 1.5]]));
      this.spawnChapterGroup('E03', w.counterattack, [[27, 0, -110], [30, 0, -108]]); m.nextSpawn = m.elapsed + 14;
      this.phase(6, '转运位在东侧，我把车接过来。留意东北运输道，护送他们到转运位。', 'combat', '孟齐');
    } else if (m.phase === 6 && this.safeCount === this.workers.length && !this.exposedThreat(w.safe, 24)) {
      this.fact('technicians-received'); this.route(this.actors.find(actor => actor.id === 'meng')!, [w.post]);
      this.phase(7, '人都到了。我家里人还在别的转运点，你们能不能把他们也接上？', 'work', '罗敬');
    } else if (m.phase === 7 && input.interact && at(w.post)
      && distance(this.actors.find(actor => actor.id === 'meng')!.position, w.post) < 1) {
      this.fact('family-escort-promised'); this.fact('reception-damage-known');
      this.finish('九名港务人员已交接。接收中心门机受损，罗敬的家属护送承诺已经记下。');
    }
    this.updateChapterReinforcements();
  }

  private lookingAtConvoy(): boolean {
    const dx = WORKERS.convoy[0] - this.player.position[0], dz = WORKERS.convoy[2] - this.player.position[2];
    return (-Math.sin(this.player.yaw) * dx - Math.cos(this.player.yaw) * dz) / Math.hypot(dx, dz) > 0.65;
  }

  private updateChapterReinforcements(): void {
    const m = this.mission;
    const group = m.phase === 1 ? 'E01' : m.phase === 2 || m.phase === 3 ? 'E02' : m.phase === 5 || m.phase === 6 ? 'E03' : undefined;
    if (!group || this.aliveEnemies.length >= 8) return;
    const used = this.actors.filter(actor => actor.id.startsWith(`enemy-${group}-`)).length;
    const budget = group === 'E02' ? 20 : 18;
    if (used >= budget) return;
    const initial = group === 'E01' ? WORKERS.checkpointEnemies : group === 'E02' ? WORKERS.maintenanceEnemies : WORKERS.yardEnemies;
    // Surviving enemies keep their bodies and identities across a door. Delay
    // the next area's initial group until slots free up instead of exceeding
    // the pressure cap or silently deleting the previous group.
    if (m.phase !== 6 && used < initial.length) {
      this.spawnChapterGroup(group, initial.slice(used));
      m.nextSpawn = m.elapsed + 14;
      return;
    }
    const warning = `reinforcements-${group}-${used}`;
    if (m.elapsed >= m.nextSpawn - 3 && !this.has(warning)) {
      this.fact(warning); this.say('郑铎', group === 'E03' ? '东北运输道有动静，靠住硬掩体。' : '北边又有人进来，先看入口。', 3);
    }
    if (m.elapsed < m.nextSpawn) return;
    const entries: Vec3[] = group === 'E01' ? [[-11, 0, -13], [11, 0, -14]]
      : group === 'E02' ? [[-30, 0, -63], [-8, 0, -65]] : WORKERS.counterattack;
    const goals: Vec3[] = group === 'E01' ? [[-9, 0, 5], [9, 0, 5]]
      : group === 'E02' ? [[-26, 0, -32], [-8, 0, -38]] : [[27, 0, -110], [30, 0, -108]];
    this.spawnChapterGroup(group, entries.slice(0, Math.min(2, budget - used, 8 - this.aliveEnemies.length)), goals);
    m.nextSpawn = m.elapsed + 12;
  }

  get objective(): { phase: string; text: string; detail: string; point: Vec3; interaction: string } {
    if (this.scenario === 'childhood' || this.scenario === 'mainhall') return openingObjective(this);
    if (this.scenario === 'frontgate') return frontgateObjective(this);
    if (this.scenario === 'transfer') return transferObjective(this);
    if (this.scenario === 'flank') return flankObjective(this);
    if (this.scenario === 'nightshift' || this.scenario === 'workers') return this.chapterObjective;
    const l = LAYOUT[this.scenario], m = this.mission;
    let phase = '', text = '', detail = '', point: Vec3 = l.terminal, action = '';
    if (this.scenario === 'northgate') {
      phase = ['01 · 北路接敌', '02 · 称重台撤离', '03 · 东侧压力', '04 · 分批回撤'][m.phase];
      if (m.phase === 0) { text = '接通称重台撤离线'; action = '接通撤离线'; detail = '利用掩体接近控制台，留意北路。'; }
      else if (m.phase < 3) { text = `掩护港务员南撤 · ${this.safeCount}/${this.workers.length}`; point = l.safe; detail = m.phase === 2 ? '东侧车道来敌；近敌会让工人停下。' : '工人沿西侧通道行进，靠近的敌人会压住路线。'; }
      else if (!this.has('handoff')) {
        point = l.post; text = '与郑铎交接阵位'; detail = '等接防者到位，再确认交接。';
        if (distance(this.actors.find(a => a.id === 'zheng')!.position, l.post) < 1) action = '确认阵位交接';
      } else { point = l.exit; text = '沿南侧通道撤离'; detail = '人员已到齐，阵位已接住。'; }
    } else if (this.scenario === 'prologue') {
      phase = ['S01 · 检修门', 'S01 · 父子抱撤', 'S02 · 年轻周延', 'S02 · 主厅失守'][m.phase];
      if (m.phase === 0) { text = '走到父亲身边'; action = '抓紧父亲'; detail = '跟上父亲，走进检修门。'; }
      else if (m.phase === 1) { point = l.post; text = '跟父亲穿过检修门'; detail = '可环顾；Enter 跳过此段演出。'; }
      else if (m.phase === 2) { point = l.safe; text = `掩护撤离者离开主厅 · ${this.safeCount}/${this.workers.length}`; detail = '从掩体观察北侧来敌，守住南门通道。'; }
      else { point = l.exit; text = '撤离完成，主厅失守'; detail = '最后一人已经过去。Enter 继续。'; }
    } else {
      phase = ['S08 · 完整知情', 'S08 · 履行护送', 'S09 · 接受换班', 'S10 · 协作救援', 'S10 · 主动求援', 'S11 · 医疗接手'][m.phase];
      if (m.phase === 0) { text = '读取追击与护送情报'; action = '阅读终端'; detail = '邵原的路线与眼前人员的处境都要明确。'; }
      else if (m.phase === 1) { point = l.post; text = '带人员到接防区'; detail = '跟上人员，到接防区确认交接。'; if (this.safeCount === this.workers.length) action = '确认人员已到达'; }
      else if (m.phase === 2) { point = l.post; text = '等接防者到位，交出阵位'; detail = '接受护具、休息与家人的回信。'; if (distance(this.actors.find(a => a.id === 'zheng')!.position, l.post) < 1) action = '接受换班与保护'; }
      else if (m.phase === 3) { point = LAYOUT.handover.rescue; text = '穿过掩体，找到孟齐'; detail = '东边机动力量反扑。郑铎会与你协作。'; action = '与郑铎抬起孟齐'; }
      else if (m.phase === 4) { point = l.safe; text = '共同搬运孟齐到医疗点'; detail = '搬运中不能举枪或跳跃。'; }
      else { point = l.safe; text = '医护接手，继续救治'; detail = '医护正在接手。Enter 跳过此段演出。'; }
    }
    const interaction = action && distance(this.player.position, point) < 2.8 ? action : '';
    return { phase, text, detail, point, interaction };
  }

  dispose(): void { this.ballistics.clear(); this.physics.dispose(); }

  private get chapterObjective(): { phase: string; text: string; detail: string; point: Vec3; interaction: string } {
    const m = this.mission;
    let text = '', detail = '', action = '', point: Vec3;
    if (this.scenario === 'nightshift') {
      const points = [NIGHT.fan, NIGHT.fanReset, NIGHT.supplies, NIGHT.delivery, NIGHT.map, NIGHT.map, NIGHT.weapons, NIGHT.exit, NIGHT.exit];
      point = points[m.phase];
      [text, action, detail] = [
        ['清除风机堵塞', '取出堵塞物', '维修廊的进风口停了。'],
        ['复位风机', '合上复位开关', '风道清理完毕，面板在旁边。'],
        ['领取保温物资', '搬起物资箱', '许岚在护理后勤等这箱保温毯。'],
        ['把物资送到交接台', '放下物资箱', '双手搬运，沿廊道往护理站走。'],
        ['到旧样本室查看港图', '查看港图', '孟齐和周延在集合点。'],
        ['确认接应与换班分工', '', '可环顾。Enter 跳过短对话。'],
        ['领取并核对装备', '领取装备', '从港图旁的武器架取装备。'],
        ['前往出发点', '', '共享情报，护送到站后接防。'],
        ['准备出发', '', ''],
      ][m.phase];
    } else {
      const points = [WORKERS.observation, WORKERS.checkpoint, WORKERS.lower, WORKERS.overlook, WORKERS.yardGate, WORKERS.release, WORKERS.safe, WORKERS.post];
      point = points[m.phase];
      [text, action, detail] = [
        ['观察押运车辆并报告', this.lookingAtConvoy() ? '报告押运异常' : '', '在街角看向右前方：军用车旁是港务工服。'],
        ['清出检查口，接通闸门', this.exposedThreat(point, 19) ? '' : '打开检查闸', '从街角掩体向入口推进。'],
        ['接通西侧下层检修线', this.exposedThreat(point, 14) ? '' : '复位检修电源', '留意上层火力。楼梯从下层北端开始。'],
        ['登上检修栈道，确认后门', Math.abs(this.player.position[1] - point[1]) < 0.5 && !this.exposedThreat(point, 18) ? '报告后门位置' : '', '从宽台阶上去；清掉同层威胁后观察院落。'],
        ['从北端台阶下行，开启后门', '开启后门', '出口就在生活院南侧。'],
        ['掩护院内人员集合', this.exposedThreat(point, 30) ? '' : '通知人员撤离', '清掉集合点近处的火力。'],
        ['掩护港务人员到转运位', '', '压住东北入口，人员会沿西侧掩体绕行。'],
        ['与孟齐确认人员交接', distance(this.actors.find(actor => actor.id === 'meng')!.position, WORKERS.post) < 1 ? '确认转运与家属护送' : '', '等孟齐接上转运位，再确认罗敬的家属需求。'],
      ][m.phase];
      if (m.phase === 6) {
        const pending = this.workers.filter(actor => !actor.safe);
        const blocked = pending.find(actor => this.workerThreatened(actor));
        const follow = blocked ?? pending[0];
        if (follow) {
          point = [...follow.position];
          detail = blocked ? `${blocked.name} 被压住了。沿标记接近，清理人员身边的火力。` : '跟随尚未到站的人员，留意运输通道的侧翼。';
        } else detail = '人员已经到站；清掉转运位附近仍能开火的敌人。';
      }
    }
    return { phase: this.scenario === 'nightshift' ? 'S03 · 夜班与出发' : `S04 · ${m.phase < 2 ? '通勤检查口' : m.phase < 4 ? '检修栈道' : '生活院与转运'}`,
      text, detail, point, interaction: action && distance(this.player.position, point) < 2.8 ? action : '' };
  }
}

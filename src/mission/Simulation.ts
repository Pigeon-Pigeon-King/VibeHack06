import type { CharacterRole, ControlMode, ScenarioId, SolidSpec, Vec3 } from '../contracts';
import { LAYOUT } from '../content/layout';
import { Physics, FIXED_DT } from '../runtime/Physics';
import { Random } from '../runtime/random';
import { Ballistics } from '../combat/Ballistics';
import { Navigation } from '../actors/Navigation';
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
  readonly navigation: Navigation;
  readonly ballistics: Ballistics;
  readonly random = new Random();
  actors: Actor[] = [];
  player: Player;
  mission: Mission;
  checkpoint!: Snapshot;
  events: GameEvent[] = [];
  hits = 0; kills = 0; hitFlash = 0; hurtFlash = 0;
  private checkpointPending = false;

  constructor(readonly scenario: ScenarioId, readonly solids: SolidSpec[], saved?: Snapshot) {
    this.physics = new Physics(solids);
    this.navigation = new Navigation(solids);
    this.ballistics = new Ballistics((a, b, except) => this.physics.trace(a, b, except));
    const layout = LAYOUT[scenario];
    this.player = { position: [...layout.spawn], yaw: layout.yaw, pitch: 0, health: 100,
      ammo: 25, reserve: 150, height: scenario === 'prologue' ? 1.1 : 1.8, crouched: false,
      reload: 0, cooldown: 0, hurtAt: -10, walk: 0, recoil: 0, ads: false,
      name: scenario === 'prologue' ? '陆闻川 · 九岁' : '陆闻川' };
    this.mission = { scenario, phase: 0, elapsed: 0, phaseTime: 0, control: scenario === 'prologue' ? 'work' : 'combat',
      facts: [], complete: false, failed: false, checkpointLabel: '进入区域',
      subtitle: '', speaker: '', subtitleUntil: 0, spawned: 0, nextSpawn: 12 };
    if (saved) {
      this.player = clone(saved.player); this.mission = clone(saved.mission); this.actors = clone(saved.actors);
      this.random.state = saved.random; this.hits = saved.hits; this.kills = saved.kills;
      this.checkpoint = clone(saved);
    } else this.populate();
    this.physics.add('player', this.player.position, this.player.height);
    for (const actor of this.actors) if (!actor.down) this.physics.add(actor.id, actor.position, actor.role === 'child' ? 1.1 : 1.8);
    this.physics.step();
    if (!saved) this.saveCheckpoint('进入区域');
    this.events = [];
  }

  private populate(): void {
    const l = LAYOUT[this.scenario];
    l.workerSpawns.forEach((p, i) => this.createActor(`worker-${i}`, this.scenario === 'prologue' ? `撤离者 ${i + 1}` : `港务员 ${i + 1}`, 'worker', p));
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

  private createActor(id: string, name: string, role: CharacterRole, position: Vec3): Actor {
    const actor: Actor = { id, name, role, position: [...position], health: role === 'enemy' ? 68 : 100,
      yaw: role === 'enemy' ? Math.PI : 0, goals: [], path: [], walk: 0,
      aiming: false, aimTime: 0, cooldown: this.random.between(0.7, 1.4), safe: false, released: false, down: false };
    this.actors.push(actor);
    return actor;
  }
  private spawnEnemy(addBody = true, east = false): void {
    const l = LAYOUT[this.scenario];
    const index = east && this.scenario === 'northgate' ? 3 : this.mission.spawned % Math.min(3, l.enemySpawns.length);
    const position = [...l.enemySpawns[index]] as Vec3;
    position[0] += this.random.between(-1, 1);
    const actor = this.createActor(`enemy-${this.mission.spawned}`, '敌方步枪兵', 'enemy', position);
    this.mission.spawned++;
    actor.goals = [east ? [14, 0, -2] : [this.random.between(-9, 9), 0, this.random.between(-15, -9)]];
    if (addBody) this.physics.add(actor.id, actor.position);
  }
  private route(actor: Actor, goals: Vec3[]): void { actor.goals = clone(goals); actor.path = []; actor.released = true; }
  private fact(id: string): void { if (!this.mission.facts.includes(id)) this.mission.facts.push(id); }
  private has(id: string): boolean { return this.mission.facts.includes(id); }
  private say(speaker: string, subtitle: string, seconds = 7): void {
    Object.assign(this.mission, { speaker, subtitle, subtitleUntil: this.mission.elapsed + seconds });
  }
  private phase(phase: number, subtitle: string, control: ControlMode = 'combat', speaker = this.player.name): void {
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
    const isChild = this.scenario === 'prologue' && m.phase < 2;
    const desiredHeight = isChild ? 1.1 : (intent.crouch ? 1.2 : 1.8);
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
      if (hit.id === 'player' && projectile.owner !== 'player') {
        p.health = Math.max(0, p.health - projectile.damage); p.hurtAt = m.elapsed; this.hurtFlash = 1;
        this.events.push({ type: 'hurt' });
      } else {
        const actor = this.actors.find(a => a.id === hit.id && !a.down);
        if (actor?.role === 'enemy' && projectile.owner === 'player') {
          actor.health -= projectile.damage; this.hits++; this.hitFlash = 1; this.events.push({ type: 'hit' });
          if (actor.health <= 0) { actor.down = true; actor.aiming = false; this.physics.remove(actor.id); this.kills++; }
        } else if (actor && actor.role !== 'enemy' && projectile.owner === 'player') {
          this.say('郑铎', '停火，自己人！', 2);
        }
      }
    }
    if (p.health <= 0 || p.position[1] < -4) {
      m.failed = true; this.say('', '战斗中失去行动能力。可从最近检查点重试。'); return;
    }
    if (m.elapsed - p.hurtAt > 6) p.health = Math.min(100, p.health + dt * 7);
    this.updateMission(intent, dt);
    if (this.checkpointPending) { this.checkpointPending = false; this.saveCheckpoint(this.objective.phase); }
  }

  private updateActors(dt: number): void {
    const m = this.mission;
    const closest = this.aliveEnemies.slice().sort((a, b) => distance(a.position, this.player.position) - distance(b.position, this.player.position)).slice(0, 2);
    for (const a of this.actors) {
      if (a.down || !this.physics.bodies.has(a.id)) continue;
      let speed = a.role === 'enemy' ? 1.5 : 2.1;
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
      if (a.role === 'worker' && a.released && !a.safe && this.aliveEnemies.some(enemy => distance(a.position, enemy.position) < 8 && !this.physics.trace(eye(a.position), eye(enemy.position), a.id, true))) speed = 0;
      let vx = 0, vz = 0;
      if (a.goals.length && speed) {
        const goal = a.goals[0];
        if (distance(a.position, goal) < 0.85) { a.goals.shift(); a.path = []; }
        else {
          if (!a.path.length) a.path = this.navigation.path(a.position, goal);
          while (a.path.length && distance(a.position, a.path[0]) < 0.35) a.path.shift();
          const next = a.path[0];
          if (next) {
            const dx = next[0] - a.position[0], dz = next[2] - a.position[2], len = Math.hypot(dx, dz);
            vx = dx / len * speed; vz = dz / len * speed;
            a.yaw = Math.atan2(vx, vz); a.walk += dt * speed * 4;
          }
        }
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
    if (this.scenario === 'northgate') {
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

  private finish(text: string): void { this.mission.complete = true; this.ballistics.clear(); this.say('', text, 100); this.events.push({ type: 'objective' }); }

  get objective(): { phase: string; text: string; detail: string; point: Vec3; interaction: string } {
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
}

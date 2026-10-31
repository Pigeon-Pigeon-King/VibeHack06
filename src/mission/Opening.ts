import type { Vec3 } from '../contracts';
import { HISTORY as H } from '../content/history-layout';
import { OPENING_TIMELINE, openingCrowdHitTime, openingHallTime } from '../content/opening-timeline';
import { openingCrowdPlan } from '../content/OpeningCrowd';
import { OPENING_JAM_VERSION, openingHallGaze, openingShaoPosition } from '../content/OpeningStaging';
import type { Intent } from '../player/Input';
import { distance, type Actor, type Simulation } from './Simulation';

/** Fixed scenes share the same author-owned terminal state on playback and skip. */
function actor(s: Simulation, id: string): Actor { return s.actors.find(a => a.id === id)!; }
function mix(a: Vec3, b: Vec3, t: number): Vec3 {
  const u = Math.max(0, Math.min(1, t)); return a.map((v, i) => v + (b[i] - v) * u) as Vec3;
}
function mixYaw(a: number, b: number, t: number): number {
  return a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * Math.max(0, Math.min(1, t));
}
function along(points: Vec3[], t: number): Vec3 {
  const lengths = points.slice(1).map((p, i) => Math.hypot(...p.map((v, j) => v - points[i][j])));
  let remaining = Math.max(0, Math.min(1, t)) * lengths.reduce((a, b) => a + b, 0);
  for (let i = 0; i < lengths.length; i++) {
    if (remaining <= lengths[i]) return mix(points[i], points[i + 1], remaining / Math.max(0.01, lengths[i]));
    remaining -= lengths[i];
  }
  return [...points[points.length - 1]];
}
function pose(s: Simulation, id: string, point: Vec3, yaw = 0, down = false): Actor {
  const a = actor(s, id); a.position = [...point]; a.yaw = yaw; a.goals = []; a.path = [];
  // Restoring an older tableau must never stand an already fallen person back up.
  a.down = down || a.down; a.aiming = false; a.walk = 0; a.health = a.down ? 0 : a.health;
  if (a.combat && s.physics.bodies.has(id) && !a.down) s.physics.setHeight(id, 1.8);
  delete a.combat;
  if (s.physics.bodies.has(id)) { s.physics.teleport(id, point); if (a.down) s.physics.remove(id); }
  return a;
}
function playerAt(s: Simulation, point: Vec3): void {
  s.physics.teleport('player', point); s.player.position = [...point];
}
function viewAt(s: Simulation, point: Vec3, limit = 0.95): void {
  const center = Math.atan2(s.player.position[0] - point[0], s.player.position[2] - point[2]);
  const delta = Math.atan2(Math.sin(s.player.yaw - center), Math.cos(s.player.yaw - center));
  s.player.yaw = center + Math.max(-limit, Math.min(limit, delta));
  s.player.pitch = Math.max(-0.65, Math.min(0.7, s.player.pitch));
}
function sayOnce(s: Simulation, mark: string, who: string, text: string, seconds = 6): void {
  if (s.has(mark)) return; s.fact(mark); s.say(who, text, seconds);
}
const ESCAPE = [H.womanStart, H.stairsStart, H.stairsEnd, H.womanEnd];
const C = OPENING_TIMELINE.childhood, T = OPENING_TIMELINE.mainhall;
const DENSE_CROWD = 'history-dense-crowd-v1';
const ENEMY_STAGING = 'history-enemy-staging-v1';
const crowdReady = new WeakSet<Simulation>();
const crowdPlan = (s: Simulation) => openingCrowdPlan(s.solids);
const DEFENDERS: Vec3[] = [H.rifle, [9, 0, -5]];
// The east/public and north entrances are separate from the west evacuation
// door. All combat anchors remain beyond the hall wall until the authored breach.
const ENEMY_POSTS: Vec3[] = [...H.enemyEntries, [32, 0, -3.5], [32, 0, 3], [14, 0, -26], [19, 0, -26]];
const ENEMY_LEASH = 0.9;
const SHAO_ENTRY: Vec3 = [32.8, 0, -4];
const INVADER_STARTS: Vec3[] = [[31.2, 0, -2], [31.2, 0, 2.8]];
// The first invader denies Zhao's rifle at gunpoint from inside the entrance.
// Reaching Zhao's side from outside in breach→capture would require a 24m/s dash.
const INVADER_ENDS: Vec3[] = [[24.5, 0, -1.5], [14, 0, 11]];
const DEPARTURE_FACTS = ['history-defense-active', 'history-evacuation-underway', 'history-defender-0-down',
  'history-defender-1-down', 'history-heavy-losses', 'child-handed-over', 'father-rifle-collected',
  'father-charged-defense', 'father-cover-shot', 'child-evacuated', 'child-out-of-sight', 'history-partition-closed'];
const CHILD_FACTS = [...DEPARTURE_FACTS, 'history-defense-shot', 'childhood-pickup-line', 'childhood-losses-line', 'childhood-evacuator-line'];
const HALL_FACTS = [...DEPARTURE_FACTS, 'civilians-evacuated', 'history-bombardment', 'history-collapse', 'zhou-pinned',
  'history-enemy-breach', 'zhao-reaches-rifle', 'history-crowd-attacked', 'history-crowd-massacred',
  'zhao-captured', 'shao-identified-by-zhou', 'zhao-defiant-shout', 'zhao-executed', 'zhou-unconscious',
  'father-died', 'zhou-survived-hall', 'hall-bombardment-line', 'hall-collapse-line', 'hall-crowd-line',
  'hall-zhao-plea', 'hall-recognition', 'hall-shao-line', ...H.crowd.map((_, i) => `history-crowd-victim-${i}`)];

const isHallEnemy = (a: Actor) => a.role === 'enemy' && a.id.startsWith('enemy-E00-');

/** Only the playable adult defense uses AI. The child and later atrocity stay authored. */
export function openingEnemyCombatLeash(s: Simulation, a: Actor): number | undefined {
  return s.scenario === 'mainhall' && s.mission.phase <= 3 && isHallEnemy(a) ? ENEMY_LEASH : undefined;
}

function availableEnemyPosts(s: Simulation, count: number): Vec3[] {
  const selected: Vec3[] = [];
  for (const point of ENEMY_POSTS) {
    if (s.aliveEnemies.some(a => distance(a.position, point) < 2.4)
      || selected.some(other => distance(other, point) < 2.4)) continue;
    selected.push(point);
    if (selected.length === count) break;
  }
  return selected;
}

/** Run after restored actor bodies are built, before the first physics/AI step. */
export function restoreOpeningEnemies(s: Simulation): void {
  if (s.scenario !== 'mainhall') return;
  // Build before the first rendered frame, not on the phase-4 transition.
  crowdPlan(s);
  if (s.has(ENEMY_STAGING)) return;
  s.fact(ENEMY_STAGING);
  const beforeBreach = s.mission.phase < 4 || s.mission.phase === 4
    && openingHallTime(s.mission.phaseTime, s.mission.facts) < T.breach;
  let post = 0;
  for (const a of s.actors) {
    if (!isHallEnemy(a) || a.down) continue;
    // Only the incompatible old ingress is migrated. Current snapshots retain
    // their tactical target, cooldown, body, and exact in-progress local move.
    a.goals = []; a.path = []; a.aiming = false; a.aimTime = 0; a.walk = 0;
    delete a.combat;
    if (beforeBreach) {
      const point = ENEMY_POSTS[post++ % ENEMY_POSTS.length];
      a.position = [...point];
      a.yaw = Math.atan2(H.defenseA[0] - point[0], H.defenseA[2] - point[2]);
      if (s.physics.bodies.has(a.id)) s.physics.teleport(a.id, point);
    }
    if (s.physics.bodies.has(a.id)) s.physics.setHeight(a.id, 1.8);
  }
  // The old entry checkpoint has not spawned a wave yet. Put it outside now,
  // without spawning a duplicate wave after the player opens the west door.
  if (s.mission.phase === 0 && s.mission.spawned === 0) {
    s.spawnChapterGroup('E00', H.enemyEntries);
    for (const a of s.aliveEnemies) a.yaw = Math.atan2(H.defenseA[0] - a.position[0], H.defenseA[2] - a.position[2]);
  }
  if (s.mission.phase === 4 && beforeBreach) {
    const positions: Array<[string, Vec3]> = [['shao', SHAO_ENTRY], ...INVADER_STARTS.map((p, i) => [`hall-invader-${i}`, p] as [string, Vec3])];
    for (const [id, point] of positions) if (s.actors.some(a => a.id === id)) pose(s, id, point, -Math.PI / 2);
  }
}

function childBeside(woman: Vec3): Vec3 {
  const x = woman[0] + 0.9;
  // The child walks behind the adult; their feet use their own point on the stairs.
  const y = Math.max(-2.4, Math.min(0, (x - H.stairsStart[0]) * 0.3));
  return [x, y, woman[2] + 1];
}
function evacuationRoute(index: number): Vec3[] {
  const start = H.evacCrowd[index], [doorZ, stairZ, lowerZ] = H.evacCrowdPassage[index];
  const doorway: Vec3[] = start[0] > H.gateX ? [[Math.min(-21, start[0]), 0, doorZ], [-23, 0, doorZ]] : [];
  return [start, ...doorway, [H.stairsStart[0], 0, stairZ], [H.stairsEnd[0], -2.4, lowerZ],
    [H.partitionX - 2, -2.4, lowerZ], H.evacCrowdSafe[index]];
}
function evacuationFacing(index: number, route: Vec3[], progress: number, time: number): number {
  if (progress <= 0) return H.evacCrowdFacing[index];
  if (progress >= 1) return H.evacCrowdSafeFacing[index];
  // A short look-ahead rounds the route's corners. Both turns are time-based,
  // so restoring a checkpoint cannot restart a turn or choose a new direction.
  const before = along(route, progress - 0.015), after = along(route, progress + 0.015);
  const heading = Math.atan2(after[0] - before[0], after[2] - before[2]);
  const start = C.evacuation + H.evacCrowdDelay[index], end = C.sightLost - H.evacCrowdArrivalLead[index];
  const moving = mixYaw(H.evacCrowdFacing[index], heading, (time - start) / 0.45);
  return mixYaw(moving, H.evacCrowdSafeFacing[index], (time - end + 0.55) / 0.55);
}
function settleEvacuationCrowd(s: Simulation): void {
  H.evacCrowdSafe.forEach((point, i) => {
    const a = pose(s, `evac-crowd-${i}`, point, H.evacCrowdSafeFacing[i]);
    a.safe = !a.down; a.released = true;
  });
}
/** Upgrade active sparse-crowd checkpoints once, without replaying already elapsed shots. */
function ensureCrowds(s: Simulation, addBodies = true): void {
  if (crowdReady.has(s)) return;
  const ids = new Set(s.actors.map(a => a.id));
  const legacy = !s.has(DENSE_CROWD) || H.crowd.some((_, i) => !ids.has(`late-civilian-${i}`));
  const inHallPerformance = s.scenario === 'mainhall' && s.mission.phase >= 4;
  const t = inHallPerformance ? openingHallTime(s.mission.phaseTime, s.mission.facts) : 0;
  const familyGone = s.scenario === 'mainhall' && s.mission.phase === 3 && s.safeCount === H.civilians.length
    && ['evacuator', 'daughter', 'young-lu'].every(id => {
      const a = actor(s, id); return a && !a.goals.length && a.position[0] < H.partitionX - 1 && a.position[1] < -1.8;
    });
  const evacuated = inHallPerformance || familyGone || s.scenario === 'childhood'
    && (s.mission.phase >= 4 || s.mission.phase === 3 && s.mission.phaseTime >= C.sightLost);
  H.crowd.forEach((point, i) => {
    const id = `late-civilian-${i}`, mark = `history-crowd-victim-${i}`;
    const alreadyStruck = s.has(mark) || inHallPerformance && t >= openingCrowdHitTime(i, H.crowd.length);
    if (!ids.has(id)) {
      const motion = inHallPerformance ? crowdPlan(s).sample(i, t) : undefined;
      const a = s.createActor(id, '主厅居民', 'civilian', motion?.position ?? point);
      a.yaw = motion?.yaw ?? H.crowdFacing[i];
      a.down = alreadyStruck; if (a.down) a.health = 0;
      if (addBodies && !a.down) s.physics.add(id, a.position);
    }
    // Old cadavers keep both their position and state; future cues must not shoot them again.
    if (actor(s, id).down || inHallPerformance && legacy && alreadyStruck) s.fact(mark);
  });
  H.evacCrowd.forEach((point, i) => {
    const id = `evac-crowd-${i}`;
    if (ids.has(id)) return;
    const a = s.createActor(id, '随人流撤离的居民', 'civilian', evacuated ? H.evacCrowdSafe[i] : point);
    a.yaw = evacuated ? H.evacCrowdSafeFacing[i] : H.evacCrowdFacing[i];
    a.safe = evacuated; a.released = evacuated;
    if (addBodies) s.physics.add(id, a.position);
  });
  if (evacuated) settleEvacuationCrowd(s);
  if (inHallPerformance) s.fact(DENSE_CROWD);
  crowdReady.add(s);
}
function playChildhoodCrowd(s: Simulation, t: number): void {
  H.evacCrowd.forEach((_, i) => {
    const start = C.evacuation + H.evacCrowdDelay[i], end = C.sightLost - H.evacCrowdArrivalLead[i];
    const progress = (t - start) / (end - start), route = evacuationRoute(i);
    const point = along(route, progress);
    // The irregular flow fans around a ground-level camera at the doorway,
    // rather than putting a torso through the eye position.
    const dx = point[0] - s.player.position[0], dz = point[2] - s.player.position[2];
    const gap = Math.hypot(dx, dz);
    if (gap < 0.92) point[2] = s.player.position[2] + (dz >= 0 ? 1 : -1) * Math.sqrt(0.92 ** 2 - dx ** 2);
    const a = pose(s, `evac-crowd-${i}`, point, evacuationFacing(i, route, progress, t));
    a.walk = progress > 0 && progress < 1 ? t * (4.6 + i % 5 * 0.17) + i * 1.73 : 0;
    a.released = progress >= 0; a.safe = progress >= 1 && !a.down;
  });
}

function ensureDefenders(s: Simulation, addBodies = true): void {
  DEFENDERS.forEach((position, i) => {
    const id = `hall-defender-${i}`;
    if (s.actors.some(a => a.id === id)) return;
    const a = s.createActor(id, '驻守士兵', 'ally', position);
    if (addBodies) s.physics.add(id, a.position);
  });
}
function defenderFalls(s: Simulation, index: number): void {
  const a = actor(s, `hall-defender-${index}`);
  s.fact(`history-defender-${index}-down`); pose(s, a.id, a.position, a.yaw, true);
  if (index === 1) s.fact('history-heavy-losses');
}
function stagedShot(s: Simulation, mark: string, a: Actor, target: Vec3, enemy = false, emit = true): void {
  if (s.has(mark)) return;
  s.fact(mark);
  if (!emit) return;
  const from: Vec3 = [a.position[0], a.position[1] + 1.38, a.position[2]];
  s.events.push({ type: 'shot', position: from, enemy });
  // Authored crossfire has visible flight and collisions, but cannot hurt the child or undo the evacuation.
  s.ballistics.fire(a.id, from, [target[0] - from[0], target[1] + 1.1 - from[1], target[2] - from[2]], 0, 360);
}

export function populateOpening(s: Simulation): void {
  const child = s.scenario === 'childhood';
  s.createActor('father', '陆建平', 'father', child ? H.fatherStart : H.gateOutside);
  s.createActor('evacuator', '带孩子撤离的女人', 'civilian', H.womanStart);
  s.createActor('daughter', '女孩', 'child', H.daughterStart);
  s.createActor('zhao', '赵启明', 'ally', H.zhaoStart);
  ensureDefenders(s, false);
  if (child) {
    s.createActor('young-zhou', '年轻的驻军士兵', 'ally', H.gatePanel);
    H.civilians.forEach((p, i) => s.createActor(`civilian-${i}`, '等候的居民', 'civilian', p));
    s.say('父亲', '勺子又没带？先用盒盖。糖留着，等妈妈从医院回来。');
  } else {
    s.createActor('young-lu', '男孩', 'child', H.fatherStart);
    H.civilians.forEach((p, i) => s.createActor(`worker-${i}`, `撤离居民 ${i + 1}`, 'worker', p));
    H.enemyEntries.forEach(point => {
      const a = s.createActor(`enemy-E00-${s.mission.spawned++}`, '敌方步枪兵', 'enemy', point);
      a.yaw = Math.atan2(H.defenseA[0] - point[0], H.defenseA[2] - point[2]);
    });
    s.fact(ENEMY_STAGING);
    s.say('赵启明', '西边由你处理。你看着办，开了以后带他们到下一道隔断。正门我在。', 10);
  }
  ensureCrowds(s, false);
}

function finishChildhood(s: Simulation): void {
  CHILD_FACTS.forEach(f => s.fact(f)); s.fact(DENSE_CROWD);
  defenderFalls(s, 0); defenderFalls(s, 1);
  pose(s, 'father', H.fatherFall, Math.PI / 2).aiming = true;
  pose(s, 'evacuator', H.womanEnd, -Math.PI / 2).safe = true;
  pose(s, 'daughter', H.childSafe, -Math.PI / 2).safe = true;
  H.civilians.forEach((_, i) => {
    if (s.actors.some(a => a.id === `civilian-${i}`)) {
      const a = pose(s, `civilian-${i}`, H.civilianSafe[i], H.civilianSafeFacing[i]); a.safe = true; a.released = true;
    }
  });
  settleEvacuationCrowd(s);
  playerAt(s, childBeside(H.womanEnd));
  s.player.yaw = Math.PI / 2; s.player.pitch = 0;
  s.phase(4, '', 'staged'); s.finish('闻川被带过西侧隔断。父亲冲向防线，消失在他看不见的地方。');
}

function playChildhood(s: Simulation, input: Intent): void {
  const t = s.mission.phaseTime;
  s.fact('history-defense-active'); s.fact(DENSE_CROWD);
  DEFENDERS.forEach((_, i) => { const a = actor(s, `hall-defender-${i}`); if (!a.down) { a.aiming = true; a.yaw = Math.PI / 2; } });
  if (t >= 0.6) stagedShot(s, 'history-defense-shot', actor(s, 'hall-defender-1'), H.enemyEntries[0]);
  if (t >= C.evacuation && !s.has('history-evacuation-underway')) {
    s.fact('history-evacuation-underway');
    H.civilians.forEach((_, i) => { const a = s.actors.find(a => a.id === `civilian-${i}`); if (a) s.route(a, [...H.civilianVia, H.civilianSafe[i]]); });
  }
  if (t >= C.firstCasualty) defenderFalls(s, 0);
  if (t >= C.heavyLosses) {
    defenderFalls(s, 1);
    sayOnce(s, 'childhood-losses-line', '赵启明', '正门快顶不住了！带孩子走！', 3);
  }
  const fatherPoint = t < C.charge ? mix(H.gateOutside, H.rifle, (t - C.heavyLosses) / (C.rifle - C.heavyLosses))
    : mix(H.rifle, H.fatherFall, (t - C.charge) / 2);
  const father = pose(s, 'father', fatherPoint, Math.PI / 2);
  father.walk = t >= C.heavyLosses && t < C.charge + 2 ? t * 5 : 0;
  father.aiming = t >= C.charge + 2;
  const progress = (t - C.departure) / (C.sightLost - C.departure);
  const woman = pose(s, 'evacuator', along(ESCAPE, progress), -Math.PI / 2);
  woman.walk = progress > 0 && progress < 1 ? t * 5 : 0;
  pose(s, 'daughter', along([H.daughterStart, H.stairsStart, H.stairsEnd, H.childSafe], progress), -Math.PI / 2).walk = woman.walk;
  playerAt(s, childBeside(woman.position));
  playChildhoodCrowd(s, t);
  if (t >= C.rifle) {
    s.fact('father-rifle-collected');
    sayOnce(s, 'childhood-pickup-line', '父亲', '闻川，跟着她。别停。', 3);
  }
  if (t >= C.departure) { s.fact('child-handed-over'); sayOnce(s, 'childhood-evacuator-line', '女人', '跟紧我，顺着人群走。', 4); }
  if (t >= C.charge) s.fact('father-charged-defense');
  if (t >= C.charge + 2) {
    stagedShot(s, 'father-cover-shot', father, H.enemyEntries[1]);
  }
  if (t >= C.sightLost && s.player.position[0] < H.partitionX - 1) {
    s.fact('child-evacuated'); s.fact('child-out-of-sight'); s.fact('history-partition-closed');
    // The shutter has cut off the hall; the child can only look into the evacuation corridor now.
    viewAt(s, H.childSafe, 0.8);
  }
  if (t >= C.finish || input.skip) finishChildhood(s);
}

function releaseResidents(s: Simulation, first: number, end: number): void {
  s.workers.slice(first, end).forEach((a, i) => {
    // Already released or saved residents retain their old goals/arrival state.
    if (!a.released && !a.safe) s.route(a, [...H.civilianVia, H.civilianSafe[first + i]]);
  });
}

/** Departure is the residents' response to a protected route, not a player confirmation. */
function residentRouteClear(s: Simulation, first: number, end: number): boolean {
  if (!s.has('history-gate-open')) return false;
  const route = [H.gateOutside, H.gateInside, H.stairsStart, H.stairsEnd];
  return route.every(p => !s.exposedThreat(p, 18))
    && s.workers.slice(first, end).every(a => !s.exposedThreat(a.position, 18));
}
function ensureInvaders(s: Simulation): void {
  if (!s.actors.some(a => a.id === 'shao')) {
    const shao = s.createActor('shao', '邵原', 'opponent', SHAO_ENTRY); s.physics.add(shao.id, shao.position);
  }
  INVADER_STARTS.forEach((position, i) => {
    const id = `hall-invader-${i}`;
    if (s.actors.some(a => a.id === id)) return;
    const a = s.createActor(id, '冲入主厅的敌兵', 'opponent', position); s.physics.add(id, a.position);
  });
}
function beginHallCollapse(s: Simulation): void {
  s.fact('civilians-evacuated'); s.fact('history-timeline-v2'); s.fact(DENSE_CROWD);
  s.fact(OPENING_JAM_VERSION);
  DEPARTURE_FACTS.forEach(f => s.fact(f));
  s.ballistics.clear();
  for (const a of s.actors) {
    a.goals = []; a.path = []; a.aiming = false; a.aimTime = 0;
    if (a.combat && s.physics.bodies.has(a.id)) s.physics.setHeight(a.id, 1.8);
    delete a.combat;
  }
  settleEvacuationCrowd(s);
  ensureInvaders(s);
  s.physics.setHeight('player', 1.8); s.player.height = 1.8; s.player.crouched = false;
  playerAt(s, H.rubblePlayer);
  Object.assign(s.player, openingHallGaze(0));
  s.phase(4, '最后一批过去了。闻川也在隔断后面，正门的人往柱后收！', 'staged', '赵启明');
}
function hallTableau(s: Simulation, t: number): void {
  defenderFalls(s, 0); defenderFalls(s, 1);
  const previousZhao = actor(s, 'zhao');
  const zhao = pose(s, 'zhao', previousZhao.down ? previousZhao.position
    : mix(H.zhaoStart, H.zhaoCaptured, (t - T.bombardment) / (T.weaponReach - T.bombardment)), previousZhao.down ? previousZhao.yaw : Math.PI / 2,
    t >= T.execution || s.has('zhao-executed'));
  zhao.walk = !zhao.down && t >= T.bombardment && t < T.weaponReach ? (t - T.bombardment) * distance(H.zhaoStart, H.zhaoCaptured) / (T.weaponReach - T.bombardment) * 4 : 0;
  const shao = pose(s, 'shao', openingShaoPosition(t), -Math.PI / 2);
  shao.aiming = t >= T.execution - 1 && t < T.unconscious;
  if (shao.aiming) shao.yaw = Math.atan2(H.zhaoCaptured[0] - shao.position[0], H.zhaoCaptured[2] - shao.position[2]);
  shao.walk = t > T.breach && t < T.breach + 8.5 ? (t - T.breach) * 4 * distance(SHAO_ENTRY, openingShaoPosition(T.finish)) / 8.5 : 0;
  INVADER_STARTS.forEach((position, i) => {
    const duration = i === 0 ? T.capture - T.breach : 4.1;
    // The crowd gunner skirts the actual east bench before turning into the
    // aisle. The old straight chord intersected its seat/back after capture.
    const route = i === 0 ? [position, INVADER_ENDS[i]] : [position, [19, 0, 6.1] as Vec3, INVADER_ENDS[i]];
    const progress = (t - T.breach) / duration, point = along(route, progress);
    const heading = along(route, progress + 0.01), behind = along(route, progress - 0.01);
    const a = pose(s, `hall-invader-${i}`, point, Math.atan2(heading[0] - behind[0], heading[2] - behind[2]));
    const routeLength = route.slice(1).reduce((total, point, index) => total + distance(point, route[index]), 0);
    a.walk = t > T.breach && t < T.breach + duration ? (t - T.breach) * routeLength / duration * 4 : 0;
    a.aiming = i === 0 ? t >= T.capture && t < T.unconscious : t >= T.crowdAttack && t <= T.massacreEnd;
    if (a.aiming) {
      const victim = Math.max(0, Math.min(H.crowd.length - 1,
        Math.ceil((t - T.crowdAttack) / (T.massacreEnd - T.crowdAttack) * (H.crowd.length - 1))));
      const target = i === 0 ? H.zhaoCaptured : crowdPlan(s).sample(victim, t).position;
      a.yaw = Math.atan2(target[0] - a.position[0], target[2] - a.position[2]);
    }
  });
  pose(s, 'father', H.fatherFall, Math.PI / 2, s.has('father-died')).aiming = !s.has('father-died') && t < T.bombardment;
  pose(s, 'evacuator', H.womanEnd, -Math.PI / 2).safe = true;
  pose(s, 'daughter', H.childSafe, -Math.PI / 2).safe = true;
  pose(s, 'young-lu', childBeside(H.womanEnd), -Math.PI / 2).safe = true;
  settleEvacuationCrowd(s);
  H.crowd.forEach((_, i) => {
    const a = actor(s, `late-civilian-${i}`), hit = openingCrowdHitTime(i, H.crowd.length);
    // Exact hit-time sampling makes normal playback and skip share positions.
    // Existing corpses retain their saved position, including pre-jam saves.
    const motion = crowdPlan(s).sample(i, t);
    pose(s, a.id, a.down ? a.position : motion.position, a.down ? a.yaw : motion.yaw, t >= hit || s.has(`history-crowd-victim-${i}`));
    if (!a.down && motion.speed > 0.03) a.walk = motion.distance * 4;
  });
  if (t >= T.collapse || s.has('history-collapse')) {
    s.physics.setHeight('player', 0.65); s.player.height = 0.65; s.player.crouched = true;
    s.player.health = 42; s.player.hurtAt = s.mission.elapsed;
  }
  playerAt(s, H.rubblePlayer);
  Object.assign(s.player, openingHallGaze(t));
}
function finishHall(s: Simulation): void {
  HALL_FACTS.forEach(f => s.fact(f)); hallTableau(s, T.finish);
  Object.assign(s.player, openingHallGaze(T.finish));
  s.phase(5, '', 'staged'); s.finish('六名居民已经越过隔断。赵启明怒吼后被击杀，周延在瓦砾下失去意识。');
}
function playHall(s: Simulation, input: Intent): void {
  ensureInvaders(s);
  // An old live prisoner can use the new fall. Already executed old saves keep
  // their terminal body pose instead of replaying the impact on the next frame.
  if (!actor(s, 'zhao').down && !s.has('zhao-executed')) s.fact(OPENING_JAM_VERSION);
  const rawTime = s.mission.phaseTime, t = openingHallTime(rawTime, s.mission.facts);
  // A legacy snapshot already contains the collapse/capture. Catch up facts silently, without replaying its effects.
  const legacyCatchUp = !s.has('history-timeline-v2') && !s.has('history-bombardment');
  const emit = !legacyCatchUp && t <= rawTime + 0.0001;
  s.mission.phaseTime = t; s.mission.elapsed = Math.max(s.mission.elapsed, t);
  const line = (mark: string, who: string, text: string, seconds = 3) => {
    if (emit) sayOnce(s, mark, who, text, seconds); else s.fact(mark);
  };
  if (input.skip) { finishHall(s); return; }
  if (t >= T.bombardment) {
    s.fact('history-bombardment'); line('hall-bombardment-line', '赵启明', '趴下！离开吊顶下面！');
  }
  if (t >= T.collapse) {
    s.fact('history-collapse'); s.fact('zhou-pinned');
    line('hall-collapse-line', '周延', '腿被压住了……枪够不着。');
  }
  if (t >= T.breach) s.fact('history-enemy-breach');
  if (t >= T.weaponReach) s.fact('zhao-reaches-rifle');
  if (t >= T.crowdAttack) {
    s.fact('history-crowd-attacked'); line('hall-crowd-line', '居民', '别开枪——', 2);
  }
  if (t >= T.capture) { s.fact('zhao-captured'); line('hall-shao-line', '邵原', '把他的枪踢开。', 2); }
  if (t >= T.recognition) { s.fact('shao-identified-by-zhou'); line('hall-recognition', '周延', '邵原……', 3); }
  if (t >= T.massacreEnd) s.fact('history-crowd-massacred');
  if (t >= T.roar) {
    s.fact('zhao-defiant-shout'); line('hall-zhao-plea', '赵启明', '他们是避难的群众！把枪放下！', 3);
  }
  // Positions, helplessness, the crowd's separate falls and the executions all have visible state.
  hallTableau(s, t);
  H.crowd.forEach((_, i) => {
    if (t >= openingCrowdHitTime(i, H.crowd.length)) stagedShot(s, `history-crowd-victim-${i}`,
      actor(s, 'hall-invader-1'), actor(s, `late-civilian-${i}`).position, true, emit);
  });
  if (t >= T.execution) stagedShot(s, 'zhao-executed', actor(s, 'shao'), H.zhaoCaptured, true, emit);
  if (t >= T.unconscious) s.fact('zhou-unconscious');
  if (t >= T.finish) finishHall(s);
}

function updateHallDeparture(s: Simulation): void {
  const phase = s.mission.phase;
  if (phase < 1 || phase > 3) return;
  s.fact('history-defense-active');
  if (phase >= 2) {
    s.fact('history-evacuation-underway');
    H.evacCrowd.forEach((_, i) => {
      const a = actor(s, `evac-crowd-${i}`);
      if (!a.released && !a.safe && !a.down && (phase >= 3 || s.mission.phaseTime >= H.evacCrowdDelay[i])) {
        s.route(a, evacuationRoute(i).slice(1));
      }
      if (!a.goals.length && a.position[0] < H.partitionX - 1 && a.position[1] < -1.8) a.safe = true;
    });
  }
  s.workers.forEach((a, i) => { if (a.safe && !a.goals.length) a.yaw = H.civilianSafeFacing[i]; });
  if (phase >= 3 || phase === 2 && s.mission.phaseTime >= 2) defenderFalls(s, 0);
  if (phase !== 3) return;
  defenderFalls(s, 1); s.fact('child-handed-over');
  const father = actor(s, 'father');
  // Earlier phase-3 checkpoints parked him at fatherStart. Resume his action
  // from that position instead of waiting forever for a newly introduced fact.
  if (!father.down && !father.goals.length && !s.has('father-cover-shot')) {
    if (!s.has('father-rifle-collected') && distance(father.position, H.rifle) >= 1) s.route(father, [H.rifle]);
    else if (s.has('father-rifle-collected') && distance(father.position, H.fatherFall) >= 1) {
      s.fact('father-charged-defense'); s.route(father, [H.fatherFall]);
    }
  }
  if (!s.has('father-rifle-collected') && !father.goals.length && distance(father.position, H.rifle) < 1) {
    s.fact('father-rifle-collected'); s.fact('father-charged-defense'); s.route(father, [H.fatherFall]);
  }
  if (s.has('father-charged-defense') && !father.goals.length && distance(father.position, H.fatherFall) < 1) {
    father.aiming = true; father.yaw = Math.PI / 2;
    stagedShot(s, 'father-cover-shot', father, H.enemyEntries[1]);
  }
  const family = ['evacuator', 'daughter', 'young-lu'].map(id => actor(s, id));
  if (s.safeCount === s.workers.length && family.every(a => !a.goals.length && a.position[0] < H.partitionX - 1 && a.position[1] < -1.8)) {
    s.fact('child-evacuated'); s.fact('child-out-of-sight'); s.fact('history-partition-closed');
  }
}

export function updateOpening(s: Simulation, input: Intent): void {
  const m = s.mission;
  restoreOpeningEnemies(s);
  ensureDefenders(s); ensureCrowds(s);
  const at = (p: Vec3) => distance(s.player.position, p) < 2.8 && Math.abs(s.player.position[1] - p[1]) < 1;
  if (s.scenario === 'childhood') {
    if (m.phase === 0 && input.interact && at(H.lunch)) {
      s.fact('lunch-packed'); s.route(actor(s, 'father'), [H.mattress]);
      s.phase(1, '先把饭盒收好。那边床垫卡住了，我去帮一下，你跟着我。', 'work', '父亲');
    } else if (m.phase === 1 && input.interact && at(H.mattress) && distance(actor(s, 'father').position, H.mattress) < 2) {
      s.fact('mattress-cleared'); s.fact('history-gate-open'); s.route(actor(s, 'father'), [H.gateOutside]);
      s.phase(2, '门开了。妈妈在医院，有人会去报信。我们往西边走。', 'work', '父亲');
    } else if (m.phase === 2 && at(H.gateOutside) && !actor(s, 'father').goals.length
      && distance(actor(s, 'father').position, H.gateOutside) < 1) {
      s.phase(3, '守住正门，让居民从西侧撤！', 'staged', '赵启明');
      s.player.yaw = -Math.PI / 2; s.player.pitch = 0;
    } else if (m.phase === 3) playChildhood(s, input);
    return;
  }
  updateHallDeparture(s);
  if (m.phase === 0 && input.interact && at(H.gatePanel)) {
    s.fact('zhou-trusts-zhao'); s.fact('history-gate-open'); s.fact('mattress-cleared');
    s.route(actor(s, 'father'), [H.fatherStart]);
    m.nextSpawn = m.elapsed + 14;
    s.phase(1, '拉环就在红线旁边，谢谢。门已经开了——班长，西侧我来守。', 'combat', '周延');
  } else if (m.phase === 1 && !s.exposedThreat(H.defenseA, 52) && residentRouteClear(s, 0, 3)) {
    s.fact('hall-front-secured'); releaseResidents(s, 0, 3);
    s.phase(2, '前面这三位，沿西边过去。周延，换到柱后接住侧通道；正门我守着。', 'combat', '赵启明');
    s.spawnChapterGroup('E00', availableEnemyPosts(s, 2)); m.nextSpawn = m.elapsed + 14;
  } else if (m.phase === 2 && s.workers.slice(0, 3).every(a => a.position[0] < H.gateX - 0.5 || a.safe)
    && !s.exposedThreat(H.defenseB, 52) && residentRouteClear(s, 3, s.workers.length)) {
    s.fact('hall-side-secured'); releaseResidents(s, 3, s.workers.length);
    defenderFalls(s, 0); defenderFalls(s, 1); s.fact('child-handed-over');
    s.route(actor(s, 'father'), [H.rifle]);
    s.route(actor(s, 'evacuator'), [...H.civilianVia.slice(1), H.womanEnd]);
    s.route(actor(s, 'daughter'), [...H.civilianVia.slice(1), H.childSafe]);
    s.route(actor(s, 'young-lu'), [...H.civilianVia, H.childSafe]);
    s.phase(3, '还有三个人，别挡住身后的过道。接住最后一批！', 'combat', '赵启明');
  } else if (m.phase === 3 && s.safeCount === s.workers.length && s.has('child-out-of-sight')
    && s.has('father-cover-shot')) beginHallCollapse(s);
  else if (m.phase === 4) playHall(s, input);
  if (m.phase >= 1 && m.phase <= 3 && m.elapsed >= m.nextSpawn && m.spawned < 18 && s.aliveEnemies.length < 8) {
    s.spawnChapterGroup('E00', availableEnemyPosts(s, 1));
    m.nextSpawn = m.elapsed + 12;
  }
}

export function openingObjective(s: Simulation) {
  const phase = s.mission.phase, child = s.scenario === 'childhood';
  let point: Vec3, text: string, detail: string, action = '';
  if (child) {
    point = [H.lunch, H.mattress, H.gateOutside, H.childSafe, H.childSafe][phase];
    [text, action, detail] = [
      ['收好长凳旁的饭盒', '收好饭盒', '妈妈去了医院。父亲在身边等你。'],
      ['跟父亲清出检修门前的过道', distance(actor(s, 'father').position, H.mattress) < 2 ? '帮父亲挪开床垫' : '', '父亲在西侧帮人腾出通路。'],
      ['随父亲走到西检修门', '', '跟上父亲。你们到门口后，他会把你交给撤离者。'],
      ['随撤离者穿过隔断', '', s.has('child-out-of-sight') ? '主厅已被隔断挡住。' : 'Enter 跳过此段演出。'],
      ['检修门', '', ''],
    ][phase];
  } else {
    point = [H.gatePanel, H.defenseA, H.defenseB, H.gateOutside, H.zhaoCaptured, H.zhaoCaptured][phase];
    [text, action, detail] = [
      ['打开西侧检修门', '拉开检修锁环', '班长把西侧交给你。控制盒在门边。'],
      ['清出前沿火线，护送首批居民', '', '保护西侧过道与居民身边的通路；安全后他们会自行出发。'],
      ['转到侧通道，接住最后一批', '', '首批穿门后，剩余居民会沿安全的侧通道自行撤离。'],
      [`保护指定居民通过隔断 · ${s.safeCount}/${s.workers.length}`, '', '近处火力会压住居民，护送到下方安全段。'],
      ['主厅失守', '', '已救出的居民不会因后续演出撤销。可观察；Enter 跳过。'],
      ['十年前的主厅', '', ''],
    ][phase];
    if (phase === 4) text = s.has('zhou-unconscious') ? '周延失去意识' : s.has('zhao-executed') ? '班长倒下了'
      : s.has('zhao-defiant-shout') ? '班长向敌军怒吼' : s.has('history-crowd-attacked') ? '敌军向主厅群众开火'
        : s.has('history-collapse') ? '周延被压在瓦砾下' : s.has('history-bombardment') ? '避难所遭到轰炸' : '防线退入主厅';
    if (phase === 3) { const pending = s.workers.find(a => !a.safe); if (pending) point = [...pending.position]; }
  }
  return { phase: child ? 'S01 · 检修门' : 'S02 · 主厅', text, detail, point,
    interaction: action && distance(s.player.position, point) < 2.8 && Math.abs(s.player.position[1] - point[1]) < 1 ? action : '' };
}

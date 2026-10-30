import type { Vec3 } from '../contracts';
import { HISTORY as H } from '../content/history-layout';
import type { Intent } from '../player/Input';
import { distance, type Actor, type Simulation } from './Simulation';

/** Fixed scenes share the same author-owned terminal state on playback and skip. */
function actor(s: Simulation, id: string): Actor { return s.actors.find(a => a.id === id)!; }
function mix(a: Vec3, b: Vec3, t: number): Vec3 {
  const u = Math.max(0, Math.min(1, t)); return a.map((v, i) => v + (b[i] - v) * u) as Vec3;
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
  a.down = down; a.aiming = false; a.walk = 0; a.health = down ? 0 : a.health;
  if (s.physics.bodies.has(id)) { s.physics.teleport(id, point); if (down) s.physics.remove(id); }
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
const CHILD_FACTS = ['child-handed-over', 'father-rifle-collected', 'father-died', 'child-evacuated', 'history-partition-closed',
  'childhood-pickup-line', 'father-cover-shot', 'childhood-fall-line', 'childhood-evacuator-line'];
const HALL_FACTS = ['civilians-evacuated', 'history-collapse', 'history-partition-closed', 'father-rifle-collected', 'father-died', 'child-evacuated', 'zhao-captured', 'shao-identified-by-zhou', 'zhao-executed', 'zhou-survived-hall',
  'hall-zhao-plea', 'hall-recognition', 'hall-shao-line'];

export function populateOpening(s: Simulation): void {
  const child = s.scenario === 'childhood';
  s.createActor('father', '陆建平', 'father', child ? H.fatherStart : H.gateOutside);
  s.createActor('evacuator', '带孩子撤离的女人', 'civilian', H.womanStart);
  s.createActor('daughter', '女孩', 'child', H.daughterStart);
  s.createActor('zhao', '赵启明', 'ally', H.zhaoStart);
  if (child) {
    s.createActor('young-zhou', '年轻的驻军士兵', 'ally', H.gatePanel);
    H.civilians.forEach((p, i) => s.createActor(`civilian-${i}`, '等候的居民', 'civilian', p));
    s.say('父亲', '勺子又没带？先用盒盖。糖留着，等妈妈从医院回来。');
  } else {
    s.createActor('young-lu', '男孩', 'child', H.fatherStart);
    H.civilians.forEach((p, i) => s.createActor(`worker-${i}`, `撤离居民 ${i + 1}`, 'worker', p));
    s.say('赵启明', '西边由你处理。你看着办，开了以后带他们到下一道隔断。正门我在。', 10);
  }
  H.crowd.forEach((p, i) => s.createActor(`late-civilian-${i}`, '主厅居民', 'civilian', p));
}

function finishChildhood(s: Simulation): void {
  CHILD_FACTS.forEach(f => s.fact(f));
  pose(s, 'father', H.fatherFall, -Math.PI / 2, true);
  pose(s, 'evacuator', H.womanEnd, -Math.PI / 2).safe = true;
  pose(s, 'daughter', H.childSafe, -Math.PI / 2).safe = true;
  H.civilians.forEach((_, i) => { if (s.actors.some(a => a.id === `civilian-${i}`)) pose(s, `civilian-${i}`, [H.childSafe[0] + i % 2, H.childSafe[1], H.childSafe[2] - 1 + Math.floor(i / 2)], -Math.PI / 2).safe = true; });
  playerAt(s, [H.womanEnd[0] - 0.3, H.womanEnd[1] + 0.45, H.womanEnd[2] + 0.35]);
  s.player.yaw = -Math.PI / 2; s.player.pitch = 0;
  s.phase(4, '', 'staged'); s.finish('闻川被带过隔断。父亲留在主厅，再没有跟上来。');
}

function playChildhood(s: Simulation, input: Intent): void {
  const t = s.mission.phaseTime;
  const father = pose(s, 'father', t < 6 ? mix(H.gateOutside, H.rifle, t / 5) : mix(H.rifle, H.fatherFall, (t - 7) / 3), t < 10 ? Math.PI / 2 : -Math.PI / 2, t >= 10);
  father.walk = t * 5; father.aiming = t >= 7 && t < 10;
  const woman = pose(s, 'evacuator', along(ESCAPE, (t - 13) / 10), -Math.PI / 2);
  woman.walk = t > 13 ? t * 5 : 0;
  pose(s, 'daughter', along([H.daughterStart, H.stairsStart, H.stairsEnd, H.childSafe], (t - 8) / 13), -Math.PI / 2).walk = t > 8 && t < 21 ? t * 5 : 0;
  playerAt(s, [woman.position[0] + 0.4, woman.position[1] + (t >= 12 ? 0.45 : 0), woman.position[2] + 0.35]);
  viewAt(s, H.fatherFall);
  if (t >= 5) { s.fact('father-rifle-collected'); sayOnce(s, 'childhood-pickup-line', '', '父亲弯下腰，拾起倒在门边的士兵留下的枪。', 4); }
  if (t >= 8 && !s.has('father-cover-shot')) { s.fact('father-cover-shot'); s.events.push({ type: 'shot', position: [father.position[0], 1.4, father.position[2]] }); }
  if (t >= 10) { s.fact('father-died'); sayOnce(s, 'childhood-fall-line', '闻川', '爸爸……他没进来！', 4); }
  if (t >= 13) sayOnce(s, 'childhood-evacuator-line', '女人', '抱紧。先到下面去。', 5);
  if (woman.position[0] < H.partitionX - 1) s.fact('history-partition-closed');
  if (t >= 23 || input.skip) finishChildhood(s);
}

function releaseResidents(s: Simulation, first: number, end: number): void {
  s.workers.slice(first, end).forEach((a, i) => s.route(a, [...H.civilianVia, [H.childSafe[0] + i % 2, H.childSafe[1], H.childSafe[2] - 1 + Math.floor(i / 2)]]));
}
function beginHallCollapse(s: Simulation): void {
  s.fact('civilians-evacuated'); s.fact('history-collapse'); s.fact('history-partition-closed');
  s.ballistics.clear();
  for (const a of s.actors) { a.goals = []; a.path = []; a.aiming = false; }
  if (!s.actors.some(a => a.id === 'shao')) { const shao = s.createActor('shao', '邵原', 'opponent', H.shaoStart); s.physics.add(shao.id, shao.position); }
  s.physics.setHeight('player', 0.65); s.player.height = 0.65;
  playerAt(s, H.rubblePlayer); s.player.health = 42;
  s.player.yaw = Math.atan2(H.rubblePlayer[0] - H.zhaoCaptured[0], H.rubblePlayer[2] - H.zhaoCaptured[2]);
  s.player.pitch = 0.15;
  s.phase(4, '指定居民已经穿过隔断。吊顶的金属骨架坍落，周延被压在柱边。', 'staged', '');
}
function hallTableau(s: Simulation, t: number): void {
  s.fact('father-rifle-collected'); s.fact('father-died'); s.fact('child-evacuated');
  const zhao = pose(s, 'zhao', mix(H.zhaoStart, H.zhaoCaptured, t / 7), Math.PI / 2, t >= 20);
  zhao.walk = t < 7 ? t * 4 : 0;
  const shaoEnd: Vec3 = [H.zhaoCaptured[0] + 2.8, 0, H.zhaoCaptured[2]];
  const shao = pose(s, 'shao', mix(H.shaoStart, shaoEnd, (t - 8) / 7), -Math.PI / 2);
  shao.aiming = t >= 18; shao.walk = t > 8 && t < 15 ? t * 4 : 0;
  pose(s, 'father', H.fatherFall, -Math.PI / 2, true);
  pose(s, 'evacuator', H.womanEnd, -Math.PI / 2).safe = true;
  pose(s, 'daughter', H.childSafe, -Math.PI / 2).safe = true;
  pose(s, 'young-lu', [H.womanEnd[0], H.womanEnd[1] + 0.45, H.womanEnd[2] + 0.35], -Math.PI / 2).safe = true;
  H.crowd.forEach((p, i) => { if (s.actors.some(a => a.id === `late-civilian-${i}`)) pose(s, `late-civilian-${i}`, p, Math.PI / 2, t >= 10 + i); });
  playerAt(s, H.rubblePlayer); s.player.health = 42; s.player.hurtAt = s.mission.elapsed;
  viewAt(s, H.zhaoCaptured, 1.1);
}
function finishHall(s: Simulation): void {
  HALL_FACTS.forEach(f => s.fact(f)); hallTableau(s, 27);
  s.player.yaw = -Math.PI / 2; s.player.pitch = 0.15;
  s.phase(5, '', 'staged'); s.finish('被护送的六名居民已经撤走。主厅失守，赵启明被处决；周延后来获救。');
}
function playHall(s: Simulation, input: Intent): void {
  const t = s.mission.phaseTime; hallTableau(s, t);
  if (t >= 5) { s.fact('zhao-captured'); sayOnce(s, 'hall-zhao-plea', '赵启明', '让他们走！医院里还有孩子！', 6); }
  if (t >= 11) { s.fact('shao-identified-by-zhou'); sayOnce(s, 'hall-recognition', '周延', '邵原……他还在营区讲过，不能向居民开枪。', 6); }
  if (t >= 18) sayOnce(s, 'hall-shao-line', '邵原', '侧门封住了没有？', 3);
  if (t >= 20 && !s.has('zhao-executed')) {
    s.fact('zhao-executed'); s.events.push({ type: 'shot', enemy: true, position: actor(s, 'shao').position }); s.say('周延', '班长……', 6);
  }
  if (t >= 27 || input.skip) finishHall(s);
}

export function updateOpening(s: Simulation, input: Intent): void {
  const m = s.mission;
  const at = (p: Vec3) => distance(s.player.position, p) < 2.8 && Math.abs(s.player.position[1] - p[1]) < 1;
  if (s.scenario === 'childhood') {
    if (m.phase === 0 && input.interact && at(H.lunch)) {
      s.fact('lunch-packed'); s.route(actor(s, 'father'), [H.mattress]);
      s.phase(1, '先把饭盒收好。那边床垫卡住了，我去帮一下，你跟着我。', 'work', '父亲');
    } else if (m.phase === 1 && input.interact && at(H.mattress) && distance(actor(s, 'father').position, H.mattress) < 2) {
      s.fact('mattress-cleared'); s.fact('history-gate-open'); s.route(actor(s, 'father'), [H.gateOutside]);
      s.phase(2, '门开了。妈妈在医院，有人会去报信。我们往西边走。', 'work', '父亲');
    } else if (m.phase === 2 && input.interact && at(H.gateOutside) && distance(actor(s, 'father').position, H.gateOutside) < 2) {
      s.fact('child-handed-over');
      H.civilians.forEach((_, i) => { const a = s.actors.find(a => a.id === `civilian-${i}`); if (a) s.route(a, [...H.civilianVia, H.childSafe]); });
      s.phase(3, '他九岁，能自己走。麻烦照看一下。闻川，跟紧前面的人。', 'staged', '父亲');
      s.player.yaw = -Math.PI / 2; s.player.pitch = 0;
    } else if (m.phase === 3) playChildhood(s, input);
    return;
  }
  if (m.phase === 0 && input.interact && at(H.gatePanel)) {
    s.fact('zhou-trusts-zhao'); s.fact('history-gate-open'); s.fact('mattress-cleared');
    s.route(actor(s, 'father'), [H.fatherStart]);
    s.spawnChapterGroup('E00', H.enemyPosts.slice(0, 4)); m.nextSpawn = m.elapsed + 14;
    s.phase(1, '拉环就在红线旁边，谢谢。门已经开了——班长，西侧我来守。', 'combat', '周延');
  } else if (m.phase === 1 && input.interact && at(H.defenseA) && !s.exposedThreat(H.defenseA, 20)) {
    s.fact('hall-front-secured'); releaseResidents(s, 0, 3);
    s.phase(2, '前面这三位，沿西边过去。周延，换到柱后接住侧通道；正门我守着。', 'combat', '赵启明');
    s.spawnChapterGroup('E00', H.enemyEntries.slice(0, 2), H.enemyPosts.slice(4)); m.nextSpawn = m.elapsed + 14;
  } else if (m.phase === 2 && input.interact && at(H.defenseB) && !s.exposedThreat(H.defenseB, 18)) {
    s.fact('hall-side-secured'); releaseResidents(s, 3, s.workers.length);
    s.route(actor(s, 'evacuator'), [...H.civilianVia.slice(1), H.womanEnd]);
    s.route(actor(s, 'daughter'), [...H.civilianVia.slice(1), H.childSafe]);
    s.route(actor(s, 'young-lu'), [...H.civilianVia, H.childSafe]);
    s.phase(3, '还有三个人，别挡住身后的过道。接住最后一批！', 'combat', '赵启明');
  } else if (m.phase === 3 && s.safeCount === s.workers.length) beginHallCollapse(s);
  else if (m.phase === 4) playHall(s, input);
  if (m.phase >= 1 && m.phase <= 3 && m.elapsed >= m.nextSpawn && m.spawned < 18 && s.aliveEnemies.length < 8) {
    const n = m.spawned % H.enemyEntries.length;
    s.spawnChapterGroup('E00', [H.enemyEntries[n]], [H.enemyPosts[m.spawned % H.enemyPosts.length]]);
    m.nextSpawn = m.elapsed + 12;
  }
}

export function openingObjective(s: Simulation) {
  const phase = s.mission.phase, child = s.scenario === 'childhood';
  let point: Vec3, text: string, detail: string, action = '';
  if (child) {
    point = [H.lunch, H.mattress, H.gateOutside, H.fatherFall, H.childSafe][phase];
    [text, action, detail] = [
      ['收好长凳旁的饭盒', '收好饭盒', '妈妈去了医院。父亲在身边等你。'],
      ['跟父亲清出检修门前的过道', distance(actor(s, 'father').position, H.mattress) < 2 ? '帮父亲挪开床垫' : '', '父亲在西侧帮人腾出通路。'],
      ['随父亲走到西检修门', distance(actor(s, 'father').position, H.gateOutside) < 2 ? '跟上门里的撤离者' : '', '门已经打开，里面通向设备层。'],
      ['穿过隔断', '', '可回望。Enter 跳过此段演出。'],
      ['检修门', '', ''],
    ][phase];
  } else {
    point = [H.gatePanel, H.defenseA, H.defenseB, H.gateOutside, H.zhaoCaptured, H.zhaoCaptured][phase];
    [text, action, detail] = [
      ['打开西侧检修门', '拉开检修锁环', '班长把西侧交给你。控制盒在门边。'],
      ['清出前沿火线，护送首批居民', s.exposedThreat(point, 20) ? '' : '通知首批居民通行', '从柱子和运输柜之间换位，留出西侧过道。'],
      ['转到侧通道，接住最后一批', s.exposedThreat(point, 18) ? '' : '通知其余居民通行', '前一批仍在移动，沿相通掩体回到西侧。'],
      [`保护指定居民通过隔断 · ${s.safeCount}/${s.workers.length}`, '', '近处火力会压住居民，护送到下方安全段。'],
      ['主厅失守', '', '已救出的居民不会因后续演出撤销。可观察；Enter 跳过。'],
      ['十年前的主厅', '', ''],
    ][phase];
    if (phase === 3) { const pending = s.workers.find(a => !a.safe); if (pending) point = [...pending.position]; }
  }
  return { phase: child ? 'S01 · 检修门' : 'S02 · 主厅', text, detail, point,
    interaction: action && distance(s.player.position, point) < 2.8 && Math.abs(s.player.position[1] - point[1]) < 1 ? action : '' };
}

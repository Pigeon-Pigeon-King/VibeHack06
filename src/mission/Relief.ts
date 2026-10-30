import type { Vec3 } from '../contracts';
import { RELIEF as R } from '../content/relief-layout';
import type { Intent } from '../player/Input';
import { distance, type Simulation } from './Simulation';
import { finishDialogue, lookWithin, playDialogue, type DialogueLine } from './Dialogue';

const HANDOVER: readonly DialogueLine[] = [
  [0, '孟齐', '医院的人都到了。这个陪护的房间号，许岚已经改过；闻川跟我一辆辆查的。'],
  [7, '周延', '照这份交接。北面储料棚不能再走，侧门的通信给你。'],
  [14, '孟齐', '我看得见。旁边也有人照应。你往后走，这一组才能跟着收。'],
  [21, '周延', '我这一组撤。北闸按刚才的安排交接，后面有情况及时叫我。'],
];
const REST: readonly DialogueLine[] = [
  [0, '周延', '帮我把膝盖护具下沿松一点。站起来时，里面一直卡着。'],
  [7, '郑铎', '这样呢？能用和要换的都列出来，这次把你自己的也写上。'],
  [13, '周延', '好了，谢谢。写上，交完班一起换。'],
  [19, '妹妹 · 留言', '上次给你的住址还有效。家里换了热水器，爸总按错开关。孩子还问，你的船有学校画的那么大吗？'],
  [29, '妹妹 · 留言', '我们收到你的消息了。家里没什么要紧事，有空再回，别着急。'],
];
const a = (s: Simulation, id: string) => s.actors.find(x => x.id === id)!;
const at = (s: Simulation, p: Vec3, radius = 2.8) => distance(s.player.position, p) < radius && Math.abs(s.player.position[1] - p[1]) < 0.6;
const quiet = (s: Simulation, p: Vec3) => !s.exposedThreat(p, 52);
const handoverPoint: Vec3 = [R.post[0], R.post[1], R.post[2] + 2.4];
const team = (s: Simulation) => [a(s, 'meng'), a(s, 'relief-0'), a(s, 'relief-1')];
const arrived = (s: Simulation) => team(s).every((actor, i) => !actor.goals.length && distance(actor.position, R.reliefPosts[i]) < 1.2);
function enterPositions(s: Simulation): void {
  team(s).forEach((actor, i) => s.route(actor, [...R.arrivalVia, R.reliefPosts[i]]));
}

export function populateRelief(s: Simulation): void {
  s.createActor('meng', '孟齐', 'ally', R.meng); s.createActor('zheng', '郑铎', 'ally', R.zheng);
  R.recruits.forEach((p, i) => s.createActor(`relief-${i}`, `接防队员 ${i + 1}`, 'ally', p));
  R.techSpawns.forEach((p, i) => s.createActor(`worker-${i}`, `收尾设备员 ${i + 1}`, 'worker', p));
  R.enemyPosts[0].slice(0, 3).forEach(p => s.createActor(`enemy-E08-${s.mission.spawned++}`, '北闸机动队', 'enemy', p));
  s.fact('relief-entry-warned'); s.say('郑铎 · 无线电', '缩回内侧已获批准。先守住接防入口，让最后三个设备员撤；孟齐已经从护送线回来了。', 10);
}

function pressure(s: Simulation): void {
  const m = s.mission;
  if (m.phase <= 2 && m.elapsed >= m.nextSpawn && m.spawned < 32) {
    s.spawnChapterGroup('E08', R.enemyEntries[0].slice(0, 2), R.enemyPosts[0].slice(0, 2));
    m.nextSpawn = m.elapsed + 14;
  }
  if (m.phase >= 4 && m.phase <= 5 && m.phaseTime >= 4 && !s.has('relief-cover-wave-deployed')) {
    for (let i = 0; i < R.enemyEntries[1].length; i++) {
      if (s.has(`relief-cover-entry-${i}`)) continue;
      const before = m.spawned;
      s.spawnChapterGroup('E08', [R.enemyEntries[1][i]], [R.enemyPosts[1][i]]);
      if (m.spawned > before) s.fact(`relief-cover-entry-${i}`);
    }
    if (R.enemyEntries[1].every((_, i) => s.has(`relief-cover-entry-${i}`))) s.fact('relief-cover-wave-deployed');
  }
}

export function updateRelief(s: Simulation, input: Intent): void {
  const m = s.mission;
  if (m.phase === 0 && input.interact && at(s, R.entryHold) && quiet(s, R.entryHold)) {
    s.fact('relief-entry-secured');
    s.workers.forEach((actor, i) => s.route(actor, [...R.techVia, [R.techSafe[0] + (i - 1) * 1.5, R.techSafe[1], R.techSafe[2]]]));
    enterPositions(s);
    s.phase(1, '入口稳住了，设备员先退。孟齐，沿西侧已经清出的通道进来，别横穿前面的空地。', 'combat', '周延');
  } else if (m.phase === 1 && s.safeCount === 3 && arrived(s)) {
    s.fact('relief-arrived'); s.fact('relief-posts-held');
    s.phase(2, '人都到位了。名单在这里，许岚已经确认过房间。你把通信和阵位交给我。', 'combat', '孟齐');
  } else if (m.phase === 2 && arrived(s) && input.interact && at(s, handoverPoint) && quiet(s, R.post)) {
    s.phase(3, HANDOVER[0][2], 'staged', HANDOVER[0][1]);
  } else if (m.phase === 3) {
    lookWithin(s, R.reliefPosts[1]); playDialogue(s, 'relief-handover', HANDOVER);
    if (input.skip || m.phaseTime >= 28) {
      finishDialogue(s, 'relief-handover', HANDOVER);
      ['relief-handover-complete', 'zhou-accepts-verified-manifest', 'zhou-gives-up-post', 'relief-cover-warned'].forEach(f => s.fact(f));
      s.player.health = 100; s.player.hurtAt = m.elapsed - 7;
      s.phase(4, '东侧储料口还有人！我和这边的队员接住，你先过第一段横道。', 'combat', '孟齐');
    }
  } else if (m.phase === 4 && at(s, R.crossings[0]) && s.has('relief-cover-wave-deployed') && s.has('relief-cover-fired')) {
    s.fact('zhou-crossed-first-cover'); s.phase(5, '这段到了。沿挡墙往内门走，第二段由旁边的队员照应。', 'combat', '孟齐');
  } else if (m.phase === 5 && at(s, R.crossings[1]) && quiet(s, R.crossings[1])) {
    s.fact('zhou-crossed-second-cover'); s.route(a(s, 'zheng'), [R.zhengCare]);
    s.phase(6, '内门里有矮箱。先坐一下，把腿伸开，我在这里。', 'work', '郑铎');
  } else if (m.phase === 6 && at(s, R.rest, 1.0) && input.interact && distance(a(s, 'zheng').position, R.zhengCare) < 1.1) {
    s.fact('zhou-accepts-help'); s.phase(7, REST[0][2], 'staged', REST[0][1]);
    s.route(a(s, 'zheng'), [[s.player.position[0], s.player.position[1], s.player.position[2] - 0.8]]);
    s.player.yaw = R.seatYaw; s.player.pitch = -0.25;
    if (s.physics.setHeight('player', 1.1)) s.player.height = 1.1;
  } else if (m.phase === 7) {
    lookWithin(s, a(s, 'zheng').position, 0.8, 0.9);
    const zheng = a(s, 'zheng'); zheng.yaw = Math.atan2(s.player.position[0] - zheng.position[0], s.player.position[2] - zheng.position[2]);
    if (zheng.goals.length) { m.phaseTime = 0; return; }
    playDialogue(s, 'relief-rest', REST);
    if (m.phaseTime >= 13) s.fact('zhou-brace-adjusted');
    if (input.skip || m.phaseTime >= 38) {
      finishDialogue(s, 'relief-rest', REST);
      ['zhou-brace-adjusted', 'zhou-own-gear-on-list', 'zhou-heard-family', 'zhou-wants-to-live'].forEach(f => s.fact(f));
      if (s.physics.setHeight('player', 1.8)) s.player.height = 1.8;
      s.phase(8, '消息还在终端上。给家里回一句，再向旧检修站报到。', 'work', '周延');
    }
  } else if (m.phase === 8 && input.interact && at(s, R.radio)) {
    s.fact('zhou-family-reply-queued'); s.fact('zhou-will-seek-treatment');
    s.route(a(s, 'meng'), [R.crossingVia[0][0], R.crossings[0], ...R.crossingVia[1], [R.rest[0] + 3, R.rest[1], R.rest[2] - 4]]);
    s.phase(9, '消息收到了，我在北港做接应。等忙完再详细说。船的照片我也没看全，有机会再告诉孩子。', 'work', '周延 · 回复已进入中继队列');
  } else if (m.phase === 9) {
    if (m.phaseTime >= 9 && !s.has('lu-checks-zhou-rest')) {
      s.fact('lu-checks-zhou-rest'); s.say('陆闻川 · 无线电', '孟齐换到了就好。许岚让你到旧检修站先去报名字，别又在外面帮忙拖着。到了回我一声。', 10);
    }
    if (m.phaseTime >= 20 && !a(s, 'meng').goals.length && distance(a(s, 'meng').position, R.rest) < 6 && at(s, R.exit)) {
      s.fact('zhou-leaves-under-protection'); s.phase(10, '', 'work');
      s.finish('孟齐与接防人员真正接住阵位，周延在掩护下撤回，接受护具帮助并回复家人。他准备继续生活，接下来与同伴共同撤回。');
    }
  }
  pressure(s);
  for (const point of R.ammo) if (input.interact && at(s, point, 1.5) && s.player.reserve < 150) {
    s.player.reserve = 150; s.say('补给箱', '备用弹药已补齐。');
  }
}

export function reliefObjective(s: Simulation) {
  const p = s.mission.phase;
  let point: Vec3 = R.entryHold, text = '', detail = '', action = '';
  if (p === 0) { text = '守住后线接防入口'; detail = '内侧缩回已获批准。先接住车道与储料棚火线。'; action = quiet(s, point) ? '通知设备员与接防组通过' : ''; }
  else if (p === 1) { point = handoverPoint; text = `掩护设备员撤入 · ${s.safeCount}/3`; detail = '孟齐与两名接防队员正在沿西侧进场。'; }
  else if (p === 2) { point = handoverPoint; text = '核对已接手的名单与通信'; detail = '孟齐已经站到交出的岗位。'; action = quiet(s, R.post) ? '按核实的记录交接' : ''; }
  else if (p === 3) { point = handoverPoint; text = '把阵位交出去'; detail = '可以环顾。Enter 跳过此段交接。'; }
  else if (p === 4 || p === 5) { point = R.crossings[p - 4]; text = p === 4 ? '在同伴掩护下走过第一段横道' : '沿挡墙走过第二段撤回线'; detail = '孟齐与接防队员正在开火，不必返回原位。'; }
  else if (p === 6) { point = R.rest; text = '到内门矮箱旁坐下'; detail = '靠近矮箱，郑铎在前面等你。'; action = at(s, point, 1.0) ? '坐下，请郑铎调整护具' : ''; }
  else if (p === 7) { point = R.zhengCare; text = '接受护具调整，听家人消息'; detail = '可以低头看腿。Enter 跳过此段。'; }
  else if (p === 8) { point = R.radio; text = '给家人留下回复'; detail = '已确认住址仍有效；回复会进入中继队列。'; action = '回复家人，确认去检修站报到'; }
  else { point = R.exit; text = '与孟齐、郑铎继续撤回'; detail = '接防队员继续照看北闸，等孟齐收到最后的交接。'; }
  return { phase: 'S09 · 接受换班', point, text, detail, interaction: action && at(s, point) ? action : '' };
}

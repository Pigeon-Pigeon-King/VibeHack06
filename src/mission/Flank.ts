import type { Vec3 } from '../contracts';
import { FLANK as F } from '../content/flank-layout';
import { CROWD_STAGING_FACT, LEGACY_CROWD_STOPS } from '../content/crowd-layout';
import type { Intent } from '../player/Input';
import { distance, type Simulation } from './Simulation';
import { finishDialogue, lookWithin, playDialogue, type DialogueLine } from './Dialogue';

const actor = (s: Simulation, id: string) => s.actors.find(a => a.id === id)!;
const at = (s: Simulation, p: Vec3, range = 2.8) => distance(s.player.position, p) < range && Math.abs(s.player.position[1] - p[1]) < 0.6;
const quiet = (s: Simulation, p: Vec3) => !s.exposedThreat(p, 52);
const ADMISSION: readonly DialogueLine[] = [
  [0, '孟齐 · 无线电', '这批过了，两边名单对得上。医院最后两辆车还要一点时间。'],
  [6, '周延', '刚才的预告，是我故意没转给你。我想等护送结束，再跟你商量。'],
  [12, '陆闻川 · 无线电', '我知道你怎么想的。包括你觉得我不该知道的，以后也会给我？'],
  [18, '周延', '包括。我答应过你，应该先把消息给你。后面我们一起看，你有办法也直接说。'],
];
const REPORT: readonly DialogueLine[] = [
  [0, '周延', '已核实：邵原的人正在准备转移，随行护卫有限。来源和收到时间一并发给你。'],
  [6, '周延', '尚未确认：实际发车。机动部队留在港区，可能拖住我们，也可能回援。'],
  [12, '周延', '北闸仍有压力。接收中心两人已到另一头照应；医院还剩两辆车，能走的人已分到侧道。'],
  [18, '陆闻川 · 无线电', '升降机试完能腾出几个人？这批到站后，还要接着送第二段吗？'],
  [24, '周延', '第二段的接手结果还没回来，郑铎去确认。我把已知和缺项都写上，不替你省掉。'],
];
const REPORT_FACTS = ['full-report-shared', 'lu-has-full-report', 'departure-unconfirmed-shared',
  'mobile-force-role-shared', 'escort-staffing-shared', 'uncertainty-explicit', 'source-timestamp-shared'];

export function populateFlank(s: Simulation): void {
  s.fact(CROWD_STAGING_FACT);
  s.createActor('zheng', '郑铎', 'ally', F.zheng);
  s.createActor('meng', '孟齐', 'ally', F.meng);
  F.technicians.forEach((p, i) => s.createActor(`worker-${i}`, `收尾维修员 ${i + 1}`, 'worker', p));
  F.cartSpawns.forEach((p, i) => s.createActor(`cart-${i}`, `后续患者车 ${i + 1}`, 'cart', p));
  F.walkerSpawns.forEach((p, i) => s.createActor(`walker-${i}`, `可步行家属 ${i + 1}`, 'civilian', p));
  F.eastPosts.slice(0, 4).forEach(p => s.createActor(`enemy-E05-${s.mission.spawned++}`, '东侧机动队', 'enemy', p));
  s.fact('flank-east-warned');
  s.say('郑铎', '储料口东侧有机动队！先上检修台，接住还在收尾的人，再经泵房往内门缩。', 10);
}

function reinforce(s: Simulation): void {
  const m = s.mission, budget = [10, 24, 44][m.phase];
  if (!budget || m.spawned >= budget || m.elapsed < m.nextSpawn || s.aliveEnemies.length >= 8
    || m.phase === 1 && !s.has('flank-north-deployed') || s.has('flank-tank-base-secured')) return;
  const entries = m.phase === 0 ? F.eastEntries : F.northEntries;
  const posts = m.phase === 0 ? F.eastPosts : F.northPosts;
  const n = m.spawned;
  s.spawnChapterGroup('E05', [entries[n % entries.length]], [posts[n % posts.length]]);
  m.nextSpawn = m.elapsed + 12;
}

function northPressure(s: Simulation): void {
  if (s.mission.phaseTime < 4 || s.has('flank-north-deployed')) return;
  for (let i = 0; i < 3; i++) {
    if (s.has(`flank-north-entry-${i}`)) continue;
    const n = s.mission.spawned;
    s.spawnChapterGroup('E05', [F.northEntries[i]], [F.northPosts[i]]);
    if (s.mission.spawned > n) { s.fact(`flank-north-entry-${i}`); s.fact(`flank-north-enemy-E05-${n}`); }
  }
  if ([0, 1, 2].every(i => s.has(`flank-north-entry-${i}`))) s.fact('flank-north-deployed');
}

export function updateFlank(s: Simulation, input: Intent): void {
  const m = s.mission;
  // These are defended areas, not buttons. Height still requires taking the
  // actual platform stairs before the east-side position can be handed over.
  if (m.phase === 0 && m.phaseTime >= 1 && at(s, F.platform, 6) && quiet(s, F.platform)) {
    s.fact('flank-platform-held'); s.fact('flank-north-warned');
    s.route(actor(s, 'zheng'), [F.pump]);
    s.phase(1, '北侧车道有人转进来！下侧阶，经泵房外侧换位，先看清北面。', 'combat', '郑铎');
    m.nextSpawn = m.elapsed + 8;
  } else if (m.phase === 1) {
    northPressure(s);
    const north = s.actors.filter(a => s.has(`flank-north-${a.id}`));
    if (s.has('flank-north-deployed') && (north.every(a => a.down) || north.some(a => !a.down
      && distance(a.position, F.pump) < 48
      && !s.physics.trace([F.pump[0], F.pump[1] + 1.66, F.pump[2]], [a.position[0], a.position[1] + 1.66, a.position[2]], undefined, true)))) s.fact('flank-north-established');
    if (s.has('flank-north-established') && at(s, F.pump, 8) && quiet(s, F.pump)) {
      s.fact('flank-pump-held'); s.route(actor(s, 'zheng'), [F.northPost]);
      s.phase(2, '泵房这段接住了。从储罐基座看住北面，再带维修组撤回内门。', 'combat', '周延');
    }
  } else if (m.phase === 2) {
    if (!s.has('flank-tank-base-secured') && m.phaseTime >= 1 && at(s, F.northPost, 8) && quiet(s, F.northPost)) {
      s.fact('flank-tank-base-secured');
      s.workers.forEach((a, i) => s.route(a, [...F.technicianVia, F.technicianStops[i]]));
      s.route(actor(s, 'zheng'), [F.innerGate]);
      s.phase(2, '维修组沿内侧通道撤，郑铎跟我收回内门。', 'combat', '周延');
    } else if (s.has('flank-tank-base-secured') && s.safeCount === 3 && distance(actor(s, 'zheng').position, F.innerGate) < 1.2
      && !actor(s, 'zheng').goals.length && at(s, F.innerGate, 8) && quiet(s, F.innerGate)) {
      s.fact('flank-team-back'); s.ballistics.clear(); s.route(actor(s, 'zheng'), [F.water]);
      s.phase(3, '会车位被废设备占了。我查过侧边铺板梯，只让能走的人过；患者的车走主廊，两边都留名单。', 'work', '孟齐 · 无线电');
    }
  } else if (m.phase === 3 && input.interact && at(s, F.report)) {
    s.fact('meng-route-adopted');
    F.cartSafe.forEach((target, i) => s.route(actor(s, `cart-${i}`), [...F.cartVia, target]));
    const walkerStops = s.has(CROWD_STAGING_FACT) ? F.walkerSafe : LEGACY_CROWD_STOPS.flankWalkers;
    walkerStops.forEach((target, i) => s.route(actor(s, `walker-${i}`), [...F.walkerVia, target]));
    s.phase(4, '按你踏勘过的路线走。你负责分开的人，两边保留名单，到站报我。', 'work', '周延');
  } else if (m.phase === 4) {
    const walkerStops = s.has(CROWD_STAGING_FACT) ? F.walkerSafe : LEGACY_CROWD_STOPS.flankWalkers;
    for (const [prefix, targets] of [['cart', F.cartSafe], ['walker', walkerStops]] as const) {
      targets.forEach((target, i) => {
        const a = actor(s, `${prefix}-${i}`);
        if (a.released && !a.goals.length && distance(a.position, target) < 1.2 && Math.abs(a.position[1] - target[1]) < 0.5) a.safe = true;
      });
    }
    if (s.actors.filter(a => a.role === 'cart' || a.id.startsWith('walker-')).every(a => a.safe)) {
      s.fact('meng-route-proven'); s.fact('patients-used-cargo-route'); s.fact('walkers-used-side-route');
      s.phase(5, '这批过了，两边名单对得上。医院最后两辆车还要一点时间。', 'staged', '孟齐 · 无线电');
    }
  } else if (m.phase === 5) {
    lookWithin(s, F.meng); playDialogue(s, 'admission-line', ADMISSION);
    if (input.skip || m.phaseTime >= 25) {
      finishDialogue(s, 'admission-line', ADMISSION); s.fact('zhou-apology-without-excuse');
      s.player.health = 100; s.player.hurtAt = m.elapsed - 7;
      s.phase(6, '把原文、核实情况和仍缺的答复一起发过去。', 'work', '周延');
    }
  } else if (m.phase === 6) {
    if (!s.has('full-report-transmission') && input.interact && at(s, F.report)) {
      s.fact('full-report-transmission'); s.phase(6, REPORT[0][2], 'work', REPORT[0][1]);
    }
    if (s.has('full-report-transmission')) {
      playDialogue(s, 'report-line', REPORT);
      if (m.phaseTime >= 31) {
        REPORT_FACTS.forEach(f => s.fact(f));
        s.phase(7, '你先换一下位置。总蹲那条腿，站起来又得扶墙。水在这儿，通讯我接着听。', 'work', '郑铎');
      }
    }
  } else if (m.phase === 7) {
    if (!s.has('zhou-asks-relief') && input.interact && at(s, F.water) && distance(actor(s, 'zheng').position, F.water) < 1.2) {
      ['zhou-asks-rest', 'zhou-asks-relief', 'zhou-on-withdrawal-list', 'backup-radio-handed-to-zheng'].forEach(f => s.fact(f));
      s.phase(7, '缩回去我得缓两分钟。备用机给你。换班名单……把我也加上，通讯和伤员转移都要有人接。', 'work', '周延');
    }
    if (s.has('zhou-asks-relief') && m.phaseTime >= 7 && !s.has('family-medicine-reported')) {
      s.fact('family-medicine-reported'); s.say('孟齐 · 已转给闻川', '罗敬妻子缺的药找到替代包装了，交给医师确认。最难的窄口已经过去，家属名单还在核对。', 8);
    }
    if (s.has('family-medicine-reported') && m.phaseTime >= 15 && at(s, F.exit)) {
      s.phase(8, '', 'work'); s.finish('维修组已退回，孟齐的分流路线实际走通。闻川收到完整情况与缺项；周延说明伤腿和休息需要，把自己列进接替名单。');
    }
  }
  reinforce(s);
}

export function flankObjective(s: Simulation) {
  const p = s.mission.phase;
  let point: Vec3 = [F.platform, F.pump, F.northPost, F.report, F.routeWatch, F.routeWatch, F.report, F.water, F.exit][p];
  let text = '', action = '', detail = '';
  if (p === 0) { text = '登上检修台，压住东侧'; detail = '从侧阶到上层守住前沿；火线受控后郑铎会接续换位。'; }
  else if (p === 1) { text = '经侧阶转到泵房外侧'; detail = '北车道已报点。清掉能压住泵房外侧的敌人，接着往储罐基座撤。'; }
  else if (p === 2 && !s.has('flank-tank-base-secured')) { text = '清出储罐基座的撤回线'; detail = '从这里看住北面；撤回线安全后维修组自行沿内侧退回。'; }
  else if (p === 2) {
    point = F.innerGate; text = `退回内门 · 维修组 ${s.safeCount}/3`; detail = '维修员与郑铎正在撤回。退入内门防区，等同伴实际到齐。';
  } else if (p === 3) { text = '查看孟齐已经踏勘的路线'; detail = '车走主廊，能步行的人走铺板梯；两边各留名单。'; action = '采用孟齐的分流方案'; }
  else if (p === 4) { text = '照看患者与家属分流'; detail = `患者车 ${s.actors.filter(a => a.role === 'cart' && a.safe).length}/2 · 步行家属 ${s.actors.filter(a => a.id.startsWith('walker-') && a.safe).length}/2。两路到齐后孟齐会报回名单。`; }
  else if (p === 5) { text = '向闻川说明扣下预告的事'; detail = '可以环顾。Enter 跳过此段对话。'; }
  else if (p === 6) { text = '共享完整报告与缺项'; detail = '核实项、未确认项、人手和接应成本都要说明。'; action = s.has('full-report-transmission') ? '' : '发送原文和完整情况'; }
  else if (p === 7 && !s.has('zhou-asks-relief')) { text = '与郑铎交接通讯，提出换班需要'; detail = '郑铎在内侧等你。喝口水，把自己也写进撤回名单。'; action = distance(actor(s, 'zheng').position, point) < 1.2 ? '交出备用机，提出接替' : ''; }
  else { point = F.exit; text = '沿内门转回接应区'; detail = '现场仍由同伴接着守，接防安排正在执行。'; }
  return { phase: 'S07 · 交给别人', text, detail, point, interaction: action && at(s, point) ? action : '' };
}

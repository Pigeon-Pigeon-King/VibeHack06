import type { Vec3 } from '../contracts';
import { FRONTGATE as F } from '../content/frontgate-layout';
import type { Intent } from '../player/Input';
import { distance, type Simulation } from './Simulation';

const RADIO_FACTS = ['zhou-knows-shaoyuan-time', 'zhou-withheld-time', 'mobile-force-warning-shared'];
const found = (s: Simulation, id: string) => s.actors.find(a => a.id === id)!;
const at = (s: Simulation, p: Vec3) => distance(s.player.position, p) < 2.8;
const quiet = (s: Simulation, p: Vec3, r = 24) => !s.exposedThreat(p, r);

export function populateFrontgate(s: Simulation): void {
  F.workers.forEach((p, i) => s.createActor(`worker-${i}`, `北闸维修工 ${i + 1}`, 'worker', p));
  s.createActor('zheng', '郑铎', 'ally', F.zheng);
  s.createActor('relief', '北闸接替队员', 'ally', F.reliefStart);
  F.northPosts.slice(3).forEach(p => s.createActor(`enemy-E04-${s.mission.spawned++}`, '北路步枪兵', 'enemy', p));
  s.say('郑铎', '技工那边接上了。这里还有七名维修工，西边有独立后路；北路有人压过来。', 10);
}

function release(s: Simulation, first: number, last: number): void {
  s.workers.slice(first, last).forEach((a, i) => s.route(a, [...F.workerVia,
    [F.safe[0] + (i % 3 - 1) * 1.2, 0, F.safe[2] - Math.floor(i / 3) * 1.5]]));
}

function reinforce(s: Simulation): void {
  const m = s.mission;
  const budget = [8, 20, 30, 44][m.phase];
  if (!budget || m.spawned >= budget || s.aliveEnemies.length >= 8 || m.elapsed < m.nextSpawn || m.phase === 2 && !s.has('east-deployed')) return;
  const east = m.phase >= 2;
  const entries = east ? F.eastEntries : F.northEntries;
  const posts = east ? F.eastPosts : F.northPosts;
  const n = m.spawned;
  s.spawnChapterGroup('E04', [entries[n % entries.length]], [posts[n % posts.length]]);
  m.nextSpawn = m.elapsed + 12;
}

export function updateFrontgate(s: Simulation, input: Intent): void {
  const m = s.mission, zheng = found(s, 'zheng'), relief = found(s, 'relief');
  if (m.phase === 0 && input.interact && at(s, F.observe)) {
    s.fact('north-road-observed'); s.route(zheng, [F.weighB]);
    s.phase(1, '北路确认。称重台和检查棚能互相接应，先把首批的后路放开。', 'combat', '周延');
  } else if (m.phase === 1) {
    if (!s.has('front-first-released') && input.interact && at(s, F.weighA) && quiet(s, F.weighA)) {
      s.fact('front-first-released'); release(s, 0, 3);
      s.phase(1, '首批开始走西侧。你从另一处掩体接住北路，我盯着东边。', 'combat', '郑铎');
    } else if (s.has('front-first-released') && s.safeCount >= 3 && input.interact && at(s, F.weighB) && quiet(s, F.weighB)) {
      s.fact('east-road-warned');
      s.phase(2, '东侧车道！先转到有东向射界的掩体，剩下的人等你信号。', 'combat', '郑铎');
      m.nextSpawn = m.elapsed + 4;
    }
  } else if (m.phase === 2) {
    if (m.phaseTime >= 4 && !s.has('east-deployed')) {
      for (let i = 0; i < 3; i++) {
        if (s.has(`east-entry-${i}`)) continue;
        const before = m.spawned;
        s.spawnChapterGroup('E04', [F.eastEntries[i]], [F.eastPosts[i]]);
        if (m.spawned > before) { s.fact(`east-entry-${i}`); s.fact(`front-east-enemy-E04-${before}`); }
      }
      if ([0, 1, 2].every(i => s.has(`east-entry-${i}`))) { s.fact('east-deployed'); m.nextSpawn = m.elapsed + 12; }
    }
    const eastGroup = s.actors.filter(a => s.has(`front-east-${a.id}`));
    if (s.has('east-deployed') && !s.has('east-line-established') && (eastGroup.every(a => a.down)
      || eastGroup.some(a => !a.down && distance(a.position, F.eastPost) < 38
        && !s.physics.trace([F.eastPost[0], 1.66, F.eastPost[2]], [a.position[0], a.position[1] + 1.66, a.position[2]], undefined, true)))) s.fact('east-line-established');
    if (s.has('east-line-established') && input.interact && at(s, F.eastPost) && quiet(s, F.eastPost, 52)) {
      s.fact('front-last-released'); release(s, 3, s.workers.length); s.route(relief, [F.rearPost, F.weighA]);
      s.phase(3, '末批沿西侧撤。接替的人从后院上来，你先退到后线掩体，等我一起收回来。', 'combat', '郑铎');
    }
  } else if (m.phase === 3) {
    if (!s.has('front-relieved') && distance(relief.position, F.weighA) < 1) {
      s.fact('front-relieved'); s.route(zheng, [F.rearPost]); s.say('接替队员', '称重台我接住了。周延、郑铎，向内门撤。');
    }
    if (s.has('front-relieved') && s.safeCount === s.workers.length && distance(zheng.position, F.rearPost) < 1
      && input.interact && at(s, F.rearPost) && quiet(s, F.rearPost, 52)) {
      s.fact('front-workers-safe'); s.fact('front-team-returned'); s.ballistics.clear();
      s.phase(4, '北闸暂时稳住。联络员：邵原预计七点前后从东货场转移，尚待确认；机动部队可能反扑。', 'staged', '无线电');
    }
  } else if (m.phase === 4) {
    if (m.phaseTime >= 4 && !s.has('zhou-knows-shaoyuan-time')) {
      s.fact('zhou-knows-shaoyuan-time'); s.say('闻川 · 无线电', '北闸接上了吗？邵原呢？', 4);
    }
    if (m.phaseTime >= 8 && !s.has('zhou-withheld-time')) {
      s.fact('zhou-withheld-time'); s.fact('mobile-force-warning-shared');
      s.say('周延', '先把接收中心的门机接上。机动部队还在港区，东北支线要留人看着。', 6);
    }
    if (m.phaseTime >= 14 || input.skip) {
      RADIO_FACTS.forEach(f => s.fact(f));
      // This confirmed safe pause restores combat health on both playback paths.
      // Plot injuries in later stages are separate authored facts, not this meter.
      s.player.health = 100; s.player.hurtAt = m.elapsed - 7;
      s.phase(5, '转移时间仍留在周延的终端里。闻川只收到了机动力量的警告。', 'work', '');
    }
  } else if (m.phase === 5 && at(s, F.exit)) {
    s.phase(6, '', 'work'); s.finish('七名维修工与郑铎已退到内侧。周延转发了反扑警告，扣住了邵原的转移时间。');
  }
  reinforce(s);
}

export function frontgateObjective(s: Simulation) {
  const p = s.mission.phase;
  let point: Vec3 = [F.observe, F.weighA, F.eastPost, F.rearPost, F.rearPost, F.exit, F.exit][p];
  let action = '', text = '', detail = '';
  if (p === 0) { text = '到观察位确认北路'; action = '报告北路压力'; detail = '北路在前方，工人从隔墙后方撤离。'; }
  else if (p === 1 && !s.has('front-first-released')) {
    text = '清出称重台，放行首批工人'; action = quiet(s, point) ? '通知首批三人撤离' : ''; detail = '利用检查棚与称重台掩体推进。';
  } else if (p === 1) {
    point = F.weighB; text = `接住另一处火线 · 首批 ${Math.min(3, s.safeCount)}/3`;
    action = s.safeCount >= 3 && quiet(s, point) ? '确认首批通过' : ''; detail = '工人正在西侧后路移动。压住入口后，从相通掩体换位。';
  } else if (p === 2) {
    text = '转向东侧，护送末批'; action = s.has('east-line-established') && quiet(s, point, 52) ? '通知末批四人撤离' : '';
    detail = '侧路已报点。清掉能压住东向掩体的敌人，再让人员通过。';
  } else if (p === 3) {
    text = '退到后线掩体，接回郑铎'; detail = s.has('front-relieved') ? '前位已由接替者守住。等七名工人与郑铎全部到内侧。' : '接替队员正在前往称重台，先移动到后线掩体。';
    action = s.has('front-relieved') && s.safeCount === 7 && distance(found(s, 'zheng').position, F.rearPost) < 1 && quiet(s, point, 52) ? '确认人员到齐' : '';
  } else if (p === 4) { text = '接收转移预告'; detail = '局势暂时稳定。Enter 跳过此段对话。'; }
  else if (p === 5) { text = '沿内门撤回'; detail = '机动力量警告已转发。继续前往接收中心与设备间。'; }
  else { text = '北闸的预告'; detail = ''; }
  return { phase: 'S05 · 北闸的预告', text, detail, point, interaction: action && at(s, point) ? action : '' };
}

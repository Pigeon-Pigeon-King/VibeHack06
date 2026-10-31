import type { Vec3 } from '../contracts';
import { RESCUE as R } from '../content/rescue-layout';
import { npcTravelSpeed } from '../actors/Locomotion';
import type { Intent } from '../player/Input';
import { distance, type Actor, type Simulation } from './Simulation';
import { lookWithin } from './Dialogue';

const actor = (s: Simulation, id: string) => s.actors.find(a => a.id === id)!;
const at = (s: Simulation, p: Vec3, r = 2.3) => distance(s.player.position, p) < r;
const ready = (a: Actor, p: Vec3, r = 0.12) => !a.goals.length && distance(a.position, p) < r;
const quiet = (s: Simulation) => !s.exposedThreat(R.junction, 48);
const plus = (p: Vec3, x = 0, z = 0): Vec3 => [p[0] + x, p[1], p[2] + z];
const zhouArrival = () => plus(R.medicalArrival, 0, 6);
const receivedFacts = ['rescue-meng-under-cover', 'rescue-zhou-wounded', 'zhou-reported-injury',
  'zhou-requested-rescue', 'rescue-medics-arrived', 'rescue-both-loaded', 'rescue-transport-departed', 'rescue-both-received',
  'rescue-medical-ack', 'rescue-zhou-hit-fired'];

export function populateRescue(s: Simulation): void {
  s.createActor('meng', '孟齐', 'ally', R.mengStart);
  s.createActor('zheng', '郑铎', 'ally', R.zhengStart);
  s.createActor('medic', '接应医护', 'medic', R.medicSpawns[0]);
  s.createActor('medic-1', '转运医护', 'medic', R.medicSpawns[1]);
  s.createActor('zhou-cart', '空担架', 'cart', plus(R.pickup, 0, 6));
  R.enemyPosts[0].slice(0, 3).forEach(p => s.createActor(`enemy-E09-${s.mission.spawned++}`, '内陆支线机动队', 'enemy', p));
  s.fact('rescue-inland-direction-known');
  s.say('孟齐', '内陆支线那支机动队压过来了，还是东北储料方向。西货廊已保住，我们从设备交叉口撤。', 11);
}

function makePatient(s: Simulation): void {
  const meng = actor(s, 'meng');
  if (meng.role === 'cart') return;
  meng.role = 'cart'; meng.yaw = -Math.PI / 2; meng.aiming = false;
  s.physics.remove(meng.id); s.physics.addCart(meng.id, meng.position, meng.yaw);
  s.fact('rescue-meng-lifted');
}
function settle(s: Simulation, a: Actor, p: Vec3): void {
  a.position = [...p]; a.goals = []; a.path = []; a.walk = 0; a.aiming = false;
  s.physics.teleport(a.id, p);
}
/** Only the explicit skip uses relocation; natural play reaches these same docks through physics. */
function finish(s: Simulation, skipped: boolean): void {
  makePatient(s); receivedFacts.forEach(f => s.fact(f));
  const positions: Record<string, Vec3> = { meng: R.medicalArrival, 'zhou-cart': zhouArrival(),
    zheng: plus(R.medicalArrival, 3), medic: plus(R.medicalArrival, -3), 'medic-1': plus(R.medicalArrival, -3, 6) };
  if (skipped) {
    for (const [id, p] of Object.entries(positions)) settle(s, actor(s, id), p);
    s.player.position = zhouArrival(); s.physics.teleport('player', s.player.position);
  }
  actor(s, 'zhou-cart').name = '周延 · 转运担架';
  s.player.height = 1.1; s.physics.setHeight('player', 1.1); s.player.health = 100; s.player.hurtAt = s.mission.elapsed - 7;
  s.ballistics.clear(); s.phase(10, '', 'staged');
  s.finish('孟齐先进入硬遮护，周延随后报伤并主动求援。两人已经沿保住的西货廊送抵旧检修站，医疗队接手救治。');
}
function incoming(s: Simulation, point: Vec3): boolean {
  const target = plus(point); target[1] += 1.1;
  if (s.physics.trace(R.establishedFire, target, undefined, true)) return false;
  s.events.push({ type: 'shot', position: R.establishedFire });
  s.ballistics.fire('inland-fixed-fire', R.establishedFire, target.map((v, i) => v - R.establishedFire[i]) as Vec3, 0, 420);
  return true;
}

/** Shared movement remains physical: the patient and partner follow the player's two carry handles. */
export function rescueMotion(s: Simulation, dt: number): void {
  const phase = s.mission.phase;
  const moveTo = (id: string, target: Vec3, speed: number) => {
    const p = id === 'player' ? s.player.position : actor(s, id).position;
    const dx = target[0] - p[0], dz = target[2] - p[2], len = Math.hypot(dx, dz);
    const scale = len > 0.002 ? Math.min(speed, len / dt) / len : 0;
    s.physics.move(id, dx * scale, dz * scale, dt);
    if (id !== 'player') { const a = actor(s, id); a.yaw = -Math.PI / 2; s.physics.orient(id, a.yaw); }
  };
  if (phase === 4) {
    moveTo('meng', plus(s.player.position, 2), 1.5);
    moveTo('zheng', plus(s.player.position, 4), 1.5);
  } else if (phase === 5) moveTo('player', R.injury, 1.0);
  else if (phase >= 7 && phase <= 9) {
    const bed = actor(s, 'zhou-cart');
    // Once loaded, the patient viewpoint must keep up with the same physical
    // bed in both transport legs. Loading and the earlier two-person carry
    // retain their separate, slower contact motion.
    if (s.has('rescue-medics-arrived')) {
      // The loaded 1.1m patient collider fits inside the 1.15m bed box. Once
      // aboard, use that box's collision-checked motion, rather than asking a
      // second ground controller to chase it and accumulate contact delays.
      // A displaced older checkpoint still approaches physically before riding.
      if (phase >= 8 && distance(s.player.position, bed.position) < 0.2) s.physics.ride('player', bed.id);
      else moveTo('player', bed.position, phase >= 8 ? npcTravelSpeed(bed, s.scenario, phase) + 0.5 : 1.5);
    }
  }
}

export function rescueCarryCanMove(s: Simulation, input: Intent): boolean {
  if (s.mission.phase !== 4) return true;
  const p = s.player.position, yaw = input.yaw;
  const dx = (-Math.sin(yaw) * input.forward + Math.cos(yaw) * input.right) * 0.05;
  const dz = (-Math.cos(yaw) * input.forward - Math.sin(yaw) * input.right) * 0.05;
  const strain = (x: number, z: number) => Math.max(distance(actor(s, 'meng').position, [x + 2, p[1], z]),
    distance(actor(s, 'zheng').position, [x + 4, p[1], z]));
  const current = strain(p[0], p[2]);
  // A blocked participant stops the team; moving back toward the handles stays available.
  return current < 0.6 || strain(p[0] + dx, p[2] + dz) < current;
}

export function updateRescue(s: Simulation, input: Intent): void {
  const m = s.mission, meng = actor(s, 'meng'), zheng = actor(s, 'zheng'), bed = actor(s, 'zhou-cart');
  if (input.cover && (m.phase === 0 || m.phase === 2) && !s.has('rescue-zheng-approaching') && !s.has(`rescue-cover-call-${m.phase}`)) {
    s.fact('rescue-cover-requested'); s.fact(`rescue-cover-call-${m.phase}`);
    s.route(zheng, [m.phase === 0 ? [-18, 0, 203] : [-20, 0, 225]]);
    s.say('郑铎', '我到侧面压住东北口。你看着掩体走，近处那个角还得你清。', 8);
  }
  if (m.phase === 0) {
    if (!s.has('rescue-entry-cleared') && m.phaseTime >= 1.5 && !s.exposedThreat(R.entry, 52)) {
      s.fact('rescue-entry-cleared'); s.route(meng, [R.junction]); s.route(zheng, [plus(R.junction, 8, 9)]);
      s.say('周延', '第一段清了。孟齐走到设备架背后，郑铎看住北边，西货廊接应照旧。', 9);
    }
    if (s.has('rescue-entry-cleared') && at(s, R.playerAssist, 3) && ready(meng, R.junction)) {
      s.ballistics.clear(); s.phase(1, '东北支线还在开火，别走出设备架的遮护！', 'staged', '郑铎');
    }
  } else if (m.phase === 1) {
    lookWithin(s, R.junction);
    if (m.phaseTime >= 2 && !s.has('rescue-meng-hit-fired') && incoming(s, R.junction)) s.fact('rescue-meng-hit-fired');
    if (m.phaseTime >= 3 && s.has('rescue-meng-hit-fired') && !s.has('rescue-meng-wounded')) {
      s.fact('rescue-meng-wounded'); s.say('孟齐', '腿中弹了。我还清醒，先压住前面那个口。', 5);
    }
    if ((input.skip || m.phaseTime >= 6) && s.has('rescue-meng-wounded')) {
      s.ballistics.clear(); s.spawnChapterGroup('E09', R.enemyEntries[1], R.enemyPosts[1]);
      s.phase(2, '我去他另一侧。你先压住近处的火线，我到了以后再一起抬。', 'combat', '郑铎');
    }
  } else if (m.phase === 2) {
    if (quiet(s) && !s.has('rescue-zheng-approaching')) { s.fact('rescue-zheng-approaching'); s.route(zheng, [R.zhengAssist]); }
    if (quiet(s) && ready(zheng, R.zhengAssist) && at(s, R.playerAssist, 0.45) && input.interact) {
      s.fact('rescue-space-secured'); s.ballistics.clear();
      s.phase(3, '郑铎，托住另一边。孟齐，跟我们一起用力，先去挡墙里面。', 'staged', '周延');
    }
  } else if (m.phase === 3) {
    lookWithin(s, meng.position, 0.8, 0.9);
    if (input.skip || m.phaseTime >= 6) {
      makePatient(s); s.phase(4, '一起慢走。把孟齐送到西侧挡墙内，再交给转运组。', 'cooperative', '郑铎');
    }
  } else if (m.phase === 4 && at(s, R.carryEnd, 0.3) && distance(meng.position, R.cover) < 0.4
    && distance(zheng.position, plus(R.carryEnd, 4)) < 0.4) {
    s.fact('rescue-meng-under-cover'); s.ballistics.clear();
    for (const a of s.aliveEnemies) { a.goals = []; a.path = []; a.aiming = false; }
    s.phase(5, '孟齐已经在挡墙后面。周延，从旁边缺口退进来，东北支线还没停火！', 'staged', '郑铎');
  } else if (m.phase === 5) {
    if (input.skip) { finish(s, true); return; }
    lookWithin(s, R.pickup, 0.8, 0.8);
    if (at(s, R.injury, 0.08) && !s.has('rescue-zhou-hit-fired') && incoming(s, R.injury)) s.fact('rescue-zhou-hit-fired');
    if (m.phaseTime >= 7 && s.has('rescue-zhou-hit-fired')) {
      s.fact('rescue-zhou-wounded'); s.hurtFlash = 1; s.events.push({ type: 'hurt' });
      s.player.height = 0.65; s.physics.setHeight('player', 0.65);
      s.phase(6, '右侧中弹了……郑铎，我需要你帮我。', 'work', '周延');
    }
  } else if (m.phase === 6 && m.phaseTime >= 4) {
    s.fact('zhou-reported-injury'); s.fact('zhou-requested-rescue');
    s.route(actor(s, 'medic'), [plus(R.injury, -2)]);
    s.route(actor(s, 'medic-1'), [plus(R.cover, -3)]); s.route(bed, [R.injury]);
    s.phase(7, '听见了，你留在这里。孟齐已经有人接住，担架正过来，我们带你们一起回去。', 'staged', '郑铎');
  } else if (m.phase === 7) {
    if (input.skip) { finish(s, true); return; }
    lookWithin(s, actor(s, 'medic').position, 0.7, 0.65);
    if (!s.has('rescue-medics-arrived')) {
      if (ready(bed, R.injury) && ready(actor(s, 'medic'), plus(R.injury, -2)) && ready(actor(s, 'medic-1'), plus(R.cover, -3))) {
        s.fact('rescue-medics-arrived'); bed.name = '周延 · 转运担架'; m.phaseTime = 0;
        s.player.height = 1.1; s.physics.setHeight('player', 1.1);
        s.say('接应医护', '现在把你移到担架上。跟着呼吸，我们已经接住了。', 9);
      } else m.phaseTime = 0;
    } else if (m.phaseTime >= 10) {
      s.fact('rescue-both-loaded');
      s.route(meng, [R.pickup]); s.route(bed, [plus(R.pickup, 0, 6)]);
      s.route(zheng, [plus(R.pickup, 3)]); s.route(actor(s, 'medic'), [plus(R.pickup, -3)]);
      s.route(actor(s, 'medic-1'), [plus(R.pickup, -3, 6)]);
      s.phase(8, '西货廊仍然通，先上转运车。接防和护送都已经交接，不用再回头。', 'staged', '郑铎');
    }
  } else if (m.phase === 8) {
    if (input.skip) { finish(s, true); return; }
    if ([meng, bed, zheng, actor(s, 'medic'), actor(s, 'medic-1')].every(a => !a.goals.length)) {
      s.fact('rescue-transport-departed');
      s.route(meng, R.transportVia); s.route(bed, R.transportVia.map(p => plus(p, 0, 6)));
      s.route(zheng, R.transportVia.map(p => plus(p, 3))); s.route(actor(s, 'medic'), R.transportVia.map(p => plus(p, -3)));
      s.route(actor(s, 'medic-1'), R.transportVia.map(p => plus(p, -3, 6)));
      s.phase(9, '旧检修站，两名伤员在车上。孟齐腿伤，周延右侧伤；请准备接收。', 'staged', '郑铎 · 转运通信');
    }
  } else if (m.phase === 9) {
    if (input.skip) { finish(s, true); return; }
    lookWithin(s, plus(bed.position, 0, -6), 1.0, 0.9);
    if (m.phaseTime >= 15 && !s.has('rescue-medical-ack')) { s.fact('rescue-medical-ack'); s.say('接收医护 · 无线电', '两个位置已留好。进西门，直接交给我们。', 9); }
    if ([meng, bed, zheng, actor(s, 'medic'), actor(s, 'medic-1')].every(a => !a.goals.length)
      && at(s, zhouArrival(), 0.08)) finish(s, false);
  }
  if ((m.phase === 0 || m.phase === 2) && m.elapsed >= m.nextSpawn && m.spawned < 40) {
    const wave = m.phase === 0 ? 0 : 2; s.spawnChapterGroup('E09', R.enemyEntries[wave], R.enemyPosts[wave]); m.nextSpawn = m.elapsed + 20;
  }
  for (const p of R.ammo) if (input.interact && at(s, p, 1.5) && s.player.reserve < 150) { s.player.reserve = 150; s.say('补给箱', '备用弹药已补齐。'); }
}

export function rescueObjective(s: Simulation) {
  const phase = s.mission.phase; let point = R.entry, text = '', detail = '', action = '';
  if (phase === 0) {
    point = s.has('rescue-entry-cleared') ? R.playerAssist : R.entry;
    text = s.has('rescue-entry-cleared') ? '沿设备廊与同伴撤向西货廊' : '压住设备廊交叉口';
    detail = 'Q 请求郑铎掩护；他到位后会实际开火。清近处火线，再带同伴通过。';
    detail += ' 火线受控后同伴自行通过。';
  } else if (phase === 1) {
    point = R.junction;
    text = s.has('rescue-meng-wounded') ? '孟齐在交叉口负伤' : '随同伴穿过交叉口';
    detail = s.has('rescue-meng-wounded') ? '同伴正在寻找遮护。' : '留意侧面火线，跟紧队伍。';
  }
  else if (phase === 2) { point = R.playerAssist; text = '清伤员附近威胁，等郑铎到另一侧'; detail = 'Q 请求掩护。火线稳住后，郑铎会接近伤员；贴近担架左端协作。'; if (quiet(s) && ready(actor(s, 'zheng'), R.zhengAssist) && at(s, point, 0.45)) action = '协助转移孟齐'; }
  else if (phase === 3) { point = R.junction; text = '与郑铎接住孟齐'; detail = '双手正在接手担架。Enter 跳过起手动作。'; }
  else if (phase === 4) { point = R.carryEnd; text = '共同抬到西侧硬遮护'; detail = 'WASD 缓慢移动，保持队形。担架和同伴随你前进。'; }
  else if (phase === 5) { point = R.injury; text = '同伴已进遮护，继续撤入缺口'; detail = '固定剧情演出 · Enter 跳过至两人送达。'; }
  else if (phase === 6) { point = s.player.position; text = '报告自己的伤情，请求接应'; detail = '周延会主动报伤；郑铎和医护正在接应。'; }
  else if (phase === 7) { point = R.injury; text = '让同伴与医护接住你'; detail = '可以观察，Enter 跳过至两人送达。'; }
  else if (phase === 8) { point = R.pickup; text = '两名伤员交给转运车'; detail = '孟齐已获救，撤回路线仍然有效。'; }
  else { point = zhouArrival(); text = '沿西货廊送往旧检修站'; detail = '转运中可观察，Enter 跳过至送达。'; }
  return { phase: 'S10 · 共同撤回', point, text, detail, interaction: action && at(s, point) ? action : '' };
}

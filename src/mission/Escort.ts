import type { Vec3 } from '../contracts';
import { ESCORT as E } from '../content/escort-layout';
import type { Intent } from '../player/Input';
import { distance, type Actor, type Simulation } from './Simulation';
import { finishDialogue, lookWithin, playDialogue, type DialogueLine } from './Dialogue';

const REPAIR: readonly DialogueLine[] = [
  [0, '罗敬', '家里人到旧检修站了。房间和用药都确认了。我留在台上，最后这轮试机还得有人看。'],
  [6, '陆闻川 · 无线电', '老周，刚才说你只顾自己，是我说重了。你做的事我看见了。'],
  [12, '周延 · 无线电', '消息是我扣下的，这件事不用替我改。后面的情况，我们一起核对。'],
  [18, '陆闻川', '我还是生气。但那句话不公道，我收回。医院的人，我会跟孟齐送到地方。'],
];
const DECISION: readonly DialogueLine[] = [
  [0, '东货场 · 监控', '邵原已到车边。确认影像已同时发送给闻川、周延与指挥组。'],
  [10, '陆闻川', '他上车了。外侧检修路还通，观察员也没撤。现在过去，还有一次接近的机会。'],
  [18, '孟齐 · 无线电', '能抽人。但这里就得停，下一段没有别人陪。医院最后两辆车和两个陪护，都还在我这儿。'],
  [26, '周延 · 无线电', '北闸机动队正在靠近。我们能守，换班再晚一轮会怎样，现在没人能保证。'],
  [34, '孟齐 · 无线电', '许岚已经进旧检修站安置前一批了。这里是另一处病房后来转来的，不能让他们自己走。'],
  [42, '陆闻川', '我想去。但我答应罗敬他们送到地方。别抽人，按原来的安排做。'],
  [50, '周延 · 无线电', '收到。护送与接应继续，我把共同决定报给指挥组。'],
];
const a = (s: Simulation, id: string) => s.actors.find(x => x.id === id)!;
const at = (s: Simulation, p: Vec3, range = 2.8) => distance(s.player.position, p) < range && Math.abs(s.player.position[1] - p[1]) < 0.7;
const quiet = (s: Simulation, p: Vec3) => !s.exposedThreat(p, 52);
const posts = () => [E.cargo, E.bridgeHead, E.sidePlatform, E.medicalHead, E.flankPost];
const arrived = (actor: Actor, p: Vec3) => actor.released && !actor.goals.length && distance(actor.position, p) < 1.2;

export function escortPatients(s: Simulation): Actor[] {
  return [a(s, s.has('escort-patient-transferred') ? 'cart-2' : 'cart-0'), a(s, 'cart-1')];
}
function convoy(s: Simulation, leg: number): void {
  const route = E.convoyLegs[leg];
  escortPatients(s).forEach((cart, i) => {
    cart.safe = false;
    // The disabled empty bed remains physically present. The second patient
    // goes around the two-bed bay instead of driving through that parked bed.
    const bypass: Vec3[] = leg === 2 && i === 1 ? [[cart.position[0], 0, E.changeBay[2] + 5], [E.changeBay[0] - 8, 0, E.changeBay[2] + 5]] : [];
    s.route(cart, [...bypass, ...route.via, route.cartStops[i]]);
  });
  [0, 1].forEach(i => { const walker = a(s, `walker-${i}`); walker.safe = false; s.route(walker, [...route.via, route.walkerStops[i]]); });
  [a(s, 'meng'), a(s, 'relief-0'), a(s, 'relief-1')].forEach((person, i) =>
    s.route(person, [...route.via, [route.cartStops[1][0] + i * 2, route.cartStops[1][1], route.cartStops[1][2] + 3]]));
}
function convoyReady(s: Simulation, leg: number, mark = true): boolean {
  const route = E.convoyLegs[leg];
  const people = [...escortPatients(s), a(s, 'walker-0'), a(s, 'walker-1')];
  const targets = [...route.cartStops, ...route.walkerStops];
  if (mark) people.forEach((actor, i) => { if (arrived(actor, targets[i])) actor.safe = true; });
  return people.every((actor, i) => arrived(actor, targets[i]));
}
function enterFight(s: Simulation, index: number): void {
  s.phase(5 + index, ['货运坪有敌人！先清出第一段，车队留在挡墙后。', '第一桥头还有火力。守住上桥口，让后车跟上。',
    '对侧检修台能压到桥面。上侧平台，接住过桥这一段。', '医疗支路有人进来！先看桥头，转运车沿挡墙到换车湾。',
    '侧门有人试图绕到车队后面，压住侧门再处理坏轮。'][index], 'combat', '孟齐');
  s.fact(`escort-warning-${index}`); s.mission.nextSpawn = s.mission.elapsed + 11;
  if (index === 0) s.fact('escort-convoy-started');
  spawn(s, index, true);
}
function spawn(s: Simulation, index: number, first = false): void {
  const group = index < 3 ? 'E06' : 'E07';
  const total = s.actors.filter(x => x.id.startsWith(`enemy-${group}-`)).length;
  if (total >= (index < 3 ? 32 : 38) || s.aliveEnemies.length >= 8) return;
  if (!first && s.mission.elapsed < s.mission.nextSpawn) return;
  const before = s.mission.spawned;
  const n = first ? 3 : 2;
  s.spawnChapterGroup(group, E.enemyEntries[index].slice(0, n), E.enemyPosts[index].slice(0, n));
  if (s.mission.spawned > before) {
    s.fact(`escort-pressure-${index}`);
    for (let n = before; n < s.mission.spawned; n++) s.fact(`escort-sector-${index}-enemy-${group}-${n}`);
  }
  s.mission.nextSpawn = s.mission.elapsed + 14;
}

export function populateEscort(s: Simulation): void {
  s.createActor('luo', '罗敬', 'worker', E.luo); s.createActor('meng', '孟齐', 'ally', E.meng);
  s.createActor('medic', '随车医护', 'medic', E.medic);
  E.recruits.forEach((p, i) => s.createActor(`relief-${i}`, `接防队员 ${i + 1}`, 'ally', p));
  E.cartSpawns.forEach((p, i) => s.createActor(`cart-${i}`, `最后一批患者 ${i + 1}`, 'cart', p));
  s.createActor('cart-2', '备用转运车', 'cart', E.replacement);
  for (const cart of s.actors.filter(x => x.role === 'cart')) cart.yaw = -Math.PI / 2;
  E.walkerSpawns.forEach((p, i) => s.createActor(`walker-${i}`, `随车陪护 ${i + 1}`, 'civilian', p));
  s.say('罗敬', '接收记录回来了。先看名字和房间，别只看车号。');
}

export function updateEscort(s: Simulation, input: Intent): void {
  const m = s.mission;
  if (m.phase === 0 && input.interact && at(s, E.reception)) {
    s.fact('escort-families-confirmed'); s.route(a(s, 'luo'), [E.luoDesk]);
    s.phase(1, '妻子和孩子都安置好了，药也核对过。你们忙护送，我把这轮试机看完。', 'work', '罗敬');
  } else if (m.phase === 1 && m.phaseTime >= 1 && arrived(a(s, 'luo'), E.luoDesk)) {
    s.fact('luo-stays-voluntarily'); s.phase(2, REPAIR[0][2], 'staged', REPAIR[0][1]);
  } else if (m.phase === 2) {
    lookWithin(s, E.luoDesk); playDialogue(s, 'escort-repair', REPAIR);
    if (input.skip || m.phaseTime >= 24) {
      finishDialogue(s, 'escort-repair', REPAIR); s.fact('lu-retracts-accusation'); s.fact('relationship-repaired');
      s.phase(3, '东货场来了同一份确认。到监控台看原始影像。', 'work', '周延 · 无线电');
    }
  } else if (m.phase === 3 && input.interact && at(s, E.monitor)) {
    s.fact('escort-monitor-playing'); s.phase(4, DECISION[0][2], 'staged', DECISION[0][1]);
  } else if (m.phase === 4) {
    lookWithin(s, E.monitorScreen); playDialogue(s, 'escort-decision', DECISION);
    if (m.phaseTime >= 10) s.fact('shaoyuan-departure-confirmed');
    if (input.skip || m.phaseTime >= 58) {
      finishDialogue(s, 'escort-decision', DECISION);
      ['shaoyuan-departure-confirmed', 'pursuit-was-viable', 'pursuit-staffing-cost-known', 'lu-keeps-escort-promise'].forEach(f => s.fact(f));
      enterFight(s, 0);
    }
  } else if (m.phase >= 5 && m.phase <= 9) {
    const index = m.phase - 5; spawn(s, index);
    // Convoy movement overlaps the player's next fight. Reaching a later task
    // point never teleports a late patient, nor replaces an earlier route.
    if (index <= 2) convoyReady(s, 0); else convoyReady(s, 1);
    if (m.phaseTime >= 1 && at(s, posts()[index], index === 2 ? 5 : 8) && quiet(s, posts()[index]) && s.has(`escort-pressure-${index}`)
      && (index !== 2 || convoyReady(s, 0))) {
      s.fact(`escort-sector-${index}-clear`);
      if (index === 0) convoy(s, 0);
      if (index === 2) convoy(s, 1);
      if (index < 4) enterFight(s, index + 1);
      else { s.phase(10, '侧门接住了。前车轮架变形，现场修不了。先把枕头和随身卡移到空车，医护来接患者。', 'work', '孟齐'); }
    }
  } else if (m.phase === 10) {
    if (convoyReady(s, 1) && !s.has('escort-wheel-jammed')) {
      s.fact('escort-wheel-jammed'); s.route(a(s, 'medic'), [E.medic]);
    }
    if (s.has('escort-wheel-jammed') && input.interact && at(s, E.pillow)) {
      s.fact('escort-pillow-card-preserved');
      s.phase(11, '枕套里的卡还在。到床边扶住移位布，听医护口令一起移到旁边的空车。', 'cooperative', '陆闻川');
    }
  } else if (m.phase === 11) {
    const ready = at(s, E.changeAssist, 1.2) && arrived(a(s, 'medic'), E.medic);
    if (!ready) m.phaseTime = 0;
    else if (m.phaseTime >= 8) {
      s.fact('escort-patient-transferred'); a(s, 'cart-0').safe = false;
      a(s, 'cart-2').name = a(s, 'cart-0').name; a(s, 'cart-0').name = '故障空车'; convoy(s, 2);
      s.phase(12, '患者安稳了，枕头和卡也在。沿医疗桥继续走，后面的陪护跟住。', 'work', '随车医护');
    }
  } else if (m.phase === 12 && convoyReady(s, 2)) {
    s.fact('escort-convoy-arrived'); s.fact('shaoyuan-passed-dispatch');
    s.phase(13, '东货场车队已过调度站。这里还差一个陪护登记在正确的车下，去向本人核对，再交最后的名单。', 'work', '孟齐');
  } else if (m.phase === 13 && input.interact && at(s, a(s, 'walker-1').position)) {
    s.fact('escort-manifest-checked');
    [a(s, 'meng'), a(s, 'relief-0'), a(s, 'relief-1')].forEach((person, i) => s.route(person, [...E.returnVia, [E.returnExit[0], E.returnExit[1], E.returnExit[2] + i * 1.5]]));
    s.phase(14, '名单对齐了，最后两辆车与陪护都已交给医护。接防组跟我回北闸。', 'work', '孟齐');
  } else if (m.phase === 14 && [a(s, 'meng'), a(s, 'relief-0'), a(s, 'relief-1')].every(person => !person.goals.length && distance(person.position, E.returnExit) < 4)) {
    s.fact('meng-returned-for-relief'); s.phase(15, '', 'work');
    s.finish('最后一批患者与陪护实际到站，名单已核对。邵原已驶离调度站；孟齐带接防组返回北闸。');
  }
  // Finite pressure in cleared sectors walks back to its established entrance.
  // It leaves the active cap only after physically reaching that exit, alive.
  for (const enemy of s.aliveEnemies) {
    const oldSector = [0, 1, 2, 3, 4].some(i => i < m.phase - 5 && s.has(`escort-sector-${i}-${enemy.id}`));
    if (!oldSector) continue;
    if (distance(enemy.position, s.player.position) < 80) continue;
    if (!s.has(`escort-retreat-${enemy.id}`)) {
      const entries = E.enemyEntries.flat().slice().sort((x, y) => distance(enemy.position, x) - distance(enemy.position, y));
      s.route(enemy, [entries[0]]); s.fact(`escort-retreat-${enemy.id}`);
    } else if (!enemy.goals.length) { enemy.safe = true; s.physics.remove(enemy.id); }
  }
  for (const point of E.ammo) if (input.interact && at(s, point, 1.5) && s.player.reserve < 150) {
    s.player.reserve = 150; s.say('补给箱', '备用弹药已补齐。');
  }
}

export function escortObjective(s: Simulation) {
  const p = s.mission.phase;
  let point: Vec3 = E.reception, text = '', detail = '', action = '';
  if (p === 0) { text = '查看接收记录'; detail = '核对家属姓名、安置房间和用药。'; action = '确认家属已到站'; }
  else if (p === 1) { point = E.luoDesk; text = '罗敬回台继续试机'; detail = '他选择留下完成这轮工作，正在回到值班台。'; }
  else if (p === 2) { point = E.luoDesk; text = '收回不公道的话'; detail = '可以环顾。Enter 跳过对白。'; }
  else if (p === 3 || p === 4) { point = E.monitor; text = '核对东货场原始影像'; detail = p === 3 ? '周延与你收到的是同一份确认。' : '监控影像与现场分开。Enter 跳过此段。'; action = p === 3 ? '查看监控与共同报告' : ''; }
  else if (p <= 9) {
    const index = p - 5; point = posts()[index];
    text = ['清出货运坪', '守住第一桥头', '从侧平台压住对侧检修桥', '清出医疗支路', '阻止侧门绕向换车湾'][index];
    detail = index === 0 ? '从监控旁的北门去货运坪。按报点压住敌人，后方补给箱可补弹。'
      : index === 2 && !convoyReady(s, 0, false) ? '车队正在到第一桥前。守住侧平台，等最后一人到位。' : '守住当前防区，火线受控后车队会接续前进。后方补给箱可补弹。';
  } else if (p === 10) { point = E.pillow; text = '准备换车 · 带上枕头与身份卡'; detail = '车队到齐后再操作；患者不能自行下地。'; action = s.has('escort-wheel-jammed') ? '把枕头与卡移到空车' : ''; }
  else if (p === 11) { point = E.changeAssist; text = '扶住移位布，与医护一起换车'; detail = `站到床边协作 · ${Math.min(8, Math.floor(s.mission.phaseTime))}/8 秒`; }
  else if (p === 12) { point = E.arrival; text = '护送最后一批过医疗桥'; detail = '车与陪护都要到站，孟齐才可返回接防。'; }
  else if (p === 13) { point = a(s, 'walker-1').position; text = '向陪护本人核对登记'; detail = '她已跟上家属，记录仍写在另一辆车下。'; action = '确认陪护姓名与安置去向'; }
  else { point = E.exit; text = '孟齐与接防组返回北闸'; detail = '他们正在沿接防通道离开。替我看看老周的腿。'; }
  return { phase: 'S08 · 留下护送', point, text, detail, interaction: action && at(s, point) ? action : '' };
}

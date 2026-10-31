import type { Vec3 } from '../contracts';
import { TRANSFER as T } from '../content/transfer-layout';
import type { Intent } from '../player/Input';
import { distance, type Simulation } from './Simulation';
import { finishDialogue, lookWithin, playDialogue, type DialogueLine } from './Dialogue';

const actor = (s: Simulation, id: string) => s.actors.find(a => a.id === id)!;
const at = (s: Simulation, p: Vec3) => distance(s.player.position, p) < 2.8;
const inEquipmentRoom = (s: Simulation) => {
  const [x, y, z] = s.player.position, room = T.equipmentRoom;
  return x > room.minX + 0.7 && x < room.maxX - 0.7 && z > room.minZ + 0.7 && z < room.maxZ - 0.7 && Math.abs(y) < 0.6;
};
const ARGUMENT: readonly DialogueLine[] = [
  [0, '陆闻川', '你早上答应过我。你收到预告的时候，我还在下面帮罗敬找零件。'],
  [6, '周延', '是。医院的人还在走。你要是抽人去东货场，西货廊这段谁照看？'],
  [12, '陆闻川', '我问你什么时候知道，没问你能不能抽人。你连让我开口这一步也省了。'],
  [18, '陆闻川', '发现那辆车，我先报给你了。罗敬的家属要接，我也没走。你还要我做什么？'],
  [24, '周延', '我怕你在最急的时候往那边去。去年那个司机，你还记得吗？'],
  [30, '陆闻川', '我记得。我去年犯过一次错，今天就不用知道了？你可以先问我。'],
  [36, '周延', '我没这么说。医院的人现在正在通过，眼下不能散。'],
  [42, '陆闻川', '我也在帮他们开门！你到底是怕他们出事，还是怕有人不听你的？'],
  [49, '周延', '……扣住预告是我做的。这个你可以怪我。现在先把人送过去。'],
  [56, '陆闻川', '又是等做完。电源恢复了，升降机还没试完，通讯备用线也没找到。检查记录发给你。'],
  [64, '周延', '收到了。你回去继续配合。有进一步消息，我会立刻告诉你。'],
];
const ARGUMENT_FACTS = ['argument-finished', 'lu-unfair-accusation', 'zhou-admits-withholding', 'reception-report-delivered'];

export function populateTransfer(s: Simulation): void {
  s.createActor('courier', '医院联络员', 'civilian', T.courier);
  s.createActor('xu', '许岚', 'medic', T.xu);
  s.createActor('zhou', '周延', 'ally', T.zhou);
  s.createActor('luo', '罗敬', 'worker', T.returnConsole);
  T.cartSpawns.forEach((p, i) => s.createActor(`cart-${i}`, `患者转运 ${i + 1}`, 'cart', p));
  s.say('医院联络员', '闻川，西货廊的车排起来了。东边要清路，得从这道转接门过。', 10);
}

export function updateTransfer(s: Simulation, input: Intent): void {
  const m = s.mission;
  if (m.phase === 0 && input.interact && at(s, T.panel)) {
    // These are Lu's newly acquired facts, distinct from Zhou's carried knowledge.
    s.fact('lu-knows-shaoyuan-time'); s.fact('lu-knows-zhou-withheld'); s.fact('transfer-cover-open');
    s.phase(1, '邵原的车预计七点前后走。这是先前发给周延的原预告，收报时间在这里。车堵在门外了——锁杆没退回去。', 'work', '医院联络员');
  } else if (m.phase === 1 && input.interact && at(s, T.panel)) {
    s.fact('transfer-gate-open'); s.fact('lu-hand-scratched');
    T.cartSafe.forEach((target, i) => s.route(actor(s, `cart-${i}`), [...T.cartVia, target]));
    s.route(actor(s, 'xu'), [...T.cartVia, T.xuSafe]);
    s.route(actor(s, 'courier'), [T.watch]);
    s.phase(2, '锁杆退回去了。先让病人的车过。', 'work', '陆闻川');
  } else if (m.phase === 2) {
    T.cartSafe.forEach((target, i) => {
      const cart = actor(s, `cart-${i}`);
      if (cart.released && !cart.goals.length && distance(cart.position, target) < 1.2) cart.safe = true;
    });
    const xu = actor(s, 'xu');
    if (distance(xu.position, T.gate) < 5 && !s.has('xu-sees-scratch')) {
      s.fact('xu-sees-scratch'); s.say('许岚', '手怎么划的？先洗干净。我得跟这批车走。', 7);
    }
    if (xu.released && !xu.goals.length && distance(xu.position, T.xuSafe) < 1.2) {
      xu.safe = true; s.fact('xu-passed-transfer');
    }
    if (s.actors.filter(a => a.role === 'cart').every(a => a.safe) && xu.safe) {
      s.fact('transfer-patients-through');
      // A late observer still receives the mother's hand-care instruction.
      s.fact('xu-sees-scratch');
      s.phase(3, '你早就知道了，对吧？……我到二号设备间来。', 'work', '陆闻川 · 无线电');
    }
  } else if (m.phase === 3 && m.phaseTime >= 1 && inEquipmentRoom(s)) {
    actor(s, 'zhou').yaw = Math.atan2(s.player.position[0] - T.zhou[0], s.player.position[2] - T.zhou[2]);
    s.ballistics.clear(); s.phase(4, ARGUMENT[0][2], 'staged', ARGUMENT[0][1]);
  } else if (m.phase === 4) {
    lookWithin(s, T.zhou); playDialogue(s, 'argument-line', ARGUMENT);
    if (input.skip || m.phaseTime >= 71) {
      finishDialogue(s, 'argument-line', ARGUMENT); ARGUMENT_FACTS.forEach(f => s.fact(f));
      s.player.health = 100; s.player.hurtAt = m.elapsed - 7;
      s.phase(5, '那条旁路找到了。先把手洗净包上，再戴手套下去。', 'work', '罗敬');
    }
  } else if (m.phase === 5 && input.interact && at(s, T.wash)) {
    s.fact('transfer-hand-treated'); s.fact('lu-continues-duty'); s.fact('source-timestamp-shared');
    s.route(actor(s, 'luo'), [T.exit]);
    s.phase(6, '机动队正在集结，东货场的车尚未动身。来源和收到时间都附在后面。', 'work', '周延 · 新报告');
  } else if (m.phase === 6 && at(s, T.exit) && distance(actor(s, 'luo').position, T.exit) < 1.2) {
    s.phase(7, '', 'work');
    s.finish('患者和许岚已通过转接门。闻川说出了伤人的话，也交出了检查记录；处理好手伤后，他跟罗敬继续下层工作。');
  }
}

export function transferObjective(s: Simulation) {
  const phase = s.mission.phase;
  const points = [T.panel, T.panel, T.watch, T.equipment, T.zhou, T.wash, T.exit, T.exit];
  const point: Vec3 = points[phase];
  const count = s.actors.filter(a => a.role === 'cart' && a.safe).length;
  const [text, action, detail] = [
    ['检查转接门控制盒', '打开控制盒', '医院联络员在门旁。先看清锁杆停住的原因。'],
    ['释放卡住的锁杆', '顶回锁杆，重新开门', '用短柄扳手托住，联络员重新操作。'],
    [`让患者通过 · ${count}/3`, '', '让开车道，照看车与许岚安全通过；这批到齐后再去设备间。'],
    ['到二号设备间找周延', '', '绕过隔墙南端，从西门进入设备间；周延已经在里面等你。'],
    ['把没有说清的话说完', '', '可以环顾。Enter 跳过此段对话。'],
    ['回去处理手伤', '清洗、包扎并戴回手套', '罗敬还在等你一起看通讯旁路。'],
    ['跟罗敬继续下层工作', '', '新的报告带着来源与时间。争执之后，工作仍要继续。'],
    ['转接门与争执', '', ''],
  ][phase];
  return { phase: 'S06 · 转接门与争执', text, detail, point, interaction: action && at(s, point) ? action : '' };
}

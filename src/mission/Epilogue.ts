import type { Vec3 } from '../contracts';
import { EPILOGUE as E } from '../content/epilogue-layout';
import type { Intent } from '../player/Input';
import { distance, type Simulation } from './Simulation';
import { finishDialogue, playDialogue, type DialogueLine } from './Dialogue';

const REPORT: readonly DialogueLine[] = [
  [0, '陆闻川', '护送人员已经送到，北闸完成了接防。邵原已经离开调度区，我们没能截住他。'],
  [8, '陆闻川', '周延……'],
  [11, '郑铎', '周延在撤回中负伤，抢救失败。孟齐已经送到，仍在治疗。转运通路保住了。'],
  [19, '陆闻川', '记录按实际情况发出去。医疗需求我带到接收终端。'],
];
const BERTH: readonly DialogueLine[] = [
  [0, '罗敬', '这批泊位和清出来的通路都核对过了。医疗优先，首批装卸的人已经在门外。'],
  [7, '舰队联络', '接收信号确认，医疗需求已登记。第一梯队开始进场。'],
  [13, '罗敬', '闻川，门口这边帮我扶一下，让他们把东西先送进去。'],
];
const at = (s: Simulation, p: Vec3, r = 2.2) => distance(s.player.position, p) < r;
const a = (s: Simulation, id: string) => s.actors.find(x => x.id === id)!;
export function populateEpilogue(s: Simulation): void {
  s.createActor('zheng', '郑铎', 'ally', E.zheng); s.createActor('luo', '罗敬', 'worker', E.luo);
  E.workersSpawns.forEach((p, i) => s.createActor(`worker-${i}`, i === 0 ? '首批装卸员' : i === 1 ? '医疗物资员' : '接收技工', 'worker', p));
  s.createActor('supply-cart', '首批医疗物资', 'cart', [E.workersSpawns[2][0] + 3, 0, E.workersSpawns[2][2] + 3]);
  // Standalone replay starts after the confirmed treatment result; campaign carries the same facts.
  ['zhou-death-confirmed', 'meng-treatment-continues', 'medical-needs-recorded', 'reception-contact-received'].forEach(f => s.fact(f));
  s.say('郑铎', '记录在这里。我和你一起，把接防、伤亡和医疗需求都按实际情况报。', 9);
}
export function updateEpilogue(s: Simulation, input: Intent): void {
  const m = s.mission;
  if (m.phase === 0 && input.interact && at(s, E.report)) {
    s.phase(1, REPORT[0][2], 'staged', REPORT[0][1]);
  } else if (m.phase === 1) {
    playDialogue(s, 'epilogue-report-line', REPORT);
    if (input.skip || m.phaseTime >= 25) {
      finishDialogue(s, 'epilogue-report-line', REPORT);
      ['truthful-report-sent', 'report-includes-losses', 'report-includes-shaoyuan-escape', 'lu-accepts-zheng-report-help'].forEach(f => s.fact(f));
      s.phase(2, '需求单已和记录合在一起，去接收中心正式登记。', 'work', '郑铎');
    }
  } else if (m.phase === 2 && input.interact && at(s, E.needs)) {
    s.fact('medical-needs-carried'); s.route(a(s, 'zheng'), E.shoreVia);
    s.phase(3, '安全岸路仍通，顺着灯线回C03。北面还在交火，我们先把眼前这一批接住。', 'work', '郑铎');
  } else if (m.phase === 3) {
    // Shore progress records eastward crossings, not mandatory visits to invisible
    // five-metre circles. A player taking a valid parallel lane need not backtrack.
    E.shoreVia.forEach((point, i) => {
      if (s.player.position[0] >= point[0] - 5) s.fact(`shore-waypoint-${i}`);
    });
    if (E.shoreVia.every((_, i) => s.has(`shore-waypoint-${i}`)) && at(s, E.reception)) {
      s.fact('reception-reached'); s.phase(4, '我在这边。把医疗单录到终端，泊位清单已经核好。', 'work', '罗敬');
    }
  } else if (m.phase === 4 && input.interact && at(s, E.terminal)) {
    s.fact('medical-needs-delivered'); s.fact('berth-manifest-confirmed');
    s.phase(5, BERTH[0][2], 'staged', BERTH[0][1]);
  } else if (m.phase === 5) {
    playDialogue(s, 'epilogue-berth-line', BERTH);
    if (input.skip || m.phaseTime >= 19) {
      finishDialogue(s, 'epilogue-berth-line', BERTH); s.fact('fleet-reception-acknowledged'); s.fact('first-wave-approaching');
      s.phase(6, '到门边扶住这一侧，让装卸人员和医疗物资先过。', 'work', '罗敬');
    }
  } else if (m.phase === 6 && input.interact && at(s, E.holdDoor, 1.0)) {
    s.fact('reception-door-open'); s.phase(7, '门扶住了。慢一点，前面的人先过。', 'cooperative', '陆闻川');
  } else if (m.phase === 7) {
    if (m.phaseTime >= 2 && !s.has('first-workers-entering')) {
      s.fact('first-workers-entering');
      E.workersGoals.forEach((p, i) => s.route(a(s, `worker-${i}`), [[E.door[0], 0, E.door[2] + 4], E.door, p]));
      s.route(a(s, 'supply-cart'), [[-4, 0, 12], [-4, 0, 5], E.door, [-4, 0, -6]]);
    }
    const received = E.workersGoals.every((p, i) => !a(s, `worker-${i}`).goals.length && distance(a(s, `worker-${i}`).position, p) < 0.12)
      && !a(s, 'supply-cart').goals.length && a(s, 'supply-cart').position[2] < -5;
    if (s.has('first-workers-entering') && received && at(s, E.holdDoor, 1.3)) {
      s.fact('first-workers-received'); s.fact('first-medical-supplies-received');
      for (const id of ['worker-0', 'worker-1', 'worker-2', 'supply-cart']) a(s, id).safe = true;
      s.phase(8, '', 'work'); s.finish('首批接收人员和医疗物资已经通过入口。援军开始进场，战争尚未结束；闻川与同伴继续接收下一班。');
    }
  }
}
export function epilogueObjective(s: Simulation) {
  const p = s.mission.phase; let point = E.report, text = '', detail = '', action = '';
  if (p === 0) { text = '与郑铎如实汇报'; detail = '包括接防、伤亡、邵原离开及当前通路。'; action = '核对并发送实际报告'; }
  else if (p === 1) { text = '把完整情况交给同伴'; detail = 'Enter 跳过汇报。'; }
  else if (p === 2) { point = E.needs; text = '带上医疗需求单'; detail = '保温、血液制品、器械，优先列入接收。'; action = '带走需求单'; }
  else if (p === 3) { point = E.shoreVia.find((_, i) => !s.has(`shore-waypoint-${i}`)) ?? E.reception; text = '沿安全岸路回到C03'; detail = '顺着接收灯线往东，路经已保住的货运区。'; }
  else if (p === 4) { point = E.terminal; text = '登记医疗需求，确认接收泊位'; detail = '罗敬正在接收台。'; action = '交付需求，确认泊位'; }
  else if (p === 5) { point = E.terminal; text = '等待第一梯队回执'; detail = '援军开始进场，战争尚未结束。Enter 跳过通信。'; }
  else { point = E.holdDoor; text = p === 6 ? '扶门，让第一批人通过' : '守在门边，接住第一批人和物资'; detail = '最后的接收动作由你完成。'; if (p === 6 && at(s, point, 1)) action = '打开并扶住接收门'; }
  return { phase: 'S12 · 进场之前', point, text, detail, interaction: action && at(s, point) ? action : '' };
}

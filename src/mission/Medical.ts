import type { Vec3 } from '../contracts';
import { MEDICAL as M } from '../content/medical-layout';
import type { Intent } from '../player/Input';
import { distance, type Simulation } from './Simulation';
import { finishDialogue, lookWithin, playDialogue, type DialogueLine } from './Dialogue';

const VISIT: readonly DialogueLine[] = [
  [0, '接诊医师', '两个人都接到了。孟齐的腿还要处理；周延伤得更重，我们正在救治。你站在这边，别挡住器械。'],
  [8, '陆闻川', '哥，是我。装备和记录都交过去了。孟齐也在这里。'],
  [16, '周延', '……听见了。'],
  [22, '接诊医师', '先别说话，跟着呼吸。闻川，接下来让我们操作，你在外面等。'],
];
const CARE: readonly DialogueLine[] = [
  [0, '护理员', '把帘子拉上。器械从这边递进来，留出通道。'],
  [18, '许岚', '你刚才交的东西都在登记台，不会弄丢。先坐一会儿。'],
  [40, '接诊医师', '我们已经尽力抢救。周延没能救回来，死亡已经确认。'],
  [48, '接诊医师', '孟齐还在继续治疗。你们把人送到了，这条路没有白保。'],
];
const COMPANY: readonly DialogueLine[] = [
  [0, '陆闻川', '许岚，你也先坐一下。我把水放这里。'],
  [6, '许岚', '好。我缓一会儿，下一班马上接进来。'],
  [12, '郑铎', '闻川，接收台来问情况。记录我带着，等会儿我和你一起说。'],
];
const a = (s: Simulation, id: string) => s.actors.find(x => x.id === id)!;
const at = (s: Simulation, p: Vec3, radius = 2.2) => distance(s.player.position, p) < radius;
const dock = (s: Simulation, id: string, p: Vec3) => !a(s, id).goals.length && distance(a(s, id).position, p) < 0.12;
function skipTo(s: Simulation, id: string, p: Vec3): void {
  const actor = a(s, id); actor.position = [...p]; actor.goals = []; actor.path = []; s.physics.teleport(id, p);
}

export function populateMedical(s: Simulation): void {
  s.createActor('zhou', '周延 · 救治中', 'cart', M.zhouBed);
  s.createActor('meng', '孟齐 · 治疗中', 'cart', M.mengBed);
  s.createActor('doctor', '接诊医师', 'medic', M.doctor);
  s.createActor('nurse', '护理员', 'medic', M.nurse);
  s.createActor('xu', '许岚', 'medic', M.xu);
  s.createActor('zheng', '郑铎', 'ally', [M.registration[0] + 3, 0, M.registration[2]]);
  // Isolated chapter entry states its own observed arrival; it does not invent Lu's private knowledge.
  s.fact('rescue-both-received'); s.fact('meng-treatment-continues');
  s.say('郑铎', '闻川，两个人都进去了。这是周延的装备，接收单也在；先交给登记台。', 10);
}
export function updateMedical(s: Simulation, input: Intent): void {
  const m = s.mission;
  if (m.control === 'work' && at(s, M.mengVisit) && input.interact && !s.has('medical-meng-visited')) {
    s.fact('medical-meng-visited'); s.say('孟齐', '闻川……西货廊还通着。他们把我接住了。', 7);
  }
  if (m.phase === 0 && input.interact && at(s, M.registration)) {
    s.fact('medical-equipment-carried'); s.phase(1, '放到里侧的交接台。名字和接收单要放在一起。', 'work', '登记护理员');
  } else if (m.phase === 1 && input.interact && at(s, M.equipment)) {
    s.fact('medical-equipment-handed-over'); s.phase(2, '装备登记好了。把已经整理过的伤情和转运记录交给医师。', 'work', '登记护理员');
  } else if (m.phase === 2 && input.interact && at(s, M.recordDesk)) {
    s.fact('medical-records-delivered'); s.phase(3, '我收到记录了。可以过去看一眼，从标线旁边走。', 'work', '接诊医师');
  } else if (m.phase === 3 && at(s, M.zhouVisit, 1.2) && m.phaseTime >= 1) {
    s.phase(4, VISIT[0][2], 'staged', VISIT[0][1]);
  } else if (m.phase === 4) {
    lookWithin(s, M.zhouBed, 1.0, 0.75); playDialogue(s, 'medical-visit-line', VISIT);
    if (m.phaseTime >= 16) s.fact('medical-zhou-responsive');
    if (input.skip || m.phaseTime >= 30) {
      finishDialogue(s, 'medical-visit-line', VISIT); s.fact('medical-zhou-responsive'); s.fact('medical-curtain-closed');
      s.route(a(s, 'nurse'), M.nurseRoute); s.route(a(s, 'doctor'), M.doctorRoute);
      s.phase(5, '让出帘边通道，医护还需要继续处理。你可以看看旁边的安置区。', 'work', '许岚');
    }
  } else if (m.phase === 5 && m.phaseTime >= 8
    && !a(s, 'doctor').goals.length && !a(s, 'nurse').goals.length) {
    s.fact('medical-treatment-attempted'); s.phase(6, CARE[0][2], 'staged', CARE[0][1]);
  } else if (m.phase === 6) {
    if (m.phaseTime >= 28 && !s.has('medical-doctor-returning')) {
      s.fact('medical-doctor-returning'); s.route(a(s, 'doctor'), [M.doctorTalk]);
    }
    if (m.phaseTime >= 40 && !dock(s, 'doctor', M.doctorTalk)) m.phaseTime = 39.9;
    if (input.skip) {
      skipTo(s, 'doctor', M.doctorTalk); s.fact('medical-doctor-returning');
      finishDialogue(s, 'medical-care-line', CARE);
    } else playDialogue(s, 'medical-care-line', CARE);
    if (input.skip || m.phaseTime >= 40) {
      s.fact('zhou-death-confirmed'); s.fact('medical-curtain-open');
      a(s, 'zhou').name = '周延 · 已确认死亡';
    }
    if (input.skip || m.phaseTime >= 55) {
      s.phase(7, '许岚在旁边连续工作了很久。先陪她停一会儿，郑铎会替你接住联络。', 'work', '郑铎');
    }
  } else if (m.phase === 7 && input.interact && at(s, M.rest)) {
    s.route(a(s, 'xu'), [[M.rest[0] + 0.7, 0, M.rest[2]]]);
    s.phase(8, COMPANY[0][2], 'staged', COMPANY[0][1]);
  } else if (m.phase === 8) {
    if (a(s, 'xu').goals.length) { m.phaseTime = 0; return; }
    playDialogue(s, 'medical-company-line', COMPANY); lookWithin(s, a(s, 'xu').position, 1.0, 0.75);
    if (input.skip || m.phaseTime >= 18) {
      finishDialogue(s, 'medical-company-line', COMPANY);
      ['xu-rest-accepted', 'lu-accepts-help', 'medical-needs-recorded'].forEach(f => s.fact(f));
      s.phase(9, '缺的保温物资、血液制品和器械都在这张单上。带到接收台，按实际情况报。', 'work', '许岚');
    }
  } else if (m.phase === 9) {
    if (m.phaseTime >= 4 && !s.has('reception-contact-received')) {
      s.fact('reception-contact-received'); s.route(a(s, 'zheng'), [[M.exit[0] + 2, 0, M.exit[2]]]);
      s.say('罗敬 · 通信', '接收台还在。泊位清单需要你们的实际情况，医疗需求也一起带过来。', 8);
    }
    if (s.has('reception-contact-received') && m.phaseTime >= 12 && at(s, M.exit) && !a(s, 'zheng').goals.length) {
      s.phase(10, '', 'work'); s.finish('医师已经明确确认周延死亡，孟齐仍在治疗。闻川把装备和记录交出，接受同伴帮助，带上医疗需求继续接收工作。');
    }
  }
}
export function medicalObjective(s: Simulation) {
  const p = s.mission.phase; let point = M.registration, text = '', detail = '', action = '';
  if (p === 0) { text = '接过装备与交接单'; detail = '两名伤员已经送抵，医护正在接手。'; action = '接过周延的装备'; }
  else if (p === 1) { point = M.equipment; text = '把装备放到交接台'; detail = '带着箱子走到登记区里侧。'; action = '放下装备与姓名单'; }
  else if (p === 2) { point = M.recordDesk; text = '交付伤情和转运记录'; detail = '报告已有事实，治疗由医护决定。'; action = '交付记录'; }
  else if (p === 3) { point = M.zhouVisit; text = '到允许的探视位置'; detail = '走近即可探视，不挡器械和医护通道。'; }
  else if (p === 4) { point = M.zhouBed; text = '短暂探视'; detail = 'Enter 跳过本段，保留相同信息。'; }
  else if (p === 5) { point = M.doctorTalk; text = '退到帘外，让出救治空间'; detail = '医护到位后自行继续操作，可以看望旁边的孟齐。'; }
  else if (p === 6) { point = M.doctorTalk; text = '救治仍在进行'; detail = '短时间过渡 · Enter 跳过至医师说明结果。'; }
  else if (p === 7) { point = M.rest; text = '陪许岚短暂歇一会儿'; detail = '周延死亡已确认，孟齐继续治疗。'; action = '放下水，陪她坐一会儿'; }
  else if (p === 8) { point = M.rest; text = '接受同伴帮助'; detail = 'Enter 跳过这段陪伴。'; }
  else { point = s.has('reception-contact-received') ? M.exit : M.radio; text = s.has('reception-contact-received') ? '带上需求单，与郑铎回接收台' : '接收台正在联络'; detail = '罗敬会通过通信联络你；按实际情况继续工作。'; }
  return { phase: 'S11 · 救护点', point, text, detail, interaction: action && at(s, point) ? action : '' };
}

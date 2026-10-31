import { SCENARIO_IDS, type CharacterRole, type ScenarioId } from '../contracts';
import { CHAPTER_STAGES, SCENARIO_PHASE_LIMITS, type ChapterProgress } from '../content/chapter-flow';
import { HISTORY } from '../content/history-layout';
import { EPILOGUE } from '../content/epilogue-layout';
import type { Snapshot } from '../mission/Simulation';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export type SaveSlot = 'campaign' | ScenarioId;
export interface GameSettings { sensitivity: number; volume: number; lowMotion: boolean; touchControls?: boolean }
export interface SaveResult { ok: boolean; error?: string }
export interface SavedGame { snapshot: Snapshot; chapter?: ChapterProgress; savedAt: number }
export interface LoadResult { save?: SavedGame; warning?: string }
export interface SettingsResult { settings: GameSettings; warning?: string }

export const DEFAULT_SETTINGS: Readonly<GameSettings> = Object.freeze({ sensitivity: 1, volume: 0.7, lowMotion: false });
export const SAVE_KEY_PREFIX = 'ganymede.save.';
export const SETTINGS_KEY = 'ganymede.settings';
const VERSION = 1;
const MAX_RECORD_LENGTH = 1_000_000;
const MAX_SECONDS = 7 * 24 * 60 * 60;
const MAX_COORDINATE = 10_000;

interface SaveEnvelope extends SavedGame { schema: 'ganymede-save'; version: 1; slot: SaveSlot }
interface SettingsEnvelope { schema: 'ganymede-settings'; version: 1; savedAt: number; settings: GameSettings }
class InvalidRecord extends Error {}
class FutureVersion extends InvalidRecord {}

function record(value: unknown, label: string, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new InvalidRecord(`${label}结构不完整。`);
  const object = value as Record<string, unknown>;
  if (required.some(key => !Object.hasOwn(object, key))) throw new InvalidRecord(`${label}缺少必需字段。`);
  if (Object.keys(object).some(key => !required.includes(key) && !optional.includes(key))) throw new InvalidRecord(`${label}包含不支持的字段。`);
  return object;
}
function numeric(value: unknown, label: string, min: number, max: number, integer = false): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isSafeInteger(value))) {
    throw new InvalidRecord(`${label}数值无效或超出范围。`);
  }
}
function text(value: unknown, label: string, max: number, allowEmpty = false): asserts value is string {
  if (typeof value !== 'string' || value.length > max || (!allowEmpty && value.trim().length === 0)) throw new InvalidRecord(`${label}文字无效。`);
}
function boolean(value: unknown, label: string): asserts value is boolean {
  if (typeof value !== 'boolean') throw new InvalidRecord(`${label}必须为布尔值。`);
}
function list(value: unknown, label: string, max: number): asserts value is unknown[] {
  if (!Array.isArray(value) || value.length > max) throw new InvalidRecord(`${label}列表无效或过长。`);
  for (let i = 0; i < value.length; i++) if (!Object.hasOwn(value, i)) throw new InvalidRecord(`${label}列表存在缺失项。`);
}
function vector(value: unknown, label: string): void {
  list(value, label, 3);
  if (value.length !== 3) throw new InvalidRecord(`${label}需要三个坐标。`);
  value.forEach(coordinate => numeric(coordinate, label, -MAX_COORDINATE, MAX_COORDINATE));
}
function scenario(value: unknown): asserts value is ScenarioId {
  if (typeof value !== 'string' || !(SCENARIO_IDS as readonly string[]).includes(value)) throw new InvalidRecord('场景标识不受支持。');
}
function validateSlot(slot: unknown): asserts slot is SaveSlot { if (slot !== 'campaign') scenario(slot); }

function validateSnapshot(value: unknown): Snapshot {
  const snapshot = record(value, '快照', ['schema', 'player', 'actors', 'mission', 'random', 'hits', 'kills']);
  if (typeof snapshot.schema === 'number' && snapshot.schema > 1) throw new FutureVersion('快照来自更新版本，当前版本不能使用。');
  if (snapshot.schema !== 1) throw new InvalidRecord('快照版本不受支持。');
  numeric(snapshot.random, '随机状态', 0, 0xffffffff, true);
  numeric(snapshot.hits, '命中数', 0, 10_000_000, true);
  numeric(snapshot.kills, '击杀数', 0, 10_000_000, true);
  const player = record(snapshot.player, '玩家', ['position', 'yaw', 'pitch', 'health', 'ammo', 'reserve', 'height', 'crouched', 'reload', 'cooldown', 'hurtAt', 'walk', 'recoil', 'ads', 'name']);
  vector(player.position, '玩家位置');
  numeric(player.yaw, '玩家朝向', -1_000_000, 1_000_000);
  numeric(player.pitch, '玩家俯仰', -Math.PI / 2, Math.PI / 2);
  numeric(player.health, '玩家生命', 0, 100);
  numeric(player.ammo, '弹匣', 0, 25, true);
  numeric(player.reserve, '备用弹药', 0, 10_000, true);
  numeric(player.reload, '装填时间', 0, 60);
  numeric(player.cooldown, '武器冷却', 0, 60);
  numeric(player.hurtAt, '受伤时间', -MAX_SECONDS, MAX_SECONDS);
  numeric(player.walk, '步态', 0, 1_000_000_000);
  numeric(player.recoil, '后坐', 0, 20);
  boolean(player.crouched, '蹲姿'); boolean(player.ads, '瞄准'); text(player.name, '玩家姓名', 120);

  const mission = record(snapshot.mission, '任务', ['scenario', 'phase', 'elapsed', 'phaseTime', 'control', 'facts', 'complete', 'failed', 'checkpointLabel', 'subtitle', 'speaker', 'subtitleUntil', 'spawned', 'nextSpawn']);
  scenario(mission.scenario);
  numeric(mission.phase, '任务阶段', 0, SCENARIO_PHASE_LIMITS[mission.scenario], true);
  numeric(player.height, '玩家高度', (mission.scenario === 'mainhall' && mission.phase >= 4)
    || (mission.scenario === 'rescue' && mission.phase >= 6) ? 0.65 : 0.8, 3);
  if (mission.scenario === 'childhood' && player.height !== 1.1) throw new InvalidRecord('童年视点高度与角色不一致。');
  if (mission.scenario === 'mainhall' && mission.phase >= 4 && player.height !== 0.65) throw new InvalidRecord('主厅演出高度与角色状态不一致。');
  if (mission.scenario === 'relief' && mission.phase === 7 && player.height !== 1.1) throw new InvalidRecord('内门坐姿高度与角色状态不一致。');
  numeric(mission.elapsed, '场景用时', 0, MAX_SECONDS);
  numeric(mission.phaseTime, '阶段用时', 0, mission.elapsed + 0.0001);
  numeric(mission.subtitleUntil, '字幕时间', 0, MAX_SECONDS + 3600);
  numeric(mission.nextSpawn, '增援时间', 0, MAX_SECONDS + 3600);
  numeric(mission.spawned, '入场人数', 0, 10_000, true);
  if (typeof mission.control !== 'string' || !['combat', 'work', 'cooperative', 'staged'].includes(mission.control)) throw new InvalidRecord('控制权枚举无效。');
  boolean(mission.complete, '完成状态'); boolean(mission.failed, '失败状态');
  if (mission.complete && mission.failed) throw new InvalidRecord('任务不能同时完成和失败。');
  text(mission.checkpointLabel, '检查点名称', 160);
  text(mission.subtitle, '字幕', 2000, true); text(mission.speaker, '说话者', 120, true);
  list(mission.facts, '任务事实', 256);
  const facts = mission.facts;
  mission.facts.forEach(fact => text(fact, '任务事实', 120));
  if (new Set(mission.facts).size !== mission.facts.length) throw new InvalidRecord('任务事实重复。');
  // The patient keeps their identity while changing physical cart. A mismatched
  // occupancy fact would wait forever for the empty cart left at the exchange bay.
  if (mission.scenario === 'escort' && mission.facts.includes('escort-patient-transferred') !== (mission.phase >= 12)) {
    throw new InvalidRecord('患者换车状态与护送阶段不一致。');
  }
  if (mission.scenario === 'relief' && mission.facts.includes('relief-handover-complete') !== (mission.phase >= 4)) {
    throw new InvalidRecord('接防交接状态与撤回阶段不一致。');
  }
  if (mission.scenario === 'rescue') {
    // Injuries belong to the authored rescue, not ordinary combat death. These
    // milestones also select the patient's collider and the player's body pose.
    const milestones: Array<[string, number]> = [
      ['rescue-meng-lifted', 4], ['rescue-meng-under-cover', 5], ['rescue-zhou-wounded', 6],
      ['zhou-reported-injury', 7], ['zhou-requested-rescue', 7], ['rescue-both-loaded', 8],
      ['rescue-transport-departed', 9], ['rescue-both-received', 10],
    ];
    for (const [fact, phase] of milestones) if (mission.facts.includes(fact) !== (mission.phase >= phase)) {
      throw new InvalidRecord(`救援状态 ${fact} 与阶段不一致。`);
    }
    if ((mission.phase >= 2 && !mission.facts.includes('rescue-meng-wounded'))
      || (mission.phase < 1 && mission.facts.includes('rescue-meng-wounded'))
      || (mission.phase >= 8 && !mission.facts.includes('rescue-medics-arrived'))
      || (mission.phase < 7 && mission.facts.includes('rescue-medics-arrived'))) {
      throw new InvalidRecord('救援伤情或接应事实与阶段不一致。');
    }
    const controls = ['combat', 'staged', 'combat', 'staged', 'cooperative', 'staged', 'work', 'staged', 'staged', 'staged', 'staged'];
    if (mission.control !== controls[mission.phase]) throw new InvalidRecord('救援控制权与阶段不一致。');
    if (mission.phase >= 6) {
      const height = mission.facts.includes('rescue-medics-arrived') ? 1.1 : 0.65;
      if (player.height !== height) throw new InvalidRecord('救援伤后视点高度与接应状态不一致。');
    }
    if (mission.phase >= 5 && (mission.failed || player.health <= 0)) throw new InvalidRecord('固定救援伤情不能变成普通战斗失败。');
    if (mission.complete !== (mission.phase === 10)) throw new InvalidRecord('救援完成状态与送达阶段不一致。');
  }
  if (mission.scenario === 'medical') {
    const milestones: Array<[string, number]> = [
      ['medical-equipment-carried', 1], ['medical-equipment-handed-over', 2], ['medical-records-delivered', 3],
      ['medical-curtain-closed', 5], ['medical-treatment-attempted', 6], ['xu-rest-accepted', 9],
      ['lu-accepts-help', 9], ['medical-needs-recorded', 9],
    ];
    for (const [fact, phase] of milestones) if (mission.facts.includes(fact) !== (mission.phase >= phase)) {
      throw new InvalidRecord(`医疗交接状态 ${fact} 与阶段不一致。`);
    }
    const responsive = mission.phase > 4 || mission.phase === 4 && mission.phaseTime >= 16;
    const deathConfirmed = mission.phase > 6 || mission.phase === 6 && mission.phaseTime >= 40;
    if (mission.facts.includes('medical-zhou-responsive') !== responsive
      || mission.facts.includes('zhou-death-confirmed') !== deathConfirmed
      || mission.facts.includes('medical-curtain-open') !== deathConfirmed
      || !mission.facts.includes('rescue-both-received') || !mission.facts.includes('meng-treatment-continues')) {
      throw new InvalidRecord('医疗人物结果与救治阶段不一致。');
    }
    if ((mission.phase < 9 && mission.facts.includes('reception-contact-received'))
      || (mission.phase === 10 && !mission.facts.includes('reception-contact-received'))) {
      throw new InvalidRecord('医疗联络状态与离开阶段不一致。');
    }
    const control = [4, 6, 8].includes(mission.phase) ? 'staged' : 'work';
    if (mission.control !== control || mission.failed || player.health <= 0) throw new InvalidRecord('医疗段落不能进入作战或操作失败状态。');
    if (mission.complete !== (mission.phase === 10)) throw new InvalidRecord('医疗完成状态与离开阶段不一致。');
  }
  if (mission.scenario === 'epilogue') {
    const milestones: Array<[string, number]> = [
      ['truthful-report-sent', 2], ['report-includes-losses', 2], ['report-includes-shaoyuan-escape', 2],
      ['lu-accepts-zheng-report-help', 2], ['medical-needs-carried', 3], ['reception-reached', 4],
      ['medical-needs-delivered', 5], ['berth-manifest-confirmed', 5], ['fleet-reception-acknowledged', 6],
      ['first-wave-approaching', 6], ['reception-door-open', 7], ['first-workers-received', 8],
      ['first-medical-supplies-received', 8],
    ];
    for (const [fact, phase] of milestones) if (mission.facts.includes(fact) !== (mission.phase >= phase)) {
      throw new InvalidRecord(`接收状态 ${fact} 与阶段不一致。`);
    }
    if (['zhou-death-confirmed', 'meng-treatment-continues', 'medical-needs-recorded', 'reception-contact-received']
      .some(fact => !facts.includes(fact))) throw new InvalidRecord('尾声缺少已确认的医疗与联络信息。');
    if ((mission.phase < 7 && mission.facts.includes('first-workers-entering'))
      || (mission.phase === 8 && !mission.facts.includes('first-workers-entering'))) {
      throw new InvalidRecord('接收人员入场状态与开门阶段不一致。');
    }
    let missingWaypoint = false;
    for (let i = 0; i < EPILOGUE.shoreVia.length; i++) {
      const visited = facts.includes(`shore-waypoint-${i}`);
      if (visited && (mission.phase < 3 || missingWaypoint) || !visited && mission.phase >= 4) {
        throw new InvalidRecord('安全岸路经过顺序与接收位置不一致。');
      }
      if (!visited) missingWaypoint = true;
    }
    const control = [1, 5].includes(mission.phase) ? 'staged' : mission.phase === 7 ? 'cooperative' : 'work';
    if (mission.control !== control || mission.failed || player.health <= 0) throw new InvalidRecord('接收尾声不能进入作战或操作失败状态。');
    if (mission.complete !== (mission.phase === 8)) throw new InvalidRecord('接收完成状态与首批到达阶段不一致。');
  }

  list(snapshot.actors, '人物', 256);
  const actors = new Map<string, Record<string, unknown>>();
  for (const value of snapshot.actors) {
    const actor = record(value, '人物', ['id', 'name', 'role', 'position', 'health', 'yaw', 'goals', 'path', 'walk', 'aiming', 'aimTime', 'cooldown', 'safe', 'released', 'down']);
    text(actor.id, '人物 ID', 80); text(actor.name, '人物姓名', 120);
    if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(actor.id) || actor.id === 'player' || actors.has(actor.id)) throw new InvalidRecord('人物 ID 重复、非法或与玩家冲突。');
    if (typeof actor.role !== 'string' || !['enemy', 'ally', 'worker', 'father', 'child', 'medic', 'civilian', 'opponent', 'cart'].includes(actor.role)) throw new InvalidRecord('人物类型不受支持。');
    vector(actor.position, '人物位置');
    numeric(actor.health, '人物生命', -1000, 1000); numeric(actor.yaw, '人物朝向', -1_000_000, 1_000_000);
    numeric(actor.walk, '人物步态', 0, 1_000_000_000); numeric(actor.aimTime, '瞄准时间', 0, MAX_SECONDS);
    numeric(actor.cooldown, '人物冷却', 0, 60);
    for (const key of ['aiming', 'safe', 'released', 'down']) boolean(actor[key], `人物 ${key}`);
    list(actor.goals, '目标路线', 128); list(actor.path, '导航路径', 4096);
    actor.goals.forEach(point => vector(point, '目标路点')); actor.path.forEach(point => vector(point, '导航路点'));
    const enemyIndex = /^enemy-(?:E0[0-9]-)?(\d+)$/.exec(actor.id);
    if (enemyIndex && Number(enemyIndex[1]) >= mission.spawned) throw new InvalidRecord('敌人 ID 与入场计数冲突。');
    actors.set(actor.id, actor);
  }
  const need = (id: string, role: CharacterRole) => {
    const actor = actors.get(id);
    if (actor?.role !== role) throw new InvalidRecord(`场景缺少必需人物 ${id}，或其身份错误。`);
    // These missions protect every mandatory participant. A dead required body
    // cannot follow its route, leaving the later handover permanently incomplete.
    if ((mission.scenario === 'transfer' || mission.scenario === 'flank' || mission.scenario === 'escort' || mission.scenario === 'relief'
      || mission.scenario === 'rescue' || mission.scenario === 'medical' || mission.scenario === 'epilogue')
      && (actor.down !== false || (actor.health as number) <= 0)) throw new InvalidRecord(`必需人物 ${id} 已失去行动能力，存档状态与场景不一致。`);
  };
  if (mission.scenario === 'childhood' || mission.scenario === 'mainhall') {
    need('father', 'father'); need('evacuator', 'civilian'); need('daughter', 'child'); need('zhao', 'ally');
    if (mission.scenario === 'childhood') need('young-zhou', 'ally');
    else { need('young-lu', 'child'); if (mission.phase >= 4) need('shao', 'opponent'); }
  } else if (mission.scenario === 'nightshift') { need('xu', 'medic'); need('meng', 'ally'); need('zhou', 'ally'); }
  else if (mission.scenario === 'transfer') { need('courier', 'civilian'); need('xu', 'medic'); need('zhou', 'ally'); need('luo', 'worker'); }
  else if (mission.scenario === 'escort') { need('luo', 'worker'); need('meng', 'ally'); need('medic', 'medic'); }
  else need('zheng', 'ally');
  if (mission.scenario === 'rescue') {
    need('meng', mission.phase >= 4 ? 'cart' : 'ally'); need('medic', 'medic'); need('medic-1', 'medic'); need('zhou-cart', 'cart');
  }
  if (mission.scenario === 'medical') {
    need('zhou', 'cart'); need('meng', 'cart'); need('doctor', 'medic'); need('nurse', 'medic'); need('xu', 'medic');
  }
  if (mission.scenario === 'epilogue') {
    need('luo', 'worker'); need('supply-cart', 'cart');
    for (let i = 0; i < 3; i++) need(`worker-${i}`, 'worker');
    if (mission.phase === 8) {
      const safe = ['worker-0', 'worker-1', 'worker-2', 'supply-cart'].every(id => actors.get(id)!.safe === true);
      const workersArrived = EPILOGUE.workersGoals.every((goal, i) => {
        const actor = actors.get(`worker-${i}`)!, position = actor.position as number[];
        return !(actor.goals as unknown[]).length && Math.hypot(position[0] - goal[0], position[2] - goal[2]) < 0.12;
      });
      const cart = actors.get('supply-cart')!;
      if (!safe || !workersArrived || (cart.goals as unknown[]).length || (cart.position as number[])[2] >= -5) {
        throw new InvalidRecord('首批接收完成但人员或物资未实际到达。');
      }
    }
  }
  if ((mission.scenario === 'medical' || mission.scenario === 'epilogue')
    && [...actors.values()].some(a => a.role === 'enemy')) throw new InvalidRecord('医疗与接收场景不能含常规交战敌人。');
  if (mission.scenario === 'prologue') need('father', 'father');
  if (mission.scenario === 'workers') need('meng', 'ally');
  if (mission.scenario === 'frontgate') need('relief', 'ally');
  if (mission.scenario === 'flank') {
    need('meng', 'ally'); need('walker-0', 'civilian'); need('walker-1', 'civilian');
    // The mission uses this prefix for its passage group. An un-routed extra
    // walker would make the real group-completion check wait forever.
    if ([...actors.keys()].filter(id => id.startsWith('walker-')).length !== 2) throw new InvalidRecord('步行家属名单与场景不一致。');
  }
  if (mission.scenario === 'escort' || mission.scenario === 'relief') {
    need('meng', 'ally'); need('relief-0', 'ally'); need('relief-1', 'ally');
    if (mission.scenario === 'escort') { need('walker-0', 'civilian'); need('walker-1', 'civilian'); }
    const groups = mission.scenario === 'escort'
      ? { 'cart-': 3, 'walker-': 2, 'relief-': 2, 'worker-': 0 }
      : { 'cart-': 0, 'walker-': 0, 'relief-': 2, 'worker-': 3 };
    for (const [prefix, count] of Object.entries(groups)) {
      if ([...actors.keys()].filter(id => id.startsWith(prefix)).length !== count) throw new InvalidRecord(`任务名单 ${prefix} 与场景不一致。`);
    }
  }
  if (mission.scenario === 'handover') {
    need('medic', 'medic');
    if (mission.phase >= 3) need('meng', 'ally');
  }
  const workerCount: Record<ScenarioId, number> = {
    northgate: 7, prologue: 3, handover: 2, nightshift: 0, workers: 9,
    childhood: 0, mainhall: HISTORY.civilians.length, frontgate: 7, transfer: 1, flank: 3, escort: 1, relief: 3,
    rescue: 0, medical: 0, epilogue: 4,
  };
  // Luo remains a worker in S06/S08, but is not a patient or worker-N evacuee.
  if (mission.scenario !== 'transfer' && mission.scenario !== 'escort' && mission.scenario !== 'epilogue') {
    for (let i = 0; i < workerCount[mission.scenario]; i++) need(`worker-${i}`, 'worker');
  }
  if ([...actors.values()].filter(actor => actor.role === 'worker').length !== workerCount[mission.scenario]) {
    throw new InvalidRecord('场景工作人员数量与要求不一致。');
  }
  // S08 retains all three bodies, including the empty replacement/original cart.
  // Patient occupancy is mission-owned; it is not the number of cart actors.
  const cartCount = mission.scenario === 'transfer' || mission.scenario === 'escort' ? 3 : mission.scenario === 'flank' ? 2
    : mission.scenario === 'rescue' ? mission.phase >= 4 ? 2 : 1 : mission.scenario === 'medical' ? 2 : mission.scenario === 'epilogue' ? 1 : 0;
  if (mission.scenario === 'transfer' || mission.scenario === 'escort' || mission.scenario === 'flank') {
    for (let i = 0; i < cartCount; i++) need(`cart-${i}`, 'cart');
  }
  if ([...actors.values()].filter(actor => actor.role === 'cart').length !== cartCount) {
    throw new InvalidRecord('患者车数量与场景不一致。');
  }
  return structuredClone(value) as Snapshot;
}

function validateChapter(slot: SaveSlot, scene: ScenarioId, value: unknown): ChapterProgress | undefined {
  if (slot !== 'campaign') {
    if (scene !== slot) throw new InvalidRecord('存档场景与所选槽位不一致。');
    if (value !== undefined) throw new InvalidRecord('独立场景槽位不能携带连续章节进度。');
    return undefined;
  }
  const chapter = record(value, '连续章节', ['chapter', 'stage', 'elapsedBefore']);
  const supportedChapter = chapter.chapter === 'campaign'
    || (chapter.chapter === 'L1' && (chapter.stage === 'S03' || chapter.stage === 'S04'));
  if (!supportedChapter || !CHAPTER_STAGES.some(stage => stage.id === chapter.stage && stage.scenario === scene)) throw new InvalidRecord('连续章节、段落与场景不匹配。');
  numeric(chapter.elapsedBefore, '此前章节用时', 0, MAX_SECONDS);
  return structuredClone(chapter) as unknown as ChapterProgress;
}
function json(raw: string): unknown {
  if (raw.length > MAX_RECORD_LENGTH) throw new InvalidRecord('记录超过允许大小。');
  try { return JSON.parse(raw); } catch { throw new InvalidRecord('记录不是完整的 JSON。'); }
}
function version(value: unknown, schema: string): void {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new InvalidRecord('记录结构损坏。');
  const data = value as Record<string, unknown>;
  if (data.schema !== schema) throw new InvalidRecord('记录类型不受支持。');
  if (typeof data.version === 'number' && data.version > VERSION) throw new FutureVersion('记录来自更新版本，当前版本不能使用。');
  if (data.version !== VERSION) throw new InvalidRecord('记录版本不受支持。');
}
function parseSave(raw: string, slot: SaveSlot): SaveEnvelope {
  const value = json(raw); version(value, 'ganymede-save');
  const data = record(value, '存档', ['schema', 'version', 'slot', 'savedAt', 'snapshot'], ['chapter']);
  if (data.slot !== slot) throw new InvalidRecord('记录槽位与读取槽位不一致。');
  numeric(data.savedAt, '保存时间', 0, Number.MAX_SAFE_INTEGER, true);
  const snapshot = validateSnapshot(data.snapshot);
  const chapter = validateChapter(slot, snapshot.mission.scenario, data.chapter);
  return { schema: 'ganymede-save', version: VERSION, slot, savedAt: data.savedAt, snapshot, ...(chapter ? { chapter } : {}) };
}
function validateSettings(value: unknown): GameSettings {
  const data = record(value, '设置', ['sensitivity', 'volume', 'lowMotion'], ['touchControls']);
  numeric(data.sensitivity, '灵敏度', -Number.MAX_VALUE, Number.MAX_VALUE);
  numeric(data.volume, '音量', -Number.MAX_VALUE, Number.MAX_VALUE);
  boolean(data.lowMotion, '低动效');
  if (Object.hasOwn(data, 'touchControls')) boolean(data.touchControls, '触屏操作');
  return { sensitivity: data.sensitivity, volume: data.volume, lowMotion: data.lowMotion,
    ...(typeof data.touchControls === 'boolean' ? { touchControls: data.touchControls } : {}) };
}
function boundedSettings(settings: GameSettings): GameSettings {
  return { sensitivity: Math.max(0.25, Math.min(2.5, settings.sensitivity)), volume: Math.max(0, Math.min(1, settings.volume)), lowMotion: settings.lowMotion,
    ...(typeof settings.touchControls === 'boolean' ? { touchControls: settings.touchControls } : {}) };
}
function parseSettings(raw: string): SettingsEnvelope {
  const value = json(raw); version(value, 'ganymede-settings');
  const data = record(value, '设置记录', ['schema', 'version', 'savedAt', 'settings']);
  numeric(data.savedAt, '设置保存时间', 0, Number.MAX_SAFE_INTEGER, true);
  return { schema: 'ganymede-settings', version: VERSION, savedAt: data.savedAt, settings: validateSettings(data.settings) };
}
function reason(error: unknown): string { return error instanceof InvalidRecord ? error.message : '本地存储不可用或空间不足。'; }

/** Synchronous, origin-local persistence. StorageLike.setItem follows Web Storage's atomic write contract. */
export class SaveStore {
  constructor(private readonly storage: StorageLike, private readonly now: () => number = Date.now) {}

  save(slot: SaveSlot, snapshot: Snapshot, chapter?: ChapterProgress): SaveResult {
    try {
      validateSlot(slot);
      const checked = validateSnapshot(snapshot), progress = validateChapter(slot, checked.mission.scenario, chapter);
      // Loading preserves legacy bytes and stage identity; an explicit later save
      // upgrades only the chapter label, never the scene, phase or elapsed time.
      const currentProgress = progress ? { ...progress, chapter: 'campaign' as const } : undefined;
      const savedAt = this.now(); numeric(savedAt, '保存时间', 0, Number.MAX_SAFE_INTEGER, true);
      const data: SaveEnvelope = { schema: 'ganymede-save', version: VERSION, slot, savedAt, snapshot: checked, ...(currentProgress ? { chapter: currentProgress } : {}) };
      const raw = JSON.stringify(data);
      if (raw.length > MAX_RECORD_LENGTH) throw new InvalidRecord('存档超过允许大小。');
      return this.write(`${SAVE_KEY_PREFIX}${slot}`, raw, previous => parseSave(previous, slot));
    } catch (error) { return { ok: false, error: `未保存：${reason(error)}` }; }
  }

  load(slot: SaveSlot): LoadResult {
    try {
      validateSlot(slot);
      const result = this.read(`${SAVE_KEY_PREFIX}${slot}`, raw => parseSave(raw, slot));
      if (!result.value) return result.warning ? { warning: result.warning } : {};
      const { snapshot, chapter, savedAt } = result.value;
      return { save: { snapshot, savedAt, ...(chapter ? { chapter } : {}) }, ...(result.warning ? { warning: result.warning } : {}) };
    } catch (error) { return { warning: `未载入：${reason(error)}` }; }
  }

  saveSettings(settings: GameSettings): SaveResult {
    try {
      const checked = boundedSettings(validateSettings(settings)), savedAt = this.now();
      numeric(savedAt, '保存时间', 0, Number.MAX_SAFE_INTEGER, true);
      return this.write(SETTINGS_KEY, JSON.stringify({ schema: 'ganymede-settings', version: VERSION, savedAt, settings: checked }), parseSettings);
    } catch (error) { return { ok: false, error: `设置未保存：${reason(error)}` }; }
  }

  getSettings(): SettingsResult {
    const result = this.read(SETTINGS_KEY, parseSettings);
    if (!result.value) return { settings: { ...DEFAULT_SETTINGS }, ...(result.warning ? { warning: result.warning } : {}) };
    const settings = boundedSettings(result.value.settings);
    const adjusted = settings.sensitivity !== result.value.settings.sensitivity || settings.volume !== result.value.settings.volume;
    const warning = [result.warning, adjusted ? '设置超出范围，已限制到支持范围。' : undefined].filter(Boolean).join('');
    return { settings, ...(warning ? { warning } : {}) };
  }

  private read<T>(key: string, parse: (raw: string) => T): { value?: T; warning?: string } {
    let primaryProblem = '', backupProblem = '';
    try {
      const raw = this.storage.getItem(key);
      if (raw !== null) {
        try { return { value: parse(raw) }; } catch (error) { primaryProblem = `主记录：${reason(error)}`; }
      }
    } catch (error) { primaryProblem = `主记录读取失败：${reason(error)}`; }
    try {
      const backup = this.storage.getItem(`${key}.backup`);
      if (backup !== null) {
        try {
          return { value: parse(backup), warning: `${primaryProblem || '主记录缺失。'}已载入上一份有效备份；原记录仍保留。` };
        } catch (error) { backupProblem = `备份：${reason(error)}`; }
      }
    } catch (error) { backupProblem = `备份读取失败：${reason(error)}`; }
    return primaryProblem || backupProblem ? { warning: `${primaryProblem}${backupProblem}未载入记录；原数据未删除。` } : {};
  }

  private write<T>(key: string, raw: string, parse: (raw: string) => T): SaveResult {
    try {
      const previous = this.storage.getItem(key);
      if (previous !== null) {
        let valid = false;
        try { parse(previous); valid = true; }
        catch (error) {
          if (error instanceof FutureVersion) return { ok: false, error: `${error.message}原记录未覆盖。` };
          // Preserve damaged bytes before replacing the primary. A second distinct
          // damaged record needs explicit cleanup, rather than erasing the first one.
          const damagedKey = `${key}.damaged`, damaged = this.storage.getItem(damagedKey);
          if (damaged !== null && damaged !== previous) return { ok: false, error: '主记录损坏，且已有另一份待处理的损坏记录。本次未覆盖任何记录。' };
          if (damaged === null) this.storage.setItem(damagedKey, previous);
        }
        // Backup is written first. An exception or interruption before the final
        // atomic setItem leaves the prior primary usable, not an empty slot.
        if (valid) this.storage.setItem(`${key}.backup`, previous);
      }
      this.storage.setItem(key, raw);
      return { ok: true };
    } catch (error) { return { ok: false, error: `保存失败：${reason(error)}上一记录未被替换。` }; }
  }
}

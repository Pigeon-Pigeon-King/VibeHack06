import { SCENARIO_IDS, type CharacterRole, type ScenarioId } from '../contracts';
import { CHAPTER_STAGES, SCENARIO_PHASE_LIMITS, type ChapterProgress } from '../content/chapter-flow';
import type { Snapshot } from '../mission/Simulation';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export type SaveSlot = 'campaign' | ScenarioId;
export interface GameSettings { sensitivity: number; volume: number; lowMotion: boolean }
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
  numeric(player.height, '玩家高度', 0.8, 3);
  numeric(player.reload, '装填时间', 0, 60);
  numeric(player.cooldown, '武器冷却', 0, 60);
  numeric(player.hurtAt, '受伤时间', -MAX_SECONDS, MAX_SECONDS);
  numeric(player.walk, '步态', 0, 1_000_000_000);
  numeric(player.recoil, '后坐', 0, 20);
  boolean(player.crouched, '蹲姿'); boolean(player.ads, '瞄准'); text(player.name, '玩家姓名', 120);

  const mission = record(snapshot.mission, '任务', ['scenario', 'phase', 'elapsed', 'phaseTime', 'control', 'facts', 'complete', 'failed', 'checkpointLabel', 'subtitle', 'speaker', 'subtitleUntil', 'spawned', 'nextSpawn']);
  scenario(mission.scenario);
  numeric(mission.phase, '任务阶段', 0, SCENARIO_PHASE_LIMITS[mission.scenario], true);
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
  mission.facts.forEach(fact => text(fact, '任务事实', 120));
  if (new Set(mission.facts).size !== mission.facts.length) throw new InvalidRecord('任务事实重复。');

  list(snapshot.actors, '人物', 256);
  const actors = new Map<string, Record<string, unknown>>();
  for (const value of snapshot.actors) {
    const actor = record(value, '人物', ['id', 'name', 'role', 'position', 'health', 'yaw', 'goals', 'path', 'walk', 'aiming', 'aimTime', 'cooldown', 'safe', 'released', 'down']);
    text(actor.id, '人物 ID', 80); text(actor.name, '人物姓名', 120);
    if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(actor.id) || actor.id === 'player' || actors.has(actor.id)) throw new InvalidRecord('人物 ID 重复、非法或与玩家冲突。');
    if (typeof actor.role !== 'string' || !['enemy', 'ally', 'worker', 'father', 'child', 'medic'].includes(actor.role)) throw new InvalidRecord('人物类型不受支持。');
    vector(actor.position, '人物位置');
    numeric(actor.health, '人物生命', -1000, 1000); numeric(actor.yaw, '人物朝向', -1_000_000, 1_000_000);
    numeric(actor.walk, '人物步态', 0, 1_000_000_000); numeric(actor.aimTime, '瞄准时间', 0, MAX_SECONDS);
    numeric(actor.cooldown, '人物冷却', 0, 60);
    for (const key of ['aiming', 'safe', 'released', 'down']) boolean(actor[key], `人物 ${key}`);
    list(actor.goals, '目标路线', 128); list(actor.path, '导航路径', 4096);
    actor.goals.forEach(point => vector(point, '目标路点')); actor.path.forEach(point => vector(point, '导航路点'));
    const enemyIndex = /^enemy-(?:E0[123]-)?(\d+)$/.exec(actor.id);
    if (enemyIndex && Number(enemyIndex[1]) >= mission.spawned) throw new InvalidRecord('敌人 ID 与入场计数冲突。');
    actors.set(actor.id, actor);
  }
  const need = (id: string, role: CharacterRole) => {
    if (actors.get(id)?.role !== role) throw new InvalidRecord(`场景缺少必需人物 ${id}，或其身份错误。`);
  };
  if (mission.scenario === 'nightshift') { need('xu', 'medic'); need('meng', 'ally'); need('zhou', 'ally'); }
  else need('zheng', 'ally');
  if (mission.scenario === 'prologue') need('father', 'father');
  if (mission.scenario === 'workers') need('meng', 'ally');
  if (mission.scenario === 'handover') {
    need('medic', 'medic');
    if (mission.phase >= 3) need('meng', 'ally');
  }
  const workerCount: Record<ScenarioId, number> = { northgate: 7, prologue: 3, handover: 2, nightshift: 0, workers: 9 };
  for (let i = 0; i < workerCount[mission.scenario]; i++) need(`worker-${i}`, 'worker');
  return structuredClone(value) as Snapshot;
}

function validateChapter(slot: SaveSlot, scene: ScenarioId, value: unknown): ChapterProgress | undefined {
  if (slot !== 'campaign') {
    if (scene !== slot) throw new InvalidRecord('存档场景与所选槽位不一致。');
    if (value !== undefined) throw new InvalidRecord('独立场景槽位不能携带连续章节进度。');
    return undefined;
  }
  const chapter = record(value, '连续章节', ['chapter', 'stage', 'elapsedBefore']);
  if (chapter.chapter !== 'L1' || !CHAPTER_STAGES.some(stage => stage.id === chapter.stage && stage.scenario === scene)) throw new InvalidRecord('连续章节、段落与场景不匹配。');
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
  const data = record(value, '设置', ['sensitivity', 'volume', 'lowMotion']);
  numeric(data.sensitivity, '灵敏度', -Number.MAX_VALUE, Number.MAX_VALUE);
  numeric(data.volume, '音量', -Number.MAX_VALUE, Number.MAX_VALUE);
  boolean(data.lowMotion, '低动效');
  return { sensitivity: data.sensitivity, volume: data.volume, lowMotion: data.lowMotion };
}
function boundedSettings(settings: GameSettings): GameSettings {
  return { sensitivity: Math.max(0.25, Math.min(2.5, settings.sensitivity)), volume: Math.max(0, Math.min(1, settings.volume)), lowMotion: settings.lowMotion };
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
      const savedAt = this.now(); numeric(savedAt, '保存时间', 0, Number.MAX_SAFE_INTEGER, true);
      const data: SaveEnvelope = { schema: 'ganymede-save', version: VERSION, slot, savedAt, snapshot: checked, ...(progress ? { chapter: progress } : {}) };
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

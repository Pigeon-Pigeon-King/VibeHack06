import type { CharacterRole, ScenarioId, Vec3 } from '../contracts';
import type { Physics } from '../runtime/Physics';

export const AIM_IDENTITY_RANGE = 24;
export interface AimIdentityActor {
  id: string; name: string; role: CharacterRole; down: boolean; health: number;
}
export interface AimIdentityContext {
  scenario: ScenarioId;
  facts: readonly string[];
}
export interface AimIdentityTarget {
  id: string;
  name: string;
  tone: 'friendly' | 'hostile';
}
/** Retain the actual occluder so the HUD never fades an old name over a new hit. */
export interface AimIdentityHit {
  hitId: string;
  target: AimIdentityTarget | null;
}
export interface AimIdentityQuery extends AimIdentityContext {
  physics: Pick<Physics, 'trace'>;
  actors: readonly AimIdentityActor[];
  cameraPosition: Vec3;
  worldDirection: Vec3;
  isActorVisible?: (id: string) => boolean;
}

const IMPORTANT_ENEMIES = new Set(['shao']);
// These names must already be present in mission state. Asset identities and
// role skins are deliberately not consulted: S01 still says “年轻的驻军士兵”.
const KNOWN_PERSON_NAMES = new Set(['陆闻川', '周延', '陆建平', '赵启明', '许岚', '郑铎', '孟齐', '罗敬', '沈玉芬']);
const ANONYMOUS_ID = /^(?:enemy(?:-|$)|hall-invader-|hall-defender-|late-civilian-|evac-crowd-|civilian-|worker-\d+(?:$|-)|walker-\d+(?:$|-)|relief-\d+(?:$|-)|medic-\d+(?:$|-))/;
const ZHOU_SCENARIOS = new Set<ScenarioId>(['northgate', 'frontgate', 'flank', 'relief', 'rescue']);

function shaoIdentityKnown(context: AimIdentityContext): boolean {
  const known = (fact: string) => context.facts.includes(fact);
  if (context.scenario === 'childhood' || context.scenario === 'prologue') return false;
  if (context.scenario === 'mainhall') return known('shao-identified-by-zhou');
  // Later shared reports are available to both protagonists. A private timing
  // fact is usable only in the viewpoint that learned it, never across S01/S02.
  if (known('full-report-shared') || known('shaoyuan-departure-confirmed')
    || known('shaoyuan-passed-dispatch') || known('shaoyuan-inland-confirmed')) return true;
  return ZHOU_SCENARIOS.has(context.scenario)
    ? known('zhou-knows-shaoyuan-time') || known('shao-identified-by-zhou')
    : known('lu-knows-shaoyuan-time') || known('lu-has-full-report');
}

/** Resolve only the current authored name; this function cannot reveal a model's identity. */
export function resolveAimIdentity(actor: AimIdentityActor, context: AimIdentityContext): AimIdentityTarget | null {
  if (actor.down || actor.health <= 0 || actor.role === 'cart' || !actor.name.trim()) return null;
  if (IMPORTANT_ENEMIES.has(actor.id)) return shaoIdentityKnown(context)
    ? { id: actor.id, name: actor.name, tone: 'hostile' } : null;
  if (actor.role === 'enemy' || actor.role === 'opponent') return null;
  const knownName = KNOWN_PERSON_NAMES.has(actor.name.split(' · ')[0].trim());
  if (!knownName && ANONYMOUS_ID.test(actor.id)) return null;
  return { id: actor.id, name: actor.name, tone: 'friendly' };
}

/** One nearest-body/solid trace along the rendered camera ray, never a name-only search. */
export function queryAimIdentity(query: AimIdentityQuery): AimIdentityHit | null {
  const { cameraPosition: from, worldDirection: direction } = query;
  if (!from.every(Number.isFinite) || !direction.every(Number.isFinite)) return null;
  const length = Math.hypot(...direction);
  if (length < 1e-8) return null;
  const to = from.map((value, axis) => value + direction[axis] / length * AIM_IDENTITY_RANGE) as Vec3;
  const hit = query.physics.trace(from, to, 'player');
  if (!hit || !Number.isFinite(hit.distance) || hit.distance < 0 || hit.distance > AIM_IDENTITY_RANGE) return null;
  const actor = query.actors.find(candidate => candidate.id === hit.id);
  const visible = actor && (!query.isActorVisible || query.isActorVisible(actor.id));
  return { hitId: hit.id, target: visible ? resolveAimIdentity(actor, query) : null };
}

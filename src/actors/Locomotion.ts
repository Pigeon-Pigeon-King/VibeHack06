import type { CharacterRole, ScenarioId, Vec3 } from '../contracts';

/** World-space metres per second, independent of dialogue and animation clocks. */
export const NPC_TRAVEL_SPEED = 4.5;
const CONVOY_SPEED = 4;

function isEscortingConvoy(actor: { id: string; goals: readonly Vec3[] }, scenario: ScenarioId, phase: number): boolean {
  return scenario === 'escort' && phase >= 6 && phase <= 13 && actor.goals.length > 0
    && ['walker-0', 'walker-1', 'meng', 'relief-0', 'relief-1'].includes(actor.id);
}

export function npcTravelSpeed(actor: { id: string; role: CharacterRole; goals: readonly Vec3[] }, scenario: ScenarioId, phase: number): number {
  // This final leg is already a faster, synchronised medical transport.
  if (scenario === 'rescue' && actor.role !== 'enemy' && phase === 9) return 5.5;
  if (actor.role === 'cart') return CONVOY_SPEED;

  // S01 is played by a child who cannot sprint. These short guide/crowd routes
  // also belong to its authored evacuation sequence, not adult travel.
  if (scenario === 'childhood' && (actor.id === 'father' || actor.id.startsWith('civilian-'))
    || scenario === 'prologue' && phase < 2 && actor.id === 'father') return 2.1;

  // Match the people actually accompanying transport, without slowing every
  // medic/civilian or the escort soldiers once they return to the north gate.
  if (actor.goals.length && (scenario === 'transfer' && phase === 2 && actor.id === 'xu'
    || scenario === 'flank' && phase === 4 && actor.id.startsWith('walker-')
    || isEscortingConvoy(actor, scenario, phase)
    || scenario === 'rescue' && (phase === 7 || phase === 8) && actor.role !== 'enemy'
    || scenario === 'epilogue' && phase === 7 && actor.id.startsWith('worker-'))) return CONVOY_SPEED;

  return NPC_TRAVEL_SPEED;
}

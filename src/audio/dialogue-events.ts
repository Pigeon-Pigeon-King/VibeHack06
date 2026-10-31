import type { GameEvent, Mission, Simulation } from '../mission/Simulation';
import type { DialogueCue } from './contracts';

/** Match the mission prerequisites for both the touch button and audio cancellation. */
export function dialogueSkipAvailable(sim: Pick<Simulation, 'mission' | 'scenario' | 'has' | 'actors'>): boolean {
  const m = sim.mission;
  return m.control === 'staged'
    && !(sim.scenario === 'rescue' && m.phase === 1 && !sim.has('rescue-meng-wounded'))
    && !(sim.scenario === 'medical' && m.phase === 8 && sim.actors.find(a => a.id === 'xu')?.goals.length)
    && !(sim.scenario === 'relief' && m.phase === 7 && sim.actors.find(a => a.id === 'zheng')?.goals.length);
}

/** A fixed simulation step may emit several real lines. Only an explicit legal
 * skip discards its catch-up dialogue; rendering never re-enqueues these events. */
export function dialogueCues(events: readonly GameEvent[], mission: Mission, epoch: number, skipped = false): DialogueCue[] {
  if (mission.failed) return [];
  return events.flatMap((event, index) => {
    const line = event.dialogue;
    if (event.type !== 'dialogue' || !line?.text || line.expiresAt <= mission.elapsed) return [];
    if (skipped && (mission.complete || line.text !== mission.subtitle || line.speaker !== mission.speaker)) return [];
    return [{ epoch, revision: `${mission.elapsed}:${index}:${line.expiresAt}`, scenario: mission.scenario,
      speaker: line.speaker, text: line.text, elapsed: mission.elapsed, expiresAt: line.expiresAt }];
  });
}

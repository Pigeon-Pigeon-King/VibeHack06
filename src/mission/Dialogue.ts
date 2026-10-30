import type { Vec3 } from '../contracts';
import type { Simulation } from './Simulation';

export type DialogueLine = readonly [at: number, speaker: string, text: string];
export function playDialogue(s: Simulation, key: string, lines: readonly DialogueLine[]): void {
  lines.forEach(([at, speaker, text], i) => {
    if (s.mission.phaseTime >= at && !s.has(`${key}-${i}`)) {
      s.fact(`${key}-${i}`);
      s.say(speaker, text, (lines[i + 1]?.[0] ?? at + 7) - at);
    }
  });
}
export function finishDialogue(s: Simulation, key: string, lines: readonly DialogueLine[]): void {
  lines.forEach((_, i) => s.fact(`${key}-${i}`));
}
export function lookWithin(s: Simulation, target: Vec3, yawLimit = 0.8, pitchLimit = 0.32): void {
  const dx = target[0] - s.player.position[0], dz = target[2] - s.player.position[2];
  const yaw = Math.atan2(-dx, -dz);
  const difference = Math.atan2(Math.sin(s.player.yaw - yaw), Math.cos(s.player.yaw - yaw));
  s.player.yaw = yaw + Math.max(-yawLimit, Math.min(yawLimit, difference));
  s.player.pitch = Math.max(-pitchLimit, Math.min(pitchLimit, s.player.pitch));
}

import type { Vec3 } from '../contracts';
import { HISTORY as H } from './history-layout';
import { OPENING_TIMELINE } from './opening-timeline';

const T = OPENING_TIMELINE.mainhall;
const ease = (value: number) => { const u = Math.max(0, Math.min(1, value)); return u * u * (3 - 2 * u); };
export const OPENING_COMMANDER_FALL_SECONDS = 1.25;
export const OPENING_JAM_VERSION = 'history-crowd-jam-v1';

/** Shared by the authored actor and its observation cue, not a second clock. */
export function openingShaoPosition(time: number): Vec3 {
  const u = Math.max(0, Math.min(1, (time - T.breach) / 8.5));
  const start: Vec3 = [32.8, 0, -4], end: Vec3 = [H.zhaoCaptured[0] + 2.8, 0, H.zhaoCaptured[2] + 2.6];
  return start.map((value, axis) => value + (end[axis] - value) * u) as Vec3;
}

/** Follow people to the west door; the order to kick the gun away then draws
 * attention to Zhao and the approaching officer. The southern viewpoint puts
 * both events in adjacent sectors instead of requiring a 180-degree reversal. */
export function openingHallGaze(time: number): { yaw: number; pitch: number } {
  const observer = H.rubblePlayer;
  const yawAt = (point: Vec3) => Math.atan2(observer[0] - point[0], observer[2] - point[2]);
  const early = yawAt([-12, 0, 7]), door = yawAt([-19.5, 0, 6]);
  const doorYaw = early + (door - early) * ease(time / 4);
  const shao = openingShaoPosition(time);
  const commander = yawAt(H.zhaoCaptured), officer = yawAt(shao);
  const executionYaw = commander + (officer - commander) * 0.4;
  const turn = ease((time - (T.crowdAttack - 0.3)) / (T.recognition - T.crowdAttack + 0.3));
  return { yaw: doorYaw + Math.atan2(Math.sin(executionYaw - doorYaw), Math.cos(executionYaw - doorYaw)) * turn,
    pitch: -0.035 + ease((time - T.collapse) / 1.35) * 0.075 };
}

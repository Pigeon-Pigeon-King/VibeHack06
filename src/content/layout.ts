import type { ScenarioId, Vec3 } from '../contracts';

export const LAYOUT = {
  northgate: {
    name: '北闸 · 下一班之前', spawn: [0, 0, 22] as Vec3, yaw: 0,
    terminal: [0, 0, 5] as Vec3, post: [2, 0, 16] as Vec3,
    exit: [0, 0, 30] as Vec3, safe: [-12, 0, 26] as Vec3,
    workerSpawns: [[-7, 0, -5], [-5, 0, -8], [-3, 0, -5], [3, 0, -7], [5, 0, -5], [7, 0, -8], [9, 0, -5]] as Vec3[],
    enemySpawns: [[-9, 0, -28], [8, 0, -28], [0, 0, -35], [24, 0, -7]] as Vec3[],
  },
  prologue: {
    name: '序章 · 同一扇门', spawn: [-4, 0, 18] as Vec3, yaw: 0,
    terminal: [-4, 0, 11] as Vec3, post: [0, 0, -3] as Vec3,
    exit: [0, 0, 25] as Vec3, safe: [-8, 0, 23] as Vec3,
    workerSpawns: [[-6, 0, 4], [-4, 0, 2], [-8, 0, 1]] as Vec3[],
    enemySpawns: [[-8, 0, -25], [8, 0, -26], [0, 0, -30]] as Vec3[],
  },
  handover: {
    name: '下一班 · 有人接你回去', spawn: [-14, 0, 24] as Vec3, yaw: 0,
    terminal: [-14, 0, 16] as Vec3, post: [0, 0, 0] as Vec3,
    exit: [14, 0, 28] as Vec3, safe: [14, 0, 25] as Vec3,
    workerSpawns: [[-11, 0, 14], [-9, 0, 13]] as Vec3[],
    enemySpawns: [[12, 0, -30], [-6, 0, -28], [22, 0, -18]] as Vec3[],
    rescue: [14, 0, -20] as Vec3,
  },
} satisfies Record<ScenarioId, unknown>;

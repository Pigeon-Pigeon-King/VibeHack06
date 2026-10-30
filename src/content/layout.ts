import type { ScenarioId, Vec3 } from '../contracts';
import { NIGHT, WORKERS } from './chapter-layout';
import { HISTORY } from './history-layout';
import { FRONTGATE } from './frontgate-layout';
import { TRANSFER } from './transfer-layout';
import { FLANK } from './flank-layout';

export const LAYOUT = {
  transfer: {
    name: '占领区 · 转接门与争执', spawn: TRANSFER.spawn, yaw: Math.PI,
    terminal: TRANSFER.panel, post: TRANSFER.equipment, exit: TRANSFER.exit, safe: TRANSFER.xuSafe,
    workerSpawns: [] as Vec3[], enemySpawns: [] as Vec3[],
  },
  flank: {
    name: '占领区 · 交给别人', spawn: FLANK.spawn, yaw: 0,
    terminal: FLANK.platform, post: FLANK.innerGate, exit: FLANK.exit, safe: FLANK.techSafe,
    workerSpawns: FLANK.technicians, enemySpawns: FLANK.eastEntries,
  },
  childhood: {
    name: '序章 · 检修门', spawn: HISTORY.childSpawn, yaw: 0,
    terminal: HISTORY.lunch, post: HISTORY.gateOutside, exit: HISTORY.childSafe, safe: HISTORY.childSafe,
    workerSpawns: [] as Vec3[], enemySpawns: HISTORY.enemyEntries,
  },
  mainhall: {
    name: '序章 · 主厅', spawn: HISTORY.youngSpawn, yaw: Math.PI / 2,
    terminal: HISTORY.gatePanel, post: HISTORY.defenseB, exit: HISTORY.childSafe, safe: HISTORY.childSafe,
    workerSpawns: HISTORY.civilians, enemySpawns: HISTORY.enemyEntries,
  },
  frontgate: {
    name: '占领区 · 北闸的预告', spawn: FRONTGATE.spawn, yaw: 0,
    terminal: FRONTGATE.observe, post: FRONTGATE.rearPost, exit: FRONTGATE.exit, safe: FRONTGATE.safe,
    workerSpawns: FRONTGATE.workers, enemySpawns: FRONTGATE.northEntries,
  },
  nightshift: {
    name: '占领区 · 夜班与出发', spawn: NIGHT.spawn, yaw: 0,
    terminal: NIGHT.fan, post: NIGHT.map, exit: NIGHT.exit, safe: NIGHT.delivery,
    workerSpawns: [] as Vec3[], enemySpawns: [] as Vec3[],
  },
  workers: {
    name: '占领区 · 带回港务人员', spawn: WORKERS.spawn, yaw: 0,
    terminal: WORKERS.observation, post: WORKERS.post, exit: WORKERS.exit, safe: WORKERS.safe,
    workerSpawns: WORKERS.workers, enemySpawns: WORKERS.checkpointEnemies,
  },
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

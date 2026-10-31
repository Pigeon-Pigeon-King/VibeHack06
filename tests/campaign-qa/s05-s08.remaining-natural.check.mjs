import { beforeAll, it } from 'vitest';
import { initializePhysics } from 'candidate-src/runtime/Physics.ts';
import { playRoute as playFrontgate } from 'virtual:s05-s08-frontgate-route';
import { playRoute as playTransfer } from 'virtual:s05-s08-transfer-route';
import { playRoute as playFlank } from 'virtual:s05-s08-flank-route';

beforeAll(initializePhysics);

// Each locked driver is invoked exactly once from its authored fresh entry.
// No staged skip, checkpoint restore, snapshot mutation or cross-stage seed is added.
// This is a headless mechanism replay, never browser/human first-play evidence.
it('S05 one natural public-input route; locked original driver and route assertions', () => {
  const result = playFrontgate(false, false);
  console.info('S05_SINGLE_NATURAL', JSON.stringify({ time: result.time, spawned: result.spawned,
    kills: result.kills, safe: result.safe, reloads: result.reloads }));
}, 240000);

it('S06 one natural public-input route; locked original driver and route assertions', () => {
  playTransfer(false, false);
}, 240000);

it('S07 one natural public-input route; locked original driver and route assertions', () => {
  playFlank(false, false);
}, 240000);

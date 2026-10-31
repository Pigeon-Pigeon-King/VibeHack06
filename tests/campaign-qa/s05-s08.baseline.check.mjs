import { beforeAll, it } from 'vitest';
import { initializePhysics } from 'candidate-src/runtime/Physics.ts';
import { playEscort } from 'virtual:s05-s08-escort-route';

beforeAll(initializePhysics);
it('S08 one natural public-input route; locked original driver and route assertions', () => {
  playEscort(false, false);
}, 240000);

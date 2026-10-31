import { bindGeneratedProp, doorLeaves, propPlacement, propSlot } from './GeneratedPropBindings';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, PointLight } from 'three';
import type { Vec3 } from '../contracts';
import { EPILOGUE as E } from '../content/epilogue-layout';
import type { SceneDynamics } from './chapter-environments';
import { addGround, PortKit, type Surface } from './port-kit';
import { DeferredAirCover } from './DeferredAirCover';

function block(k: PortKit, id: string, p: Vec3, size: Vec3, surface: Surface = 'pale') {
  k.box(surface, p, size); k.solid(id, p, size);
}
function shoreLeg(k: PortKit, a: Vec3, b: Vec3) {
  const dx = b[0] - a[0], dz = b[2] - a[2], length = Math.hypot(dx, dz), yaw = Math.atan2(dx, dz);
  k.box('rubber', [(a[0] + b[0]) / 2, 0.01, (a[2] + b[2]) / 2], [10, 0.018, length + 1.0], [0, yaw, 0], false);
  for (let t = 0; t < length; t += 9) {
    const x = a[0] + dx * t / length, z = a[2] + dz * t / length;
    k.box('white', [x, 0.028, z], [0.12, 0.018, 3.5], [0, yaw, 0], false);
    if (t > 0 && t % 27 === 0) k.light(x + Math.cos(yaw) * 6.5, z - Math.sin(yaw) * 6.5, 5);
  }
}

export function buildEpilogue(k: PortKit): SceneDynamics {
  k.root.name = 'S12-safe-shore-and-reception-placeholder';
  addGround(k.root, E.bounds);
  k.solid('epilogue-ground', [-200, -0.2, 45], [460, 0.4, 110]);
  for (const x of [-430, 30]) block(k, `epilogue-boundary-x-${x}`, [x, 1.4, 45], [0.5, 2.8, 110]);
  for (const z of [-10, 100]) block(k, `epilogue-boundary-z-${z}`, [-200, 1.4, z], [460, 2.8, 0.5]);
  k.workshop(-414, 64, 18, 24);
  for (const [id, p] of [['report', E.report], ['needs', E.needs]] as const) {
  propSlot(k, `epilogue-${id}-desk`, [propPlacement(`epilogue-${id}-desk`, 'PROP-TERMINAL-CONSOLE', [p[0], 0, p[2] - 1.4], 2.8, 'z', Math.PI / 2)], slot => {
    block(slot, `epilogue-${id}-desk`, [p[0], 0.5, p[2] - 1.4], [2.8, 1, 1], 'steel');
    slot.box('glass', [p[0], 1.3, p[2] - 1.5], [0.8, 0.5, 0.1]);
  });
  }
  const route = [E.needs, ...E.shoreVia];
  route.slice(1).forEach((b, i) => shoreLeg(k, route[i], b));
  // Storage remains north of the cleared shoreline, leaving a ten-metre lane.
  for (const [x, z] of [[-348, 59], [-266, 49], [-184, 37], [-100, 20]]) {
    k.workshop(x, z, 34, 20); k.tank(x - 24, z, 5, 11);
  }
  for (const [x, z] of [[-354, 85], [-250, 77], [-150, 62], [-64, 42]]) {
    k.box('steel', [x, 1.3, z + 5], [0.12, 2.6, 0.12]);
  }
  // The eastern reception recovers the broad S08 C03 silhouette with an active
  // north door. Its opening is six metres wide so three workers can fan out.
  block(k, 'epilogue-reception-wall-west', [-14, 2.6, 5.5], [0.4, 5.2, 19], 'paint');
  block(k, 'epilogue-reception-wall-east', [20, 2.6, 8], [0.4, 5.2, 24], 'paint');
  block(k, 'epilogue-shore-entry-lintel', [-14, 4.4, 17.5], [0.6, 1.6, 5], 'steel');
  k.sign('岸路入口', [-14.35, 4.3, 17.5], 4.5, 0.65, -Math.PI / 2);
  for (const [x, w] of [[-10.5, 7], [9.5, 21]]) block(k, `epilogue-door-wall-${x}`, [x, 2.6, 1], [w, 5.2, 0.45], 'pale');
  block(k, 'epilogue-door-lintel', [-4, 4.3, 1], [6, 1.8, 0.6], 'steel');
  // South side stays open for the shoreline arrival and incoming work crews.
  for (const x of [-14, 20]) block(k, `epilogue-reception-south-post-${x}`, [x, 2.6, 20], [0.6, 5.2, 0.6], 'steel');
  block(k, 'epilogue-reception-roof', [3, 5.4, 8], [35, 0.4, 25], 'pale');
  k.part('arch', 'pale', [3, 5.65, 8], [35, 7, 25]);
  k.sign('接收中心', [-4, 4.35, 1.35], 6, 0.65);
  k.visualSlot('epilogue-reception-console', slot => {
    block(slot, 'epilogue-reception-table', [2.2, 0.5, 6], [4, 1, 1.2], 'steel');
    slot.box('glass', [2.2, 1.3, 6], [0.8, 0.5, 0.08]);
  });
  k.box('signal', [3, 5.0, 10], [23, 0.08, 0.28]);
  const light = new PointLight(0xffdbad, 70, 32, 2); light.position.set(2, 4.7, 10); k.root.add(light);
  k.solid('epilogue-reception-door', [-4, 1.7, 1], [6, 3.4, 0.24], 0, 'reception-door-open');
  const door = new Group(); door.name = 'epilogue-reception-door'; door.position.set(-4, 1.7, 1); k.root.add(door);
  const panel = new Mesh(new BoxGeometry(6, 3.4, 0.24), new MeshStandardMaterial({ color: 0x65838a, metalness: 0.35, roughness: 0.7 }));
  panel.castShadow = true; panel.receiveShadow = true; door.add(panel);
  bindGeneratedProp(door, 'epilogue-reception-door', doorLeaves('epilogue-reception-door', [0, -1.7, 0], 6, 3.4));
  // Distant berth indicators promise arrival, without a fabricated full landing.
  for (let i = 0; i < 7; i++) {
    const x = 75 + i * 19, z = 54 + i * 9;
    k.box('steel', [x, 2.2, z], [0.8, 4.4, 0.8]);
    k.box('signal', [x, 4.5, z], [1.2, 0.4, 1.2], [0, 0, 0], false);
  }
  let target = 0, progress = 0, previous: number | undefined, first = true;
  const airCover = new DeferredAirCover(k.root);
  const apply = () => { door.position.y = 1.7 + progress * 3.5; };
  return { bounds: E.bounds, setFacts(facts) {
    airCover.setFacts(facts);
    target = facts.includes('reception-door-open') ? 1 : 0;
    if (first) { first = false; progress = target; apply(); }
  }, update(time) {
    airCover.update(time);
    const dt = previous === undefined ? 0 : Math.max(0, Math.min(0.1, time - previous)); previous = time;
    progress += Math.max(-dt / 2.0, Math.min(dt / 2.0, target - progress)); apply();
  }, dispose() { airCover.dispose(); } };
}

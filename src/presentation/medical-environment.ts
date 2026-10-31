import { BoxGeometry, Group, Mesh, MeshStandardMaterial, PointLight } from 'three';
import type { Vec3 } from '../contracts';
import { MEDICAL as M } from '../content/medical-layout';
import type { SceneDynamics } from './chapter-environments';
import { addGround, PortKit, type Surface } from './port-kit';

function block(k: PortKit, id: string, p: Vec3, size: Vec3, surface: Surface = 'pale') {
  k.box(surface, p, size); k.solid(id, p, size);
}
function desk(k: PortKit, id: string, p: Vec3, text: string) {
  block(k, id, [p[0], 0.52, p[2] - 1.35], [2.6, 1.04, 0.9], 'steel');
  k.box('white', [p[0], 1.075, p[2] - 1.35], [2.7, 0.07, 1.0]);
  k.box('glass', [p[0] + 0.6, 1.32, p[2] - 1.4], [0.65, 0.4, 0.08], [-0.15, 0, 0]);
  k.label(text, [p[0], 1.9, p[2] - 1.32], 2.4, 0.45);
}

/** Functional ward spaces are separate; task-controlled patient actors own both beds. */
export function buildMedical(k: PortKit): SceneDynamics {
  k.root.name = 'S11-old-maintenance-medical-station-placeholder';
  addGround(k.root, M.bounds);
  block(k, 'medical-ground', [-402, -0.2, 58], [44, 0.4, 52]);
  for (const x of [-424, -380]) block(k, `medical-boundary-x-${x}`, [x, 1.5, 58], [0.5, 3, 52]);
  for (const z of [32, 84]) block(k, `medical-boundary-z-${z}`, [-402, 1.5, z], [44, 3, 0.5]);
  block(k, 'medical-west-wall', [-420, 2.8, 56], [0.5, 5.6, 40], 'paint');
  block(k, 'medical-east-wall', [-384, 2.8, 56], [0.5, 5.6, 40], 'paint');
  block(k, 'medical-north-wall', [-402, 2.8, 36], [36, 5.6, 0.5], 'paint');
  for (const [x, w] of [[-411.5, 17], [-388, 8]]) block(k, `medical-entry-wall-${x}`, [x, 2.8, 76], [w, 5.6, 0.5]);
  block(k, 'medical-entry-lintel', [-398, 4.7, 76], [10, 1.8, 0.7], 'steel');
  block(k, 'medical-roof', [-402, 5.8, 56], [37, 0.4, 41]);
  k.part('arch', 'pale', [-402, 6, 56], [37, 7.5, 41]);
  k.label('旧检修站 / 医疗接收', [-398, 4.8, 76.4], 9, 0.9);
  // The maintenance floor has become a working medical station, not an empty
  // room built only for one scripted death.
  desk(k, 'medical-registration-desk', M.registration, '入站登记');
  desk(k, 'medical-equipment-table', M.equipment, '随身装备交接');
  desk(k, 'medical-record-desk', M.recordDesk, '伤情与转运记录');
  desk(k, 'medical-radio-table', M.radio, '接收通信');
  for (const x of [-417, -387]) {
    block(k, `medical-supply-locker-${x}`, [x, 1.3, 39], [3.2, 2.6, 1.5], 'steel');
    k.box('white', [x, 1.9, 39.78], [0.5, 0.75, 0.03]);
    for (const z of [50, 56, 68]) {
      block(k, `medical-supply-bin-${x}-${z}`, [x, 0.5, z], [1.6, 1, 1.2], 'pale');
      k.box('amber', [x, 1.03, z], [1.5, 0.06, 0.8]);
    }
  }
  block(k, 'medical-rest-bench', [-413.5, 0.43, 63.5], [4.5, 0.86, 0.9], 'pale');
  block(k, 'medical-rest-back', [-413.5, 1.2, 64], [4.5, 1.0, 0.15], 'paint');
  k.cylinder('white', [-414.5, 1.15, 60.2], 0.15, 0.25);
  block(k, 'medical-water-table', [-414.5, 0.48, 60.2], [1.1, 0.96, 0.8]);
  k.label('安置 / 休息', [-419.7, 3.0, 62], 6, 0.65, Math.PI / 2);
  k.label('孟齐 · 继续治疗', [-392, 3.4, 36.3], 7, 0.65);
  k.label('救治隔间', [-405, 3.4, 36.3], 7, 0.65);
  // No static mattress duplicates the actor-controlled beds at z44.
  for (const x of [-407, -390]) {
    k.cylinder('steel', [x, 1.3, 42], 0.035, 2.6);
    k.box('white', [x, 2.3, 42], [0.25, 0.4, 0.09]);
    k.cylinder('rubber', [x + 0.1, 1.6, 42], 0.015, 1.1);
  }
  for (const z of [44, 60, 70]) {
    k.box('signal', [-402, 5.45, z], [20, 0.08, 0.3], [0, 0, 0], false);
    const light = new PointLight(0xffe5bd, 54, 26, 2); light.position.set(-402, 4.9, z); k.root.add(light);
  }
  const curtain = new Group(); curtain.name = 'medical-treatment-curtain';
  curtain.position.set(-408.5, 2.05, 48.5); k.root.add(curtain);
  const material = new MeshStandardMaterial({ color: 0xa7c0b4, roughness: 0.95 });
  const sheet = new Mesh(new BoxGeometry(7, 3.6, 0.06), material); sheet.position.x = 3.5; sheet.castShadow = true; sheet.receiveShadow = true; curtain.add(sheet);
  k.cylinder('steel', [-405, 4.0, 48.5], 0.04, 7.4, [0, 0, Math.PI / 2]);
  let closed = false, progress = 0, previous: number | undefined, first = true;
  const apply = () => { curtain.scale.x = 0.06 + progress * 0.94; };
  apply();
  return { bounds: M.bounds, setFacts(facts) {
    closed = facts.includes('medical-curtain-closed') && !facts.includes('medical-curtain-open');
    if (first) { first = false; progress = closed ? 1 : 0; apply(); }
  }, update(time) {
    const dt = previous === undefined ? 0 : Math.max(0, Math.min(0.1, time - previous)); previous = time;
    progress += Math.max(-dt / 1.4, Math.min(dt / 1.4, (closed ? 1 : 0) - progress)); apply();
  } };
}

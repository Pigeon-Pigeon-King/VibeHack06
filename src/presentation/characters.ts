import { Group, MathUtils, Mesh, MeshStandardMaterial } from 'three';
import type { CharacterModel, CharacterRole, WeaponModel } from '../contracts';
import { characterMaterial, disposeModelTree, VertexParts } from './model-tools';
import { createPatientCart } from './patient-cart';

const C = {
  skin: 0xc49977, skinShade: 0xa77c5b, cloth: 0x4b6170, dark: 0x202c35,
  boots: 0x293035, white: 0xe3e1cf, steel: 0x65717a, rubber: 0x232b30,
  enemy: 0x594b44, armor: 0x363b41, worker: 0xd8a149, visor: 0x8fb8bf,
};

function joint(parent: Group, name: string, x: number, y: number, z = 0): Group {
  const group = new Group();
  group.name = name;
  group.position.set(x, y, z);
  parent.add(group);
  return group;
}

function makeCarbine(material: MeshStandardMaterial): { root: Group; magazine: Group; bolt: Group; muzzle: Group } {
  const root = new Group();
  root.name = 'carbine-placeholder';
  root.userData.assetStatus = 'placeholder';
  root.userData.forward = '-Z';
  new VertexParts()
    .box([0.12, 0.15, 0.44], [0, 0, -0.22], C.armor)
    .box([0.095, 0.105, 0.27], [0, 0, -0.54], C.steel)
    .box([0.075, 0.035, 0.52], [0, 0.094, -0.27], C.dark)
    .box([0.07, 0.23, 0.09], [0, -0.15, -0.02], C.rubber, [-0.18, 0, 0])
    .box([0.10, 0.105, 0.24], [0, -0.035, 0.11], C.steel)
    .box([0.12, 0.17, 0.055], [0, -0.035, 0.24], C.rubber)
    .cylinder(0.023, 0.30, [0, 0.018, -0.79], C.dark, [Math.PI / 2, 0, 0])
    .cylinder(0.032, 0.065, [0, 0.018, -0.935], C.steel, [Math.PI / 2, 0, 0])
    .box([0.014, 0.055, 0.018], [-0.037, 0.137, 0.016], C.dark)
    .box([0.014, 0.055, 0.018], [0.037, 0.137, 0.016], C.dark)
    .box([0.09, 0.013, 0.018], [0, 0.111, 0.016], C.dark)
    .box([0.018, 0.05, 0.02], [0, 0.135, -0.65], C.dark)
    .box([0.01, 0.008, 0.008], [0, 0.163, -0.648], C.white)
    .box([0.003, 0.026, 0.12], [0.062, 0.005, -0.21], C.white)
    .mesh(root, material, 'receiver-stock-barrel');
  const magazine = joint(root, 'magazine', 0, -0.07, -0.23);
  new VertexParts()
    .box([0.075, 0.23, 0.12], [0, -0.13, 0], C.dark, [-0.08, 0, 0])
    .box([0.085, 0.035, 0.14], [0, -0.25, 0.01], C.steel)
    .mesh(magazine, material, 'detachable-magazine');
  const bolt = joint(root, 'bolt', 0.073, 0.04, -0.14);
  new VertexParts().box([0.045, 0.027, 0.065], [0, 0, 0], C.steel).mesh(bolt, material, 'charging-handle');
  const muzzle = joint(root, 'muzzle', 0, 0.018, -0.97);
  muzzle.userData.forward = '-Z';
  return { root, magazine, bolt, muzzle };
}

function makeSidearm(material: MeshStandardMaterial): Group {
  const root = new Group(); root.name = 'sidearm-placeholder'; root.userData.assetStatus = 'placeholder';
  new VertexParts().box([0.08, 0.09, 0.28], [0, 0, -0.14], C.steel)
    .box([0.065, 0.18, 0.09], [0, -0.10, -0.035], C.dark, [-0.12, 0, 0])
    .box([0.045, 0.045, 0.07], [0, -0.015, -0.29], C.dark)
    .box([0.01, 0.025, 0.02], [0, 0.057, -0.25], C.white)
    .mesh(root, material, 'sidearm-body');
  return root;
}

export function createCharacter(role: CharacterRole): CharacterModel {
  if (role === 'cart') return createPatientCart();
  const root = new Group();
  root.name = `character-${role}`;
  root.userData.assetStatus = 'placeholder';
  root.userData.forward = '+Z';
  const body = joint(root, 'pose-root', 0, 0);
  const material = characterMaterial();
  const isChild = role === 'child';
  const military = role === 'enemy' || role === 'ally' || role === 'opponent';
  const hip = isChild ? 0.39 : 0.79;
  const shoulder = isChild ? 0.78 : 1.37;
  const legLength = isChild ? 0.34 : 0.66;
  const armLength = isChild ? 0.32 : 0.55;
  const torsoWidth = isChild ? 0.32 : 0.45;
  const legWidth = isChild ? 0.12 : 0.17;
  const armWidth = isChild ? 0.12 : 0.18;
  const headSize = isChild ? 0.29 : 0.32;
  const headY = isChild ? 0.99 : 1.62;
  const cloth = role === 'enemy' || role === 'opponent' ? C.enemy : role === 'worker' ? 0x56666b : role === 'civilian' ? 0x786b71 : role === 'father' ? 0x7d6651 : role === 'medic' ? 0xc3c9c2 : isChild ? 0x6b8b98 : C.cloth;
  const torso = new VertexParts()
    .box([torsoWidth, shoulder - hip, isChild ? 0.20 : 0.28], [0, (shoulder + hip) / 2, 0], cloth)
    .box([torsoWidth + 0.025, 0.07, isChild ? 0.22 : 0.30], [0, hip + 0.06, 0], C.dark);
  if (military) {
    torso.box([0.36, 0.35, 0.09], [0, 1.17, 0.18], role === 'enemy' ? C.armor : 0x334956)
      .box([0.34, 0.36, 0.11], [0, 1.14, -0.19], C.dark)
      .box([0.13, 0.13, 0.07], [-0.10, 1.04, 0.25], C.steel)
      .box([0.13, 0.13, 0.07], [0.10, 1.04, 0.25], C.steel);
    if (role === 'ally') torso.box([0.19, 0.06, 0.012], [0, 1.30, 0.232], C.white);
  } else if (role === 'worker') {
    torso.box([0.40, 0.40, 0.035], [0, 1.12, 0.16], C.worker)
      .box([0.40, 0.05, 0.045], [0, 1.14, 0.17], C.white)
      .box([0.05, 0.38, 0.045], [-0.13, 1.13, 0.17], C.white)
      .box([0.05, 0.38, 0.045], [0.13, 1.13, 0.17], C.white);
  } else if (role === 'medic') {
    torso.box([0.34, 0.24, 0.05], [0, 1.14, 0.17], C.dark)
      .box([0.21, 0.06, 0.02], [0, 1.14, 0.205], C.white)
      .box([0.06, 0.17, 0.02], [0, 1.14, 0.206], C.white)
      .box([0.25, 0.30, 0.17], [-0.28, 0.90, 0], 0x936f40);
  } else if (role === 'father') {
    torso.box([0.07, 0.53, 0.035], [0, 1.12, 0.158], 0xae9b82)
      .box([0.15, 0.13, 0.035], [-0.12, 1.16, 0.17], 0x4d5458);
  }
  torso.mesh(body, material, 'torso-and-equipment');
  const head = joint(body, 'head', 0, headY);
  const face = new VertexParts().box([headSize, headSize, headSize * 0.9], [0, 0, 0], C.skin);
  if (role === 'enemy') {
    face.box([0.37, 0.30, 0.34], [0, 0.065, -0.015], C.armor)
      .box([0.34, 0.12, 0.05], [0, 0.0, 0.165], C.dark)
      .box([0.25, 0.055, 0.015], [0, 0.025, 0.198], C.visor)
      .box([0.22, 0.10, 0.06], [0, -0.10, 0.17], C.steel);
  } else {
    face.box([0.04, 0.022, 0.012], [-headSize * 0.22, 0.015, headSize * 0.46], C.dark)
      .box([0.04, 0.022, 0.012], [headSize * 0.22, 0.015, headSize * 0.46], C.dark)
      .box([0.065, 0.018, 0.016], [0, -headSize * 0.23, headSize * 0.46], C.skinShade);
    const hat = role === 'worker' ? C.worker : role === 'medic' ? C.white : role === 'father' ? 0x45494b : C.dark;
    face.box([headSize + 0.03, headSize * 0.33, headSize + 0.02], [0, headSize * 0.40, -0.012], hat);
    if (role === 'worker' || role === 'ally') face.box([0.40, 0.035, 0.40], [0, 0.10, 0.005], role === 'worker' ? C.worker : C.cloth);
  }
  face.mesh(head, material, 'head-face-and-headwear');
  const arms: Group[] = [];
  const elbows: Group[] = [];
  const legs: Group[] = [];
  for (const side of [-1, 1]) {
    const arm = joint(body, side < 0 ? 'left-shoulder' : 'right-shoulder', side * (torsoWidth / 2 + armWidth / 2 + 0.015), shoulder - 0.045);
    new VertexParts()
      .box([armWidth, armLength * 0.50, armWidth], [0, -armLength * 0.22, 0], cloth)
      .box([armWidth + 0.015, 0.055, armWidth + 0.015], [0, -armLength * 0.21, 0], role === 'ally' || role === 'medic' ? C.white : cloth)
      .mesh(arm, material, 'upper-arm');
    const elbow = joint(arm, side < 0 ? 'left-elbow' : 'right-elbow', 0, -armLength * 0.47);
    new VertexParts()
      .box([armWidth * 0.90, armLength * 0.41, armWidth * 0.90], [0, -armLength * 0.17, 0], cloth)
      .box([armWidth * 0.85, isChild ? 0.09 : 0.115, armWidth * 0.85], [0, -armLength * 0.43, 0], military ? C.dark : C.skin)
      .mesh(elbow, material, 'forearm-and-hand');
    arms.push(arm); elbows.push(elbow);
    const leg = joint(body, side < 0 ? 'left-hip' : 'right-hip', side * (isChild ? 0.09 : 0.125), hip);
    new VertexParts()
      .box([legWidth, legLength, legWidth * 1.1], [0, -legLength / 2, 0], C.dark)
      .box([legWidth * 1.17, isChild ? 0.065 : 0.11, legWidth * 1.7], [0, -hip + (isChild ? 0.035 : 0.055), 0.04], C.boots)
      .box([legWidth * 1.03, isChild ? 0.08 : 0.13, 0.035], [0, -legLength * 0.55, legWidth * 0.63], military ? C.steel : C.dark)
      .mesh(leg, material, 'leg-knee-and-boot');
    legs.push(leg);
  }
  const weapon = role === 'opponent' ? { root: makeSidearm(material) } : military || role === 'father' ? makeCarbine(material) : null;
  if (weapon) {
    body.add(weapon.root);
    weapon.root.scale.setScalar(0.68);
    weapon.root.rotation.y = Math.PI;
  }
  root.traverse(object => {
    if (object instanceof Mesh) object.castShadow = ['torso-and-equipment', 'head-face-and-headwear', 'leg-knee-and-boot'].includes(object.name);
  });
  let disposed = false;
  const setPose: CharacterModel['setPose'] = ({ walk, aiming, down, carrying, armed = military, kneeling = false, crouched = false, gesture = 0, lookAway = 0, care = false, reaching = 0, restrained = false }) => {
    const stride = Math.sin(walk) * 0.48;
    body.position.y = down ? 0.24 : crouched ? -0.68 : kneeling ? -0.36 : Math.abs(Math.sin(walk * 2)) * 0.018;
    body.rotation.set(down ? Math.PI / 2 : MathUtils.clamp(reaching, 0, 1) * 0.45, 0, 0);
    head.rotation.x = down ? 0.12 : aiming ? -0.055 : 0;
    head.rotation.y = down ? 0 : lookAway;
    for (let i = 0; i < 2; i++) {
      const sign = i === 0 ? 1 : -1;
      legs[i].position.y = hip + (crouched && !down ? 0.28 : 0);
      legs[i].rotation.x = down ? 0.05 * sign : crouched ? 1.25 + stride * sign * 0.1 : kneeling ? 1.03 : stride * sign;
      arms[i].rotation.set(down ? 0.35 * sign : carrying ? -1.40 : aiming && armed ? -1.18 : -stride * sign * 0.7, 0, down ? 0.25 * sign : aiming || carrying ? sign * 0.20 : sign * 0.035);
      elbows[i].rotation.x = carrying ? -0.10 : aiming && armed ? -0.40 : -0.06;
    }
    if (!armed && !down && !carrying && gesture) {
      arms[1].rotation.x -= gesture * 0.6; elbows[1].rotation.x -= gesture * 0.8;
    }
    if (care && !down) {
      // Kneeling shoulders are 0.965m high. These two joints put the hands
      // at approximately 0.55m / 0.27m forward, beside the seated knee straps.
      arms.forEach((arm, i) => { arm.rotation.set(-0.56, 0, i ? -0.30 : 0.30); elbows[i].rotation.x = -0.04; });
    }
    if (reaching > 0 && !down) {
      arms[1].rotation.x = -0.6 * reaching; elbows[1].rotation.x = -0.2 * reaching; head.rotation.x = 0.25 * reaching;
    }
    if (restrained && !down) {
      arms.forEach((arm, i) => { arm.rotation.set(0.7, 0, i ? -0.3 : 0.3); elbows[i].rotation.x = -1; });
    }
    if (weapon) {
      weapon.root.position.set(0.14, aiming ? 1.35 : 1.00, aiming ? 0.30 : 0.24);
      weapon.root.rotation.x = aiming ? 0 : -0.66;
      weapon.root.visible = armed && !carrying;
    }
  };
  setPose({ walk: 0, aiming: false, down: false });
  return { root, setPose, dispose() { if (!disposed) { disposed = true; disposeModelTree(root); } } };
}

export function createWeaponView(): WeaponModel {
  const root = new Group();
  root.name = 'first-person-viewmodel';
  root.userData.assetStatus = 'placeholder';
  root.userData.forward = '-Z';
  const material = characterMaterial();
  const carbine = makeCarbine(material);
  root.add(carbine.root);
  const rightHand = joint(root, 'right-grip-arm', 0.06, -0.14, -0.02);
  new VertexParts()
    .box([0.12, 0.12, 0.16], [0, 0, 0], C.dark)
    .box([0.14, 0.15, 0.30], [0.07, -0.08, 0.19], C.cloth, [0.2, -0.2, 0])
    .box([0.145, 0.04, 0.14], [0.025, -0.035, 0.105], C.white)
    .mesh(rightHand, material, 'right-glove-sleeve');
  const leftHand = joint(root, 'left-support-arm', -0.055, -0.085, -0.48);
  new VertexParts()
    .box([0.12, 0.11, 0.15], [0, 0, 0], C.dark)
    .box([0.15, 0.14, 0.34], [-0.10, -0.11, 0.20], C.cloth, [-0.25, 0.40, 0])
    .mesh(leftHand, material, 'left-glove-sleeve');
  root.traverse(object => {
    object.renderOrder = 2;
    if (object instanceof Mesh) { object.castShadow = false; object.receiveShadow = false; }
  });
  let disposed = false;
  const setPose: WeaponModel['setPose'] = (recoil, reloadFraction, ads, walk) => {
    const aim = MathUtils.clamp(ads, 0, 1);
    const phase = MathUtils.clamp(reloadFraction, 0, 1);
    const reload = phase > 0 ? Math.sin(Math.PI * phase) : 0;
    const kick = MathUtils.clamp(recoil, 0, 1);
    root.position.set(MathUtils.lerp(0.22, 0, aim) + Math.sin(walk) * 0.008 * (1 - aim), MathUtils.lerp(-0.25, -0.163, aim) - reload * 0.09 + Math.sin(walk * 2) * 0.007 * (1 - aim), MathUtils.lerp(-0.38, -0.27, aim) + kick * 0.06);
    root.rotation.set(kick * 0.035 + reload * 0.28, -reload * 0.14, reload * 0.30);
    carbine.magazine.position.y = -0.07 - Math.sin(Math.PI * MathUtils.clamp((phase - 0.15) / 0.65, 0, 1)) * 0.26;
    carbine.bolt.position.z = -0.14 + kick * 0.07;
    leftHand.position.set(-0.055, -0.085 - reload * 0.20, -0.48 + reload * 0.26);
    leftHand.rotation.z = reload * 0.35;
  };
  setPose(0, 0, 0, 0);
  return { root, muzzle: carbine.muzzle, setPose, dispose() { if (!disposed) { disposed = true; disposeModelTree(root); } } };
}

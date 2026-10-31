import * as THREE from 'three';
import { createReusedAircraft } from '/src/presentation/reused-aircraft.ts';
import { EpilogueAirCover } from '/src/presentation/EpilogueAirCover.ts';
import { createIndirectLighting } from '/src/presentation/IndirectLighting.ts';

const stats = document.querySelector('#stats');
const errors = document.querySelector('#errors');
const clock = document.querySelector('#clock');
const timeLabel = document.querySelector('#time');
let errorCount = 0;
function reportError(message) { errorCount++; errors.textContent = `错误：${errorCount}\n${String(message)}`; }
window.addEventListener('error', event => reportError(event.message));
window.addEventListener('unhandledrejection', event => reportError(event.reason));

const scene = new THREE.Scene();
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.domElement.setAttribute('aria-label', '原工厂飞机检视画面');
document.body.prepend(renderer.domElement);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, .045, 1000);
camera.rotation.order = 'YXZ';
const indirect = createIndirectLighting(renderer);
scene.environment = indirect.texture;
scene.environmentIntensity = .55;
scene.add(new THREE.HemisphereLight(0xc5dbe5, 0x45515d, 1.75));
const key = new THREE.DirectionalLight(0xe5edf0, 2.45);
key.position.set(-36, 64, 26); key.target.position.set(0, 0, 45); scene.add(key, key.target);

const nearGroup = new THREE.Group(), patrolGroup = new THREE.Group();
scene.add(nearGroup, patrolGroup);
const aircraft = createReusedAircraft(); nearGroup.add(aircraft.root);
const airCover = new EpilogueAirCover(patrolGroup);
airCover.setFacts(['first-wave-approaching']); airCover.update(0); airCover.update(6);
const grid = new THREE.GridHelper(50, 25, 0x6e8395, 0x344c60); grid.position.y = -2.05; nearGroup.add(grid);
const normalMaterial = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide });
const basicMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
let mode = 'near', materialMode = 'original', hover = false, time = 6, last = performance.now();
function setPressed(ids, active) { for (const id of ids) document.getElementById(id).setAttribute('aria-pressed', String(id === active)); }
function setMode(value) {
  mode = value; setPressed(['near', 'near-gray', 's12', 's12-clear'], value);
  const close = value.startsWith('near'); nearGroup.visible = close; patrolGroup.visible = !close;
  camera.fov = close ? 50 : 75;
  if (close) { camera.position.set(18, 10, -23); camera.lookAt(0, 0, -1); }
  else { camera.position.set(-4.1, 1.7, -1.05); camera.rotation.set(80 * 2.6 / 720, 0, 0, 'YXZ'); }
  scene.background = new THREE.Color(value === 'near' ? 0x1e2a35 : 0x677e8d);
  scene.fog = value === 's12' || value === 'near-gray' ? new THREE.FogExp2(0x677e8d, .004) : null;
  camera.updateProjectionMatrix();
}
function setMaterial(value) {
  materialMode = value; setPressed(['original','normal','basic'], value);
  scene.overrideMaterial = value === 'normal' ? normalMaterial : value === 'basic' ? basicMaterial : null;
}
function seek(value) {
  time = Number(value); clock.value = String(time); timeLabel.textContent = `${time.toFixed(1)} s`;
  airCover.setFacts([]); airCover.setFacts(['first-wave-approaching']); airCover.update(0); airCover.update(time);
}
for (const id of ['near','near-gray','s12','s12-clear']) document.getElementById(id).addEventListener('click', () => setMode(id));
for (const id of ['original','normal','basic']) document.getElementById(id).addEventListener('click', () => setMaterial(id));
document.getElementById('gear').addEventListener('click', event => { hover = !hover; event.currentTarget.setAttribute('aria-pressed', String(hover)); });
clock.addEventListener('input', () => seek(clock.value));
window.addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
setMode('near');

function frame(now) {
  const dt = Math.min(.1, (now-last)/1000); last = now;
  if (document.getElementById('play').checked) { time += dt; if (time > 52) seek(0); else { airCover.update(time); clock.value = String(time); timeLabel.textContent = `${time.toFixed(1)} s`; } }
  aircraft.setFlightState({ thrust: .68, gear: hover ? 1 : 0, tilt: hover ? 1 : 0, timeSeconds: time });
  renderer.render(scene, camera);
  const roots = mode.startsWith('near') ? [aircraft.root] : patrolGroup.children;
  const detail = roots.map(root => {
    let visibleMeshes = 0; root.traverseVisible(object => { if (object.isMesh) visibleMeshes++; });
    const center = root.getWorldPosition(new THREE.Vector3()), ndc = center.clone().project(camera);
    return `${root.name}: visible=${root.visible}, mesh=${visibleMeshes}, layer=${root.layers.mask}, pos=[${center.toArray().map(v=>v.toFixed(1))}], NDC=[${ndc.toArray().map(v=>v.toFixed(2))}]`;
  }).join('\n');
  stats.textContent = `模式=${mode} / 材质=${materialMode} / 时间=${time.toFixed(1)}s\nDraw=${renderer.info.render.calls} Tri=${renderer.info.render.triangles} Geo=${renderer.info.memory.geometries}\nCamera=[${camera.position.toArray().map(v=>v.toFixed(2))}] pitch=${camera.rotation.x.toFixed(3)} yaw=${camera.rotation.y.toFixed(3)} fog=${scene.fog?.density ?? 0}\n${detail}`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.addEventListener('pagehide', () => { airCover.dispose(); aircraft.dispose(); indirect.dispose(); normalMaterial.dispose(); basicMaterial.dispose(); renderer.dispose(); }, { once: true });

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { writeFileSync } from 'node:fs';
import { Box3, BoxGeometry, Frustum, Group, Matrix4, Mesh, MeshBasicMaterial, PerspectiveCamera, Raycaster, Vector3 } from 'three';
import { EpilogueAirCover } from '../src/presentation/EpilogueAirCover';
import * as factory from '../src/presentation/reused-aircraft';
import { buildEpilogue } from '../src/presentation/epilogue-environment';
import { PortKit } from '../src/presentation/port-kit';
import { disposeModelTree } from '../src/presentation/model-tools';

const controllers: EpilogueAirCover[] = [];
const arrival = Object.freeze(['fleet-reception-acknowledged', 'first-wave-approaching']);
const realAircraftFactory = factory.createReusedAircraft;
// Long trajectory sampling exercises this controller, not the separately tested
// 79-mesh factory on every step. A real-factory integration check remains below.
function testAircraft(): factory.ReusedAircraft {
  const root = new Group(), geometry = new BoxGeometry(), material = new MeshBasicMaterial();
  const mesh = new Mesh(geometry, material); mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh);
  return { root, setFlightState(state) { root.userData.flightState = { ...state }; }, dispose() { geometry.dispose(); material.dispose(); root.removeFromParent(); root.clear(); } };
}
beforeEach(() => { vi.spyOn(factory, 'createReusedAircraft').mockImplementation(testAircraft); });
afterEach(() => { controllers.splice(0).forEach(controller => controller.dispose()); vi.restoreAllMocks(); });

function cover() {
  const parent = new Group(), controller = new EpilogueAirCover(parent);
  controllers.push(controller);
  return { parent, controller, planes: [...parent.children] };
}
const snapshot = (root: Group) => root.children.map(child => ({ position: child.position.toArray(), quaternion: child.quaternion.toArray(), state: { ...child.userData.flightState } }));

describe('S12 air-cover fact and simulation-clock ownership', () => {
  it('creates only two hidden escorts and ignores unrelated reception facts', () => {
    const { parent, controller, planes } = cover();
    expect(parent.children).toHaveLength(2);
    controller.setFacts(['reception-door-open', 'first-workers-entering', 'first-workers-received']);
    controller.update(800);
    expect(planes.every(plane => !plane.visible)).toBe(true);
    for (const plane of planes) plane.traverse(object => {
      if (object instanceof Mesh) { expect(object.castShadow).toBe(false); expect(object.receiveShadow).toBe(false); }
    });
  });

  it('samples activation on the first valid update rather than the absolute chapter clock', () => {
    const one = cover(), two = cover();
    one.controller.setFacts(arrival); two.controller.setFacts(arrival);
    one.controller.update(NaN); one.controller.update(-1);
    expect(one.planes.every(plane => !plane.visible)).toBe(true);
    one.controller.update(900); two.controller.update(0);
    expect(snapshot(one.parent)).toEqual(snapshot(two.parent));
    expect(one.planes.every(plane => plane.visible)).toBe(true);
    const initial = one.planes[0].position.clone();
    one.controller.update(906); two.controller.update(6);
    expect(snapshot(one.parent)).toEqual(snapshot(two.parent));
    expect(one.planes[0].position.distanceTo(initial)).toBeGreaterThan(70);
    expect(one.planes[0].position.distanceTo(new Vector3(-4, 0, 8))).toBeLessThan(180);
    expect(arrival).toEqual(['fleet-reception-acknowledged', 'first-wave-approaching']);
  });

  it('freezes repeated simulation time and resumes from the exact paused pose', () => {
    const { parent, controller, planes } = cover();
    controller.setFacts(arrival); controller.update(100); controller.update(113.7);
    const paused = snapshot(parent);
    for (let i = 0; i < 200; i++) controller.update(113.7);
    expect(snapshot(parent)).toEqual(paused);
    const position = planes[0].position.clone();
    controller.update(113.8);
    expect(planes[0].position.distanceTo(position)).toBeGreaterThan(1);
    expect(planes[0].position.distanceTo(position)).toBeLessThan(4);
  });

  it('ignores invalid samples and re-anchors a clock rewind without teleporting', () => {
    const { parent, controller, planes } = cover();
    controller.setFacts(arrival); controller.update(20); controller.update(40);
    const before = snapshot(parent), position = planes[0].position.clone();
    controller.update(Infinity); controller.update(NaN); controller.update(-30);
    expect(snapshot(parent)).toEqual(before);
    controller.update(2);
    expect(snapshot(parent)).toEqual(before);
    controller.update(2.1);
    expect(planes[0].position.distanceTo(position)).toBeGreaterThan(1);
    expect(planes[0].position.distanceTo(position)).toBeLessThan(4);
  });

  it('does not restart on repeated facts, but a restored fact can start a new approach', () => {
    const { parent, controller, planes } = cover();
    controller.setFacts(arrival); controller.update(0);
    const initial = snapshot(parent); controller.update(14);
    const flying = snapshot(parent);
    controller.setFacts([...arrival]); controller.update(14);
    expect(snapshot(parent)).toEqual(flying);
    controller.setFacts([]); controller.update(100);
    expect(planes.every(plane => !plane.visible)).toBe(true);
    controller.setFacts(arrival); controller.update(200);
    expect(snapshot(parent)).toEqual(initial);
    expect(parent.children).toHaveLength(2);
  });
});

describe('continuous perimeter flight and separation', () => {
  it('joins approach to patrol with continuous position, tangent and bank', () => {
    const { controller, planes } = cover();
    controller.setFacts(arrival); controller.update(0);
    controller.update(5.99); const before = planes[0].position.clone(), beforeRotation = planes[0].quaternion.clone();
    controller.update(6); const middle = planes[0].position.clone();
    controller.update(6.01); const after = planes[0].position.clone();
    const incoming = middle.clone().sub(before), outgoing = after.clone().sub(middle);
    expect(incoming.length()).toBeLessThan(0.3); expect(outgoing.length()).toBeLessThan(0.3);
    expect(incoming.normalize().dot(outgoing.normalize())).toBeGreaterThan(0.9999);
    expect(beforeRotation.angleTo(planes[0].quaternion)).toBeLessThan(0.02);
  });

  it('faces the path tangent while remaining outside the walkable shore with safe separation', () => {
    const { parent, controller, planes } = cover();
    controller.setFacts(arrival); controller.update(0);
    let previous = planes.map(plane => plane.position.clone());
    let maxStep = 0, minStep = Infinity, minTangent = 1, minAltitude = Infinity, minClearance = Infinity, minSeparation = Infinity;
    let minCount = Infinity, maxCount = 0, cruiseConfiguration = true;
    for (let frame = 1; frame <= 3600; frame++) {
      controller.update(frame / 20);
      for (let i = 0; i < planes.length; i++) {
        const plane = planes[i], delta = plane.position.clone().sub(previous[i]);
        maxStep = Math.max(maxStep, delta.length()); minStep = Math.min(minStep, delta.length());
        minTangent = Math.min(minTangent, new Vector3(0, 0, -1).applyQuaternion(plane.quaternion).dot(delta.normalize()));
        minAltitude = Math.min(minAltitude, plane.position.y);
        // Nearest point on the actual S12 walkable rectangle: x[-430,30], z[-10,100].
        const nearest = new Vector3(Math.max(-430, Math.min(30, plane.position.x)), plane.position.y, Math.max(-10, Math.min(100, plane.position.z)));
        minClearance = Math.min(minClearance, plane.position.distanceTo(nearest));
        cruiseConfiguration &&= plane.userData.flightState.gear === 0 && plane.userData.flightState.tilt === 0;
      }
      minSeparation = Math.min(minSeparation, planes[0].position.distanceTo(planes[1].position));
      minCount = Math.min(minCount, parent.children.length); maxCount = Math.max(maxCount, parent.children.length);
      previous = planes.map(plane => plane.position.clone());
    }
    expect(maxStep).toBeLessThan(6); expect(minStep).toBeGreaterThan(0.5);
    expect(minTangent).toBeGreaterThan(0.995); expect(minAltitude).toBeGreaterThanOrEqual(60);
    expect(minClearance).toBeGreaterThan(30); expect(minSeparation).toBeGreaterThan(70);
    expect(cruiseConfiguration).toBe(true); expect(minCount).toBe(2); expect(maxCount).toBe(2);
  });

  it('does not reset at a patrol lap boundary and is independent of update rate', () => {
    const slow = cover(), fast = cover();
    slow.controller.setFacts(arrival); fast.controller.setFacts(arrival);
    slow.controller.update(0); fast.controller.update(0);
    for (let i = 1; i <= 600; i++) slow.controller.update(i / 10);
    for (let i = 1; i <= 3600; i++) fast.controller.update(i / 60);
    slow.planes.forEach((plane, i) => {
      expect(plane.position.distanceTo(fast.planes[i].position)).toBeLessThan(0.0000001);
      expect(plane.quaternion.angleTo(fast.planes[i].quaternion)).toBeLessThan(0.0000001);
    });
    const period = 2 * Math.PI * 160 / 22;
    const boundary = 6 + period * 2;
    slow.controller.update(boundary - 0.01); const before = slow.planes[0].position.clone();
    slow.controller.update(boundary + 0.01);
    expect(slow.planes[0].position.distanceTo(before)).toBeLessThan(0.5);
  });

  it('detaches both aircraft before either factory cleanup, and remains inert after dispose', () => {
    const parent = new Group(), unrelated = new Group(); parent.add(unrelated);
    const disposalCounts: number[] = [];
    const factorySpy = vi.spyOn(factory, 'createReusedAircraft').mockImplementation(() => {
      const aircraft = testAircraft(), release = aircraft.dispose;
      return { ...aircraft, dispose() { disposalCounts.push(parent.children.filter(node => node !== unrelated).length); release(); } };
    });
    const controller = new EpilogueAirCover(parent); controllers.push(controller);
    controller.setFacts(arrival); controller.update(0); controller.update(12);
    controller.dispose(); controller.dispose();
    expect(disposalCounts).toEqual([0, 0]);
    expect(parent.children).toEqual([unrelated]);
    controller.setFacts(arrival); controller.update(999);
    expect(factorySpy).toHaveBeenCalledTimes(2);
    expect(parent.children).toEqual([unrelated]);
  });

  it('accepts two real source-preserving aircraft with the same flight-state contract', () => {
    vi.restoreAllMocks();
    const { parent, controller, planes } = cover();
    controller.setFacts(arrival); controller.update(100); controller.update(112);
    expect(parent.children).toHaveLength(2);
    for (const plane of planes) {
      expect(plane.userData.assetId).toBe('AIR-VTOL-F35B-REUSED');
      expect(plane.userData.role).toBe('distant-air-cover');
      expect(plane.visible).toBe(true);
      expect(plane.userData.flightState).toMatchObject({ thrust: 0.68, gear: 0, tilt: 0, timeSeconds: 12 });
      expect(plane.position.toArray().every(Number.isFinite)).toBe(true);
    }
    controller.dispose();
    expect(parent.children).toHaveLength(0);
  }, 20_000);

  it('puts actual aircraft geometry in the door camera frustum, clear of the real roof and arch, during reception', () => {
    const reference = realAircraftFactory();
    const kit = new PortKit(), environment = buildEpilogue(kit);
    kit.flush(); environment.setFacts(['reception-door-open']); environment.update(0); kit.root.updateMatrixWorld(true);
    try {
      reference.setFlightState({ thrust: 0.68, gear: 0, tilt: 0, timeSeconds: 0 });
      const localBounds = new Box3();
      const pieces: Array<{ mesh: Mesh; sourceMatrix: Matrix4 }> = [];
      reference.root.traverseVisible(object => {
        if (!(object instanceof Mesh)) return;
        object.geometry.computeBoundingBox();
        localBounds.union(object.geometry.boundingBox!.clone().applyMatrix4(object.matrixWorld));
        pieces.push({ mesh: object, sourceMatrix: object.matrixWorld.clone() });
      });
      const corners: Vector3[] = [];
      for (const x of [localBounds.min.x, localBounds.max.x]) for (const y of [localBounds.min.y, localBounds.max.y]) for (const z of [localBounds.min.z, localBounds.max.z]) corners.push(new Vector3(x, y, z));
      const localCenter = localBounds.getCenter(new Vector3()), bodyRadius = localBounds.getSize(new Vector3()).length() / 2;
      const views = [
        { name: 'supplied-inside-door', position: [-5.73, 1.65, 2.31] },
        { name: 'outside-north-roof-edge', position: [-5.73, 1.65, -5.5] },
      ].map(view => {
        const camera = new PerspectiveCamera(75, 1366 / 768, 0.045, 1000);
        camera.position.fromArray(view.position); camera.rotation.set(0, 0.7099, 0, 'YXZ'); camera.updateMatrixWorld(true);
        const projection = new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        return { ...view, camera, projection, frustum: new Frustum().setFromProjectionMatrix(projection) };
      });
      type Sample = { time: number; visible: boolean; inFrustum: boolean; unobstructed: boolean; spanPixels: number; transmission: number };
      const samples = views.map(() => [[], []] as Sample[][]);
      const vertexProjectionSamples: Array<{ camera: string; time: number; aircraft: number; width: number; height: number }> = [];
      const { controller, parent, planes } = cover(); controller.setFacts(arrival); controller.update(0);
      const ray = new Raycaster(), direction = new Vector3(), projected = new Vector3(), point = new Vector3();
      let minCenterSeparation = Infinity, minSurfaceSeparation = Infinity, minWalkwayClearance = Infinity, minAltitude = Infinity;
      const bodyWorldCenters = [new Vector3(), new Vector3()];
      for (let frame = 0; frame <= 1800; frame++) {
        const time = frame / 10;
        controller.update(time); parent.updateMatrixWorld(true);
        minCenterSeparation = Math.min(minCenterSeparation, planes[0].position.distanceTo(planes[1].position));
        for (let aircraft = 0; aircraft < planes.length; aircraft++) {
          const plane = planes[aircraft], worldCorners = corners.map(corner => corner.clone().applyMatrix4(plane.matrixWorld));
          const bounds = new Box3().setFromPoints(worldCorners);
          bodyWorldCenters[aircraft].copy(localCenter).applyMatrix4(plane.matrixWorld);
          minAltitude = Math.min(minAltitude, bounds.min.y);
          const gapX = Math.max(-430 - bounds.max.x, bounds.min.x - 30, 0);
          const gapZ = Math.max(-10 - bounds.max.z, bounds.min.z - 100, 0);
          minWalkwayClearance = Math.min(minWalkwayClearance, Math.hypot(gapX, gapZ));
          if (time > 15) continue;
          for (let viewIndex = 0; viewIndex < views.length; viewIndex++) {
            const view = views[viewIndex], camera = view.camera;
            const inFrustum = worldCorners.every(corner => view.frustum.containsPoint(corner));
            const depth = -bodyWorldCenters[aircraft].clone().applyMatrix4(camera.matrixWorldInverse).z;
            const transmission = Math.exp(-Math.pow(0.004 * Math.max(0, depth), 2));
            let unobstructed = false, spanPixels = 0;
            if (inFrustum) {
              let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
              for (const corner of worldCorners) {
                projected.copy(corner).applyMatrix4(view.projection);
                minX = Math.min(minX, projected.x); maxX = Math.max(maxX, projected.x);
                minY = Math.min(minY, projected.y); maxY = Math.max(maxY, projected.y);
              }
              spanPixels = Math.max((maxX - minX) * 683, (maxY - minY) * 384);
              // Center plus all eight conservative hull corners. Full environment
              // includes the actual box roof, generated arch, lintel and open door.
              unobstructed = [...worldCorners, bodyWorldCenters[aircraft]].every(target => {
                direction.copy(target).sub(camera.position); const distance = direction.length();
                ray.set(camera.position, direction.divideScalar(distance)); ray.near = 0.045; ray.far = distance - 0.01;
                return ray.intersectObject(kit.root, true).length === 0;
              });
            }
            const visible = inFrustum && unobstructed && transmission >= 0.20 && spanPixels >= 18 && spanPixels <= 150;
            samples[viewIndex][aircraft].push({ time, visible, inFrustum, unobstructed, spanPixels, transmission });
            // At representative visible frames, measure every real source vertex,
            // not the larger conservative hull used by the interval gate above.
            if (visible && [6, 10, 14].includes(time)) {
              let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
              const viewModel = new Matrix4().multiplyMatrices(view.projection, plane.matrixWorld);
              for (const { mesh, sourceMatrix } of pieces) {
                const transform = new Matrix4().multiplyMatrices(viewModel, sourceMatrix), vertices = mesh.geometry.getAttribute('position');
                for (let i = 0; i < vertices.count; i++) {
                  point.fromBufferAttribute(vertices, i).applyMatrix4(transform);
                  minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x); minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y);
                }
              }
              vertexProjectionSamples.push({ camera: view.name, time, aircraft: aircraft + 1, width: (maxX - minX) * 683, height: (maxY - minY) * 384 });
            }
          }
        }
        minSurfaceSeparation = Math.min(minSurfaceSeparation, bodyWorldCenters[0].distanceTo(bodyWorldCenters[1]) - 2 * bodyRadius);
      }
      const intervals = (rows: Sample[]) => {
        const ranges: Array<{ start: number; endInclusive: number }> = [];
        for (let i = 0; i < rows.length; i++) {
          if (!rows[i].visible) continue;
          const start = rows[i].time;
          while (i + 1 < rows.length && rows[i + 1].visible) i++;
          ranges.push({ start, endInclusive: rows[i].time });
        }
        return ranges;
      };
      const cameras = views.map((view, viewIndex) => ({
        name: view.name, position: view.position, yaw: 0.7099, pitch: 0, verticalFov: 75, width: 1366, height: 768, far: 1000,
        aircraft: samples[viewIndex].map((rows, index) => {
          const visible = rows.filter(row => row.visible);
          return { aircraft: index + 1, visibleRangesAtTenthSecondSamples: intervals(rows), visibleSecondsBefore14: rows.filter(row => row.visible && row.time < 14).length / 10,
            minimumFogTransmission: Math.min(...visible.map(row => row.transmission)), hullPixelSpan: { min: Math.min(...visible.map(row => row.spanPixels)), max: Math.max(...visible.map(row => row.spanPixels)) },
            blockedSampleCount: rows.filter(row => row.inFrustum && !row.unobstructed).length };
        }),
        bothVisibleSecondsBefore14: samples[viewIndex][0].filter((row, index) => row.time < 14 && row.visible && samples[viewIndex][1][index].visible).length / 10,
      }));
      writeFileSync(new URL('../artifacts/asset-aircover-visibility-tests.json', import.meta.url), JSON.stringify({
        status: 'numeric-visibility-only-browser-verification-pending', sampleSeconds: 0.1, visibilityWindowSeconds: [0, 15], clearanceWindowSeconds: [0, 180],
        geometry: { sourceRevision: reference.root.userData.sourceRevision, sourceMeshes: pieces.length, triangles: pieces.reduce((sum, piece) => sum + piece.mesh.geometry.getAttribute('position').count / 3, 0), localBounds: { min: localBounds.min.toArray(), max: localBounds.max.toArray() } },
        occlusion: { source: 'Actual buildEpilogue + PortKit batches, with reception-door-open; includes box roof, generated arch and lintel', probes: 'Actual geometry hull corners and center, all must be unoccluded', labels: 'DOM-only label canvases are absent in Node' },
        assumedS12FogDensity: 0.004, fogMetric: 'exp(-(density * cameraViewDepth)^2), minimum 0.20 for interval gate',
        acceptance: { leadVisibleBySeconds: 6.5, wingmanVisibleBySeconds: 11, leadVisibleBefore14Seconds: '> 5', wingmanAndBothVisibleBefore14Seconds: '> 2', actualVertexPixelSpan: '> 18 and < 140', nearPassPixelSpan: '> 70 and < 140', centerSeparationMeters: '> 70', wholeHullWalkwayClearanceMeters: '> 80' },
        cameras, vertexProjectionSamples, minCenterSeparationMeters: minCenterSeparation, conservativeBodySphereGapMeters: minSurfaceSeparation,
        conservativeWholeAircraftWalkwayClearanceMeters: minWalkwayClearance, minWholeAircraftAltitudeMeters: minAltitude,
        limits: ['Numerical camera/occlusion/size checks are not rendered screenshots or human visibility acceptance', 'No GPU, phone frame-time or thermal performance claim', 'Only the supplied inside pose and one just-outside pose are covered'],
      }, null, 2) + '\n');
      expect(samples.every(view => view.every(rows => !rows[0].visible))).toBe(true);
      for (const view of cameras) {
        expect(view.aircraft[0].visibleRangesAtTenthSecondSamples[0]?.start).toBeLessThanOrEqual(6.5);
        expect(view.aircraft[1].visibleRangesAtTenthSecondSamples[0]?.start).toBeLessThanOrEqual(11);
        expect(view.aircraft[0].visibleSecondsBefore14).toBeGreaterThan(5);
        expect(view.aircraft[1].visibleSecondsBefore14).toBeGreaterThan(2);
        expect(view.bothVisibleSecondsBefore14).toBeGreaterThan(2);
      }
      expect(vertexProjectionSamples.length).toBeGreaterThanOrEqual(6);
      for (const sample of vertexProjectionSamples) {
        expect(Math.max(sample.width, sample.height)).toBeGreaterThan(18);
        expect(Math.max(sample.width, sample.height)).toBeLessThan(140);
      }
      const nearPasses = vertexProjectionSamples.filter(sample => (sample.aircraft === 1 && sample.time === 6) || (sample.aircraft === 2 && sample.time === 10));
      expect(nearPasses).toHaveLength(4);
      for (const sample of nearPasses) expect(Math.max(sample.width, sample.height)).toBeGreaterThan(70);
      expect(minCenterSeparation).toBeGreaterThan(70); expect(minSurfaceSeparation).toBeGreaterThan(45);
      expect(minWalkwayClearance).toBeGreaterThan(80); expect(minAltitude).toBeGreaterThan(50);
    } finally {
      reference.dispose(); environment.dispose?.(); disposeModelTree(kit.root);
    }
  }, 60_000);
});

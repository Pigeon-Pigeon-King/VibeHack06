import { beforeAll, expect, it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { InstancedMesh, Mesh } from 'three';
import type { Vec3, ScenarioId } from '../../src/contracts';
import { TRANSFER as T } from '../../src/content/transfer-layout';
import { FLANK as F } from '../../src/content/flank-layout';
import { Navigation } from '../../src/actors/Navigation';
import { buildEnvironment } from '../../src/presentation/environment';
import { initializePhysics, Physics, FIXED_DT as dt } from '../../src/runtime/Physics';

beforeAll(initializePhysics);
const horizontal = (a:Vec3,b:Vec3) => Math.hypot(a[0]-b[0],a[2]-b[2]);
function follow(p:Physics, id:string, goals:Vec3[], speed=2.2) {
  let elapsed=0,maxY=p.foot(id)[1],minY=maxY,travel=0;
  for(const goal of goals) {
    let steps=0,old=p.foot(id);
    while(horizontal(p.foot(id),goal)>.08 && elapsed<300 && steps<9000) {
      const at=p.foot(id),dx=goal[0]-at[0],dz=goal[2]-at[2],length=Math.hypot(dx,dz);
      if(p.bodies.get(id)!.collider.shape instanceof RAPIER.Cuboid) p.orient(id,Math.atan2(dx,dz));
      p.move(id,dx/length*speed,dz/length*speed,dt);p.step();steps++;elapsed+=dt;
      const now=p.foot(id);maxY=Math.max(maxY,now[1]);minY=Math.min(minY,now[1]);travel+=horizontal(now,old);old=now;
    }
    expect(horizontal(p.foot(id),goal),JSON.stringify({id,goal,at:p.foot(id),steps,elapsed})).toBeLessThan(.09);
  }
  for(let i=0;i<30;i++){p.move(id,0,0,dt);p.step();}
  return {elapsed,maxY,minY,travel,end:p.foot(id)};
}
function withWorld(id:ScenarioId,fn:(p:Physics,e:ReturnType<typeof buildEnvironment>)=>void) {
  const e=buildEnvironment(id),p=new Physics(e.solids);
  try{fn(p,e);}finally{p.dispose();e.dispose();}
}
function anchorsClear(p:Physics,anchors:Vec3[]) {
  for(const at of anchors) {
    const hit=p.world.intersectionWithShape({x:at[0],y:at[1]+.925,z:at[2]},
      {x:0,y:0,z:0,w:1},new RAPIER.Capsule(.62,.28));
    expect(hit && p.ids.get(hit.handle),`standing capsule at ${at}`).toBeNull();
  }
}
it('S06 anchors, gate collider and visual state are consistent',()=>withWorld('transfer',(p,e)=>{
  anchorsClear(p,[T.spawn,T.panel,T.gate,T.watch,T.equipment,T.zhou,T.courier,T.xu,T.xuSafe,T.wash,T.returnConsole,T.exit,...T.cartSpawns,...T.cartSafe,...T.ambulatorySpawns,T.ambulatorySafe]);
  expect(e.root.getObjectByName('transfer-shutter')!.position.x).toBe(0);
  expect(p.trace([-42,1,22],[-42,1,26],undefined,true)?.id).toBe('solid:transfer-shutter');
  p.addCart('cart',T.cartSpawns[0]);
  for(let i=0;i<480;i++){p.move('cart',0,1.25,dt);p.step();}
  expect(p.foot('cart')[2]).toBeLessThan(22.65);
  p.applyFacts(['transfer-gate-open']);e.setFacts?.(['transfer-gate-open','transfer-cover-open']);
  expect(p.trace([-42,1,22],[-42,1,26],undefined,true)).toBeNull();
  expect(e.root.getObjectByName('transfer-shutter')!.position.x).toBe(6.4);
  const result=follow(p,'cart',[...T.cartVia,T.cartSafe[0]],1.25);
  expect(result.maxY).toBeLessThan(.05);console.log('S06 gate/full-cart',result);
}));
it('S06 player work loop and all cart parking slots have physical routes',()=>withWorld('transfer',(p,e)=>{
  p.applyFacts(['transfer-gate-open']);const nav=new Navigation(e.solids.filter(s=>!s.openFact),T.bounds);
  p.add('person',T.spawn);let seconds=0;
  for(const goal of [T.panel,T.watch,T.equipment,T.wash,T.returnConsole,T.exit]){
    const path=nav.path(p.foot('person'),goal);expect(path.length,`no route ${goal}`).toBeGreaterThan(0);
    seconds+=follow(p,'person',[...path,goal],3.2).elapsed;
  }
  expect(seconds).toBeLessThan(300);p.remove('person');
  const cartNav=new Navigation(e.solids.filter(s=>!s.openFact),T.bounds,1.3);
  for(let i=0;i<T.cartSpawns.length;i++){
    p.addCart(`cart-${i}`,T.cartSpawns[i]);
    const result=follow(p,`cart-${i}`,[...T.cartVia,...cartNav.path(T.cartVia[0],T.cartSafe[i]),T.cartSafe[i]],1.25);
    expect(result.maxY).toBeLessThan(.05);p.remove(`cart-${i}`);
  }
  console.log('S06 player work loop seconds',seconds);
}));
it('S07 all NPC/task stand points are clear, and gallery has physical up/down stairs',()=>withWorld('flank',(p,e)=>{
  anchorsClear(p,[F.spawn,F.platform,F.pump,F.eastPost,F.northPost,F.innerGate,F.report,F.routeWatch,F.water,F.exit,F.zheng,F.meng,...F.technicians,F.techSafe,...F.cartSpawns,...F.cartSafe,...F.walkerSpawns,...F.walkerSafe,...F.eastEntries,...F.eastPosts,...F.northEntries,...F.northPosts]);
  expect(e.solids.some(s=>s.openFact==='transfer-gate-open')).toBe(false);
  p.add('climber',F.platformStairStart);
  const result=follow(p,'climber',[F.platformStairTop,F.platform,F.platformDescentTop,F.platformDescentEnd]);
  expect(result.maxY).toBeGreaterThan(2.39);expect(result.maxY).toBeLessThan(2.46);expect(result.end[1]).toBeLessThan(.05);
  console.log('S07 actual gallery stairs',result);
}));
it('S07 two full-size carts stay level while both walkers use actual bypass steps',()=>withWorld('flank',(p,e)=>{
  const cartNav=new Navigation(e.solids,F.bounds,1.3);
  for(let i=0;i<F.cartSpawns.length;i++) {
    p.addCart(`cart-${i}`,F.cartSpawns[i]);
    let maxY=0,travel=0;
    for(const goal of [...F.cartVia,F.cartSafe[i]]){
      const path=cartNav.path(p.foot(`cart-${i}`),goal);expect(path.length).toBeGreaterThan(0);
      const result=follow(p,`cart-${i}`,[...path,goal],1.25);maxY=Math.max(maxY,result.maxY);travel+=result.travel;
    }
    expect(maxY).toBeLessThan(.05);expect(travel).toBeGreaterThan(60);p.remove(`cart-${i}`);
    console.log('S07 level full-cart route',{i,maxY,travel});
  }
  for(let i=0;i<F.walkerSpawns.length;i++) {
    p.add(`walker-${i}`,F.walkerSpawns[i]);
    const result=follow(p,`walker-${i}`,[...F.walkerVia,F.walkerSafe[i]],1.45);
    expect(result.maxY).toBeGreaterThan(1.19);expect(result.maxY).toBeLessThan(1.26);expect(result.end[1]).toBeLessThan(.05);
    console.log('S07 actual ambulatory bypass',result);p.remove(`walker-${i}`);
  }
}));
it('S07 technicians can physically follow authored evacuation and player can reach work points',()=>withWorld('flank',(p,e)=>{
  for(let i=0;i<F.technicians.length;i++){
    p.add(`worker-${i}`,F.technicians[i]);
    const result=follow(p,`worker-${i}`,[...F.technicianVia,[F.techSafe[0]+(i-1)*1.2,0,F.techSafe[2]]],1.35);
    expect(result.end[1]).toBeLessThan(.05);console.log('S07 technicians',result);p.remove(`worker-${i}`);
  }
  const nav=new Navigation(e.solids,F.bounds);p.add('player',F.platformDescentEnd);
  for(const goal of [F.pump,F.northPost,F.innerGate,F.report,F.routeWatch,F.report,F.water,F.exit]){
    const path=nav.path(p.foot('player'),goal);expect(path.length,`no route ${goal}`).toBeGreaterThan(0);
    follow(p,'player',[...path,goal],3.2);
  }
}));
it('S07 standing fire lanes and physically protected medical transit',()=>withWorld('flank',(p)=>{
  const eye=(v:Vec3):Vec3=>[v[0],v[1]+1.66,v[2]];
  for(const [post,targets] of [[F.platform,F.eastPosts],[F.pump,F.northPosts],[F.northPost,F.northPosts]] as const) {
    const clear=targets.filter(t=>!p.trace(eye(post),eye(t),undefined,true));
    console.log('S07 fire lanes',{post,clear});expect(clear.length).toBeGreaterThan(0);
  }
  const protectedPoints=[...F.cartSpawns,...F.cartVia,...F.cartSafe,...F.walkerSpawns,...F.walkerVia,...F.walkerSafe];
  for(const route of [ [F.cartSpawns[1],...F.cartVia,F.cartSafe[0]], [F.walkerSpawns[1],...F.walkerVia,F.walkerSafe[1]] ]){
    for(let i=1;i<route.length;i++){
      const a=route[i-1],b=route[i],n=Math.ceil(horizontal(a,b));
      for(let j=1;j<n;j++)protectedPoints.push(a.map((v,k)=>v+(b[k]-v)*j/n) as Vec3);
    }
  }
  const exposed:unknown[]=[];
  for(const threat of [...F.eastEntries,...F.eastPosts,...F.northEntries,...F.northPosts])for(const point of protectedPoints){
    if(!p.trace(eye(threat),eye(point),undefined,true))exposed.push({threat,point});
  }
  console.log('S07 medical ray samples',{points:protectedPoints.length,rays:protectedPoints.length*15,exposed});expect(exposed).toEqual([]);
  const viewTargets=[[-42,1.2,-10],[-35,2.8,-11],[-42,1.2,21],[-40,1.66,21]] as Vec3[];
  const visibility=viewTargets.map(to=>({to,hit:p.trace(eye(F.routeWatch),to,undefined,true)?.id??null}));
  console.log('S07 route observation',visibility);
  expect(visibility.filter(v=>!v.hit).length).toBeGreaterThanOrEqual(3);
}));
it('environment statistics without DOM labels or actors',()=>{
  for(const scenario of ['frontgate','transfer','flank'] as const){
    const e=buildEnvironment(scenario);let meshes=0,batches=0,instances=0,triangles=0;const geometries=new Set(),materials=new Set();
    e.root.traverse(o=>{if(!(o instanceof Mesh))return;meshes++;const n=o instanceof InstancedMesh?o.count:1;if(o instanceof InstancedMesh){batches++;instances+=n;}triangles+=(o.geometry.index?.count??o.geometry.attributes.position?.count??0)/3*n;geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);});
    console.log('scene statistics',{scenario,solids:e.solids.length,meshes,batches,instances,triangles,geometries:geometries.size,materials:materials.size});e.dispose();
  }
});

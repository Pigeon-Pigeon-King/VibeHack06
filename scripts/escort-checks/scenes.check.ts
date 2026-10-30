import { beforeAll, expect, it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { InstancedMesh, Mesh } from 'three';
import type { Vec3, ScenarioId } from '../../src/contracts';
import { ESCORT as E } from '../../src/content/escort-layout';
import { RELIEF as R } from '../../src/content/relief-layout';
import { Navigation } from '../../src/actors/Navigation';
import { buildEnvironment } from '../../src/presentation/environment';
import { initializePhysics, Physics, FIXED_DT as dt } from '../../src/runtime/Physics';

beforeAll(initializePhysics);
const horizontal = (a:Vec3,b:Vec3) => Math.hypot(a[0]-b[0],a[2]-b[2]);
const eye = (v:Vec3):Vec3 => [v[0],v[1]+1.66,v[2]];
function withWorld(id:ScenarioId,fn:(p:Physics,e:ReturnType<typeof buildEnvironment>)=>void) {
  const e=buildEnvironment(id),p=new Physics(e.solids);
  try{fn(p,e);}finally{p.dispose();e.dispose();}
}
function clear(p:Physics,point:Vec3,cart=false){
  const shape=cart?new RAPIER.Cuboid(.45,.575,1.2):new RAPIER.Capsule(.62,.28);
  const hit=p.world.intersectionWithShape({x:point[0],y:point[1]+(cart?.6:.925),z:point[2]},
    cart?{x:0,y:-Math.SQRT1_2,z:0,w:Math.SQRT1_2}:{x:0,y:0,z:0,w:1},shape,
    undefined,undefined,undefined,undefined,c=>(p.ids.get(c.handle)??'').startsWith('solid:'));
  expect.soft(hit&&p.ids.get(hit.handle),`occupied ${cart?'cart':'person'} point ${point}`).toBeNull();
}
function follow(p:Physics,id:string,goals:Vec3[],speed=2.1,cart=false,inspect?:()=>void){
  let seconds=0,travel=0,maxY=p.foot(id)[1],minY=maxY;
  for(const goal of goals){
    let steps=0,old=p.foot(id),lastProgress=old,stale=0;
    while(horizontal(p.foot(id),goal)>.09&&seconds<600&&steps<12000){
      const foot=p.foot(id),dx=goal[0]-foot[0],dz=goal[2]-foot[2],len=Math.hypot(dx,dz);
      if(cart)p.orient(id,Math.atan2(dx,dz));
      p.move(id,dx/len*speed,dz/len*speed,dt);p.step();steps++;seconds+=dt;
      inspect?.();
      const now=p.foot(id);travel+=horizontal(now,old);maxY=Math.max(maxY,now[1]);minY=Math.min(minY,now[1]);old=now;
      if(steps%120===0){if(horizontal(now,lastProgress)<.1)stale++;else stale=0;lastProgress=now;}
      if(stale>=3||now[1]<-3.9)break;
    }
    expect(horizontal(p.foot(id),goal),JSON.stringify({id,goal,at:p.foot(id),steps,seconds})).toBeLessThan(.10);
  }
  for(let i=0;i<25;i++){p.move(id,0,0,dt);p.step();}
  return{seconds,travel,maxY,minY,end:p.foot(id)};
}
function viaNavigation(p:Physics,id:string,goals:Vec3[],nav:Navigation,speed=2.1,cart=false,inspect?:()=>void){
  const result={seconds:0,travel:0,maxY:p.foot(id)[1],minY:p.foot(id)[1]};
  for(const goal of goals){
    const path=nav.path(p.foot(id),goal);
    expect(path.length||horizontal(p.foot(id),goal)<1,`no navigation path from ${p.foot(id)} to ${goal}`).toBeTruthy();
    const leg=follow(p,id,[...path,goal],speed,cart,inspect);result.seconds+=leg.seconds;result.travel+=leg.travel;result.maxY=Math.max(result.maxY,leg.maxY);result.minY=Math.min(result.minY,leg.minY);
  }
  return result;
}
it('S08 authored actor, cart and task positions have real clearance',()=>withWorld('escort',(p)=>{
  for(const point of [E.spawn,E.reception,E.luo,E.luoDesk,E.monitor,E.cargo,E.bridgeHead,E.sidePlatform,E.medicalHead,E.flankPost,E.changeAssist,E.medic,E.pillow,E.arrival,E.manifest,E.returnExit,E.meng,...E.recruits,...E.walkerSpawns,...E.enemyEntries.flat(),...E.enemyPosts.flat(),...E.ammo,E.exit])clear(p,point);
  for(const point of [...E.cartSpawns,E.replacement,...E.convoyLegs.flatMap(l=>l.cartStops)])clear(p,point,true);
  for(const leg of E.convoyLegs)for(const point of leg.walkerStops)clear(p,point);
}));
it('S08 full patient boxes follow all three legs, both bridges and separate parking slots',()=>withWorld('escort',(p,e)=>{
  p.applyFacts(['escort-convoy-started']);e.setFacts?.(['escort-convoy-started']);
  expect(e.root.getObjectByName('escort-loading-door')?.position.z).toBe(-11);
  const nav=new Navigation(e.solids.filter(s=>!s.openFact),E.bounds,1.3);
  for(let i=0;i<2;i++){
    const id=`patient-${i}`;p.addCart(id,E.cartSpawns[i],-Math.PI/2);let traveled=0;
    for(let leg=0;leg<3;leg++){
      if(i===0&&leg===2){p.remove(id);p.addCart(id,E.replacement,-Math.PI/2);}
      const route=E.convoyLegs[leg];
      const bypass:Vec3[]=i===1&&leg===2?[[p.foot(id)[0],0,E.changeBay[2]+5],[E.changeBay[0]-8,0,E.changeBay[2]+5]]:[];
      const result=viaNavigation(p,id,[...bypass,...route.via,route.cartStops[i]],nav,1.7,true);
      expect(result.minY).toBeGreaterThan(-.05);expect(result.maxY).toBeLessThan(.08);traveled+=result.travel;
      console.log('S08 full cart geometry route',{i,leg,...result});
    }
    expect(traveled).toBeGreaterThan(370);expect(traveled).toBeLessThan(440);p.remove(id);
  }
}));
it('S08 second patient actually bypasses both full parked beds without geometric penetration',()=>withWorld('escort',(p,e)=>{
  p.applyFacts(['escort-convoy-started']);const nav=new Navigation(e.solids.filter(s=>!s.openFact),E.bounds,1.3);
  for(const offset of [0,.8]){
    p.addCart('old-bed',[E.changeBay[0]+offset,0,E.changeBay[2]],-Math.PI/2);
    p.addCart('replacement-bed',E.replacement,-Math.PI/2);
    p.addCart('second',[E.convoyLegs[1].cartStops[1][0]+offset,0,E.changeBay[2]],-Math.PI/2);
    let minimumOld=Infinity,minimumReplacement=Infinity,closestReplacement:Vec3|undefined;
    const inspect=()=>{
      const moving=p.bodies.get('second')!.collider;
      const old=moving.contactCollider(p.bodies.get('old-bed')!.collider,20);
      const replacement=moving.contactCollider(p.bodies.get('replacement-bed')!.collider,20);
      if(old)minimumOld=Math.min(minimumOld,old.distance);
      if(replacement&&replacement.distance<minimumReplacement){minimumReplacement=replacement.distance;closestReplacement=p.foot('second');}
      expect(old?.distance??1,`second patient penetrated old bed at ${p.foot('second')}`).toBeGreaterThan(0);
      expect(replacement?.distance??1,`second patient penetrated replacement at ${p.foot('second')}`).toBeGreaterThan(0);
    };
    const start=p.foot('second');
    const route:Vec3[]=[[start[0],0,E.changeBay[2]+5],[E.changeBay[0]-8,0,E.changeBay[2]+5],E.convoyLegs[2].via[0]];
    const result=viaNavigation(p,'second',route,nav,1.7,true,inspect);
    expect(minimumOld).toBeGreaterThan(.02);expect(minimumReplacement).toBeGreaterThan(.02);
    console.log('S08 actual two-bed bypass',{offset,minimumOld,minimumReplacement,closestReplacement,...result});
    p.remove('second');p.remove('old-bed');p.remove('replacement-bed');
  }
}));
it('S08 both ambulatory routes, real upper stairs, player work/fight route and return team route',()=>withWorld('escort',(p,e)=>{
  p.applyFacts(['escort-convoy-started']);const nav=new Navigation(e.solids.filter(s=>!s.openFact),E.bounds);
  p.add('player',E.spawn);
  const approach=viaNavigation(p,'player',[E.reception,E.luoDesk,E.monitor,E.cargo,E.bridgeHead,E.platformStairStart],nav,3.2);
  const stairs=follow(p,'player',[E.platformStairTop,E.sidePlatform,E.platformDescentTop,E.platformDescentEnd],2.1);
  expect(stairs.maxY).toBeGreaterThan(2.39);expect(p.foot('player')[1]).toBeLessThan(.05);console.log('S08 actual upper stairs',stairs);
  const onward=viaNavigation(p,'player',[E.medicalHead,E.flankPost,E.pillow,E.changeAssist,E.arrival,E.manifest,E.exit],nav,3.2);
  console.log('S08 player work-and-combat station route',{travel:approach.travel+stairs.travel+onward.travel,seconds:approach.seconds+stairs.seconds+onward.seconds});p.remove('player');
  for(let i=0;i<2;i++){
    p.add(`walker-${i}`,E.walkerSpawns[i]);let travel=0;
    for(const leg of E.convoyLegs)travel+=viaNavigation(p,`walker-${i}`,[...leg.via,leg.walkerStops[i]],nav).travel;
    console.log('S08 walking companion route',{i,travel});expect(travel).toBeGreaterThan(370);p.remove(`walker-${i}`);
  }
  p.add('returner',E.convoyLegs[2].cartStops[1]);
  viaNavigation(p,'returner',[...E.returnVia,E.returnExit],nav);
}));
it('S08 combat anchors have both eye and conservative muzzle sightlines to their local threats',()=>withWorld('escort',(p)=>{
  const anchors=[E.cargo,E.bridgeHead,E.sidePlatform,E.medicalHead,E.flankPost];
  for(let i=0;i<anchors.length;i++){
    const from=eye(anchors[i]);const lanes=E.enemyPosts[i].map(target=>{
      const to=eye(target),d=to.map((v,k)=>v-from[k])as Vec3,len=Math.hypot(...d);
      const muzzle=from.map((v,k)=>v+d[k]/len*.65-(k===1?.12:0))as Vec3;
      return{target,eye:p.trace(from,to,undefined,true)?.id??null,barrel:p.trace(from,muzzle,undefined,true)?.id??null,muzzle:p.trace(muzzle,to,undefined,true)?.id??null};
    });console.log('S08 firing lanes',JSON.stringify({anchor:anchors[i],lanes}));
    expect(lanes.filter(l=>!l.eye&&!l.barrel&&!l.muzzle).length).toBe(E.enemyPosts[i].length);
  }
}));
it('S08 the patient corridor and waiting slots have physical screening',()=>withWorld('escort',(p)=>{
  p.applyFacts(['escort-convoy-started']);
  const points:Vec3[]=[];
  for(const route of [[E.cartSpawns[0],...E.convoyLegs.flatMap(l=>[...l.via,l.cartStops[0]])],[E.walkerSpawns[0],...E.convoyLegs.flatMap(l=>[...l.via,l.walkerStops[0]])]]){
    for(let i=1;i<route.length;i++){const a=route[i-1],b=route[i],n=Math.ceil(horizontal(a,b)/3);for(let j=0;j<=n;j++)points.push(a.map((v,k)=>v+(b[k]-v)*j/n)as Vec3);}
  }
  const exposed:unknown[]=[];const threats=[...E.enemyEntries.flat(),...E.enemyPosts.flat()];
  for(const point of points)for(const threat of threats)if(horizontal(threat,point)<80&&!p.trace(eye(threat),eye(point),undefined,true))exposed.push({threat,point});
  console.log('S08 screened-route samples',{points:points.length,exposed});expect(exposed).toEqual([]);
}));
it('S09 all stations are clear, workers withdraw, relief occupies posts and the player crosses to rest',()=>withWorld('relief',(p,e)=>{
  for(const point of [R.spawn,R.post,R.entryHold,...R.techSpawns,R.techSafe,R.meng,...R.recruits,...R.reliefPosts,...R.crossings,R.rest,R.zheng,R.zhengCare,R.water,R.radio,R.exit,...R.enemyEntries.flat(),...R.enemyPosts.flat(),...R.ammo])clear(p,point);
  const nav=new Navigation(e.solids,R.bounds);
  for(let i=0;i<3;i++){
    p.add(`tech-${i}`,R.techSpawns[i]);const result=viaNavigation(p,`tech-${i}`,[...R.techVia,[R.techSafe[0]+(i-1)*1.5,0,R.techSafe[2]]],nav);console.log('S09 technicians',{i,...result});p.remove(`tech-${i}`);
    p.add(`relief-${i}`,[R.meng,...R.recruits][i]);const arrival=viaNavigation(p,`relief-${i}`,[...R.arrivalVia,R.reliefPosts[i]],nav);console.log('S09 real arrivals',{i,...arrival});p.remove(`relief-${i}`);
  }
  p.add('player',R.spawn);const result=viaNavigation(p,'player',[R.entryHold,R.post,...R.crossings,R.rest,R.radio,R.exit],nav,3.2);console.log('S09 player withdrawal',result);p.remove('player');
  p.add('zheng',R.zheng);viaNavigation(p,'zheng',[R.zhengCare],nav);p.remove('zheng');
  p.add('meng',R.reliefPosts[0]);viaNavigation(p,'meng',[R.crossingVia[0][0],R.crossings[0],...R.crossingVia[1],[R.rest[0]+3,0,R.rest[2]-4]],nav);
}));
it('S09 relief has real covering fire and the rest seat is physically protected',()=>withWorld('relief',(p)=>{
  for(const post of R.reliefPosts){const targets=R.enemyPosts[1].filter(t=>!p.trace(eye(post),eye(t),undefined,true));console.log('S09 covering lanes',{post,targets});expect(targets.length).toBeGreaterThan(0);}
  for(const threat of [...R.enemyEntries.flat(),...R.enemyPosts.flat()])for(const point of [R.rest,R.zhengCare,R.water,R.radio])expect(p.trace(eye(threat),eye(point),undefined,true),`rest exposed ${threat} → ${point}`).not.toBeNull();
}));
it('NPC navigation ends inside the actual mission arrival tolerance and enemy entries can reach posts',()=>{
  for(const scene of ['escort','relief']as const)withWorld(scene,(p,e)=>{
    const layout=scene==='escort'?E:R,nav=new Navigation(e.solids.filter(s=>!s.openFact),layout.bounds);
    const routes:Vec3[][]=scene==='escort'?[
      [E.luo,E.luoDesk],...E.convoyLegs.map(l=>[...l.via,...l.walkerStops]),
      [E.convoyLegs[2].walkerStops[1],...E.returnVia,E.returnExit],
    ]:[
      ...R.techSpawns.map((s,i)=>[s,...R.techVia,[R.techSafe[0]+(i-1)*1.5,0,R.techSafe[2]]as Vec3]),
      ...[R.meng,...R.recruits].map((s,i)=>[s,...R.arrivalVia,R.reliefPosts[i]]),
      [R.zheng,R.zhengCare],
    ];
    for(const route of routes)for(let i=1;i<route.length;i++){
      const last=nav.path(route[i-1],route[i]).at(-1);
      expect.soft(last?horizontal(last,route[i]):horizontal(route[i-1],route[i]),`${scene} navigation stops short ${route[i-1]} → ${route[i]}, last ${last}`).toBeLessThan(.85);
    }
    for(let group=0;group<layout.enemyEntries.length;group++)for(let i=0;i<layout.enemyEntries[group].length;i++){
      const id=`enemy-${group}-${i}`,start=layout.enemyEntries[group][i],end=layout.enemyPosts[group][i%layout.enemyPosts[group].length];
      p.add(id,start);viaNavigation(p,id,[end],nav,1.5);p.remove(id);
    }
  });
});
it('static scene statistics excluding browser-only labels and moving actors',()=>{
  for(const id of ['escort','relief']as const){const e=buildEnvironment(id);let meshes=0,batches=0,instances=0,triangles=0;const geometries=new Set(),materials=new Set();
    e.root.traverse(o=>{if(!(o instanceof Mesh))return;meshes++;const n=o instanceof InstancedMesh?o.count:1;if(o instanceof InstancedMesh){batches++;instances+=n;}triangles+=(o.geometry.index?.count??o.geometry.attributes.position?.count??0)/3*n;geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);});
    console.log('scene statistics',{id,solids:e.solids.length,meshes,batches,instances,triangles,geometries:geometries.size,materials:materials.size});e.dispose();}
});

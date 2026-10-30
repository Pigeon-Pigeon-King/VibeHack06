import { beforeAll, expect, it } from 'vitest';
import type { Vec3 } from '../../src/contracts';
import { FLANK as F } from '../../src/content/flank-layout';
import { buildEnvironment } from '../../src/presentation/environment';
import { initializePhysics, Physics } from '../../src/runtime/Physics';
beforeAll(initializePhysics);
it('S07 standing eye versus conservative physical muzzle from authored and approached points',()=>{
  const e=buildEnvironment('flank'),p=new Physics(e.solids);
  try {
    const sample=(foot:Vec3,target:Vec3,side:number)=>{
      const eye:Vec3=[foot[0],foot[1]+1.66,foot[2]],to:Vec3=[target[0],target[1]+1.62,target[2]];
      const delta=to.map((v,i)=>v-eye[i]) as Vec3,len=Math.hypot(...delta),dir=delta.map(v=>v/len) as Vec3;
      const yaw=Math.atan2(-dir[0],-dir[2]);
      const muzzle:Vec3=[eye[0]+dir[0]*.65+Math.cos(yaw)*side,eye[1]+dir[1]*.65-.12,eye[2]+dir[2]*.65-Math.sin(yaw)*side];
      const eyeHit=p.trace(eye,to,undefined,true),barrelHit=p.trace(eye,muzzle,undefined,true),muzzleHit=p.trace(muzzle,to,undefined,true);
      return {foot,target,mode:side?'hip':'ADS',eye:eyeHit?.id??null,barrel:barrelHit?.id??null,muzzle:muzzleHit?{id:muzzleHit.id,point:muzzleHit.point}:null};
    };
    for(const foot of [F.platform,[2.6,2.4,10.4] as Vec3]) for(const side of [0,.14])for(const target of F.eastPosts)console.log(JSON.stringify(sample(foot,target,side)));
    for(const foot of [[4,2.4,8],[5,2.4,8],[4,2.4,10.4],[5,2.4,10.4],[3,2.4,6],[5,2.4,6]] as Vec3[]){
      const samples=F.eastPosts.map(target=>sample(foot,target,0));
      console.log('nearby ADS position',JSON.stringify({foot,clear:samples.filter(s=>!s.eye&&!s.barrel&&!s.muzzle).map(s=>s.target)}));
    }
    expect(F.eastPosts.map(target=>sample(F.platform,target,0)).some(s=>!s.eye&&!s.barrel&&!s.muzzle)).toBe(true);
  }finally{p.dispose();e.dispose();}
});

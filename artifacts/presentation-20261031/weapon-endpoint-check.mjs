// Replay from the project root. Original independent review command used Node 22.
// This checks actual model geometry at the hidden endpoint; it is not browser QA.
import {createServer} from 'vite';
import {Matrix4, PerspectiveCamera, Vector3, Vector4} from 'three';
const server = await createServer({server:{middlewareMode:true},appType:'custom'});
try {
  const {createWeaponView} = await server.ssrLoadModule('/src/presentation/characters.ts');
  const weapon=createWeaponView();
  const camera=new PerspectiveCamera(75,1366/768,.045,1000);
  const v=new Vector3(), clip=new Vector4(), transform=new Matrix4();
  for (const tilt of [.55,-.55]) {
    let visibleVertices=0, totalVertices=0, maximumBottomMargin=-Infinity;
    let worst;
    for (const ads of [0,.25,.5,.75,1]) for (const recoil of [0,.5,1]) for (const reload of [0,.15,.3,.5,.75,.95,1]) for (const walk of [0,.7,1.5,2.4,3.8,5]) {
      weapon.setPose(recoil,reload,ads,walk);
      weapon.root.position.y-=.62;
      weapon.root.position.z+=.18;
      weapon.root.rotation.x+=tilt;
      weapon.root.updateMatrixWorld(true);
      camera.fov=75-ads*21; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
      weapon.root.traverse(object=>{
        if(!object.isMesh)return;
        const position=object.geometry.getAttribute('position');
        transform.multiplyMatrices(camera.projectionMatrix,object.matrixWorld);
        for(let i=0;i<position.count;i++){
          v.fromBufferAttribute(position,i); clip.set(v.x,v.y,v.z,1).applyMatrix4(transform);
          totalVertices++;
          const bottomMargin=clip.y+clip.w;
          if(bottomMargin>maximumBottomMargin){maximumBottomMargin=bottomMargin;worst={ads,recoil,reload,walk,mesh:object.name,clip:clip.toArray()};}
          if(clip.w>0&&Math.abs(clip.x)<=clip.w&&Math.abs(clip.y)<=clip.w&&Math.abs(clip.z)<=clip.w)visibleVertices++;
        }
      });
    }
    console.log(JSON.stringify({tilt,visibleVertices,totalVertices,maximumBottomMargin,worst}));
  }
  weapon.dispose();
}finally{await server.close();}

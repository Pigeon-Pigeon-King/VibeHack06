import { createServer } from 'vite';
import { readFileSync, writeFileSync } from 'node:fs';
import { Mesh, SkinnedMesh, Texture, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const server=await createServer({server:{middlewareMode:true},appType:'custom',logLevel:'error'});
try {
 const {ModelLibrary}=await server.ssrLoadModule('/src/assets/ModelLibrary.ts');
 const {ImportedPatientCart}=await server.ssrLoadModule('/src/presentation/ImportedPatientCart.ts');
 const {SCENE_ASSETS}=await server.ssrLoadModule('/src/assets/scene-asset-catalog.ts');
 const {CHARACTER_ASSETS}=await server.ssrLoadModule('/src/assets/character-catalog.ts');
 const sources=Object.fromEntries([...Object.values(SCENE_ASSETS),...CHARACTER_ASSETS].map(a=>[a.id,a.runtimePath]));
 const library=new ModelLibrary(async source=>{
  const bytes=readFileSync('public'+new URL(source.url).pathname), loader=new GLTFLoader();
  loader.register(()=>({name:'offline-texture-decode-substitute',loadTexture:async()=>new Texture()}));
  const gltf=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  return {scene:gltf.scene,scenes:gltf.scenes,animations:gltf.animations};
 });
 const rows=[],models=[];
 for(const [index,id,name,scenario,pose] of [[0,'meng','孟齐','medical',{orderly:false}],[1,'meng','孟齐','rescue',{orderly:false}],[2,'supply-cart','首批医疗物资','epilogue',{cargo:true,occupied:false,orderly:true}]]){
  const view=new ImportedPatientCart(library,{id,name,role:'cart'},'https://example.invalid/',undefined,scenario);models.push(view);await view.ready;
  if(view.root.userData.assetStatus!=='ready')throw Error('Cart not ready');
  view.root.position.x=index*2.6;view.setPose({walk:0,aiming:false,down:false,...pose});view.root.updateMatrixWorld(true);
  view.root.traverseVisible(o=>{if(!(o instanceof Mesh))return;if(o instanceof SkinnedMesh)o.skeleton.update();
   let parent=o,assetId;while(parent){if(parent.userData.assetId){assetId=parent.userData.assetId;break}parent=parent.parent}
   if(!assetId||!sources[assetId])throw Error('Missing source '+o.name);
   const geometry=o.geometry,p=geometry.attributes.position,uv=geometry.attributes.uv,v=new Vector3(),positions=[];
   for(let n=0;n<p.count;n++){o.getVertexPosition(n,v).applyMatrix4(o.matrixWorld);positions.push(...v.toArray())}
   rows.push({name:scenario+':'+o.name,assetId,source:'public/'+sources[assetId],positions,indices:geometry.index?Array.from(geometry.index.array):Array.from({length:p.count},(_,n)=>n),uv:uv?Array.from(uv.array):null});
  });
 }
 writeFileSync('artifacts/asset-coverage-fix/cart-assembly.json',JSON.stringify({scope:'Frozen actual Three.js assembly geometry; texture decode substituted only during Node extraction. Not WebGL acceptance.',meshes:rows}));
 models.forEach(m=>m.dispose());library.dispose();console.log('exported',rows.length,'meshes');
}finally{await server.close()}

/*
 * F-35B source-preserving JavaScript reconstruction — GPL-3.0.
 * Geometry and animation parameters: FGMEMBERS F-35B, revision in F35B_SOURCE.
 * Original authors: Petar Jedvaj, Detlef Faber, F-GTUX, Stuart Cassie,
 * Gary Brown and contributors. Port/modifications: Headwind Corridor, 2026.
 * Retained source geometry is explicitly authorized by the current user request.
 * No GLB/OBJ/AC loader, source texture, encoded model blob or runtime request.
 * Source/provenance, license and rebuild instructions: docs/f35b-airframe.md.
 */
import {F35B_SOURCE} from './aircraft/f35b-source.js?v=vtol-public-20261026-01';

import {F35B_PALETTE} from './aircraft/f35b-palette.js?v=vtol-public-20261026-01';
export {F35B_PALETTE};
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const list=x=>Array.isArray(x)?x:[x];

function roleFor(name,file){
 if(name==='canopy')return 'glass';
 if(name==='eots'||name==='intake'||name==='box'||name==='ReheatL'||name==='NozzlePlug')return 'dark';
 if(name==='panel')return 'screen';
 if(name==='seat')return 'seat';
 if(name.indexOf('wheel.')===0)return 'rubber';
 if(file==='Gear'||name.indexOf('NozzlePetal')===0||name==='engine')return 'metal';
 if(name==='fan')return 'fan';
 if(file==='Cockpit'||name==='arch')return 'interior';
 if(name.indexOf('door')===0)return 'doors';
 return 'skin';
}
// Source AC3D is +Y up, nose -X. A rigid coordinate-basis change only:
// game x=-source z, game y=source y, game z=source x.
function sourcePoint(T,p){return new T.Vector3(-p[2],p[1],p[0]);}
// FlightGear animation XML is +X aft, +Y starboard, +Z up.
function animationPoint(T,p){return new T.Vector3(p[1],p[2],p[0]);}
function transformFor(T,node){
 const r=node.rot,l=node.loc;
 return new T.Matrix4().set(r[0],r[1],r[2],l[0],r[3],r[4],r[5],l[1],r[6],r[7],r[8],l[2],0,0,0,1);
}
function buildGeometry(T,node,sourceWorld,materials,tint){
 const positions=[],normals=[],colors=[],sourceIndices=[],uvs=[];
 const verts=node.vertices.map(p=>new T.Vector3(...p).applyMatrix4(sourceWorld));
 const points=verts.map(p=>sourcePoint(T,[p.x,p.y,p.z]));
 const faces=node.surfaces.filter(s=>(s.flags&15)===0&&s.refs.length>=3);
 const faceNormals=faces.map(f=>{
  // Newell normal remains well defined for the original polygon, including
  // quads. It is not altered by choosing a GPU triangle fan for that polygon.
  const n=new T.Vector3();
  for(let i=0;i<f.refs.length;i++){
   const a=points[f.refs[i][0]],b=points[f.refs[(i+1)%f.refs.length][0]];
   n.x+=(a.y-b.y)*(a.z+b.z);n.y+=(a.z-b.z)*(a.x+b.x);n.z+=(a.x-b.x)*(a.y+b.y);
  }return n.normalize();
 });
 const adjacency=points.map(()=>[]);faces.forEach((f,i)=>f.refs.forEach(r=>adjacency[r[0]].push(i)));
 const threshold=Math.cos(node.crease*Math.PI/180),color=new T.Color(tint),normal=new T.Vector3();
 for(let fi=0;fi<faces.length;fi++){
  const f=faces[fi],material=materials[f.material],fc=color.clone();
  if(material&&material.rgb.some(v=>v<.99))fc.multiply(new T.Color(...material.rgb));
  const corners=f.refs.map(ref=>{
   normal.copy(faceNormals[fi]);
   if(f.flags&16){
    normal.set(0,0,0);
    for(const j of adjacency[ref[0]])if((faces[j].flags&16)&&faceNormals[fi].dot(faceNormals[j])>=threshold-.00001)normal.add(faceNormals[j]);
    normal.normalize();
   }
   return {p:points[ref[0]],n:normal.clone(),uv:ref.slice(1),id:ref[0]};
  });
  // AC3D polygon boundaries and winding are retained in F35B_SOURCE. WebGL
  // submission triangulates each source face without moving any vertex.
  for(let k=1;k<corners.length-1;k++)for(const at of [0,k,k+1]){
   const v=corners[at];positions.push(v.p.x,v.p.y,v.p.z);normals.push(v.n.x,v.n.y,v.n.z);
   colors.push(fc.r,fc.g,fc.b);uvs.push(v.uv[0]||0,v.uv[1]||0);sourceIndices.push(v.id);
  }
 }
 const g=new T.BufferGeometry();
 g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('normal',new T.Float32BufferAttribute(normals,3));
 g.setAttribute('color',new T.Float32BufferAttribute(colors,3));g.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));
 g.computeBoundingSphere();
 g.userData.sourceVertexIndices=sourceIndices;
 return g;
}
function interpolation(entries,value){
 if(!entries||!entries.length)return value;
 if(value<=entries[0].ind)return entries[0].dep;
 for(let i=1;i<entries.length;i++)if(value<=entries[i].ind){
  const a=entries[i-1],b=entries[i];return a.dep+(b.dep-a.dep)*(value-a.ind)/(b.ind-a.ind);
 }return entries[entries.length-1].dep;
}
function compileAnimation(T,spec){
 const a=spec.axis||{},c=spec.center||{};let center,axis;
 if(a['x1-m']!==undefined){
  const p1=[a['x1-m'],a['y1-m'],a['z1-m']],p2=[a['x2-m'],a['y2-m'],a['z2-m']];
  center=animationPoint(T,p1);axis=animationPoint(T,p2).sub(center).normalize();
 }else{
  center=animationPoint(T,[c['x-m']||0,c['y-m']||0,c['z-m']||0]);
  axis=animationPoint(T,[a.x||0,a.y||0,a.z||0]).normalize();
 }
 const entries=spec.interpolation?list(spec.interpolation.entry):null;
 const matrix=new T.Matrix4(),move=new T.Matrix4(),back=new T.Matrix4().makeTranslation(-center.x,-center.y,-center.z);
 const front=new T.Matrix4().makeTranslation(center.x,center.y,center.z);
 return {spec,center,axis,matrix,update(properties,time){
  const property=String(spec.property||'').replace(/^\//,''),value=properties[property]||0;
  let amount=entries?interpolation(entries,value):value*(spec.factor===undefined?1:spec.factor);
  amount+=spec['offset-deg']||spec.offset||0;
  if(spec.type==='spin')amount*=time*6; // RPM -> degrees, same source factor.
  if(spec.type==='translate')matrix.makeTranslation(axis.x*amount,axis.y*amount,axis.z*amount);
  else {move.makeRotationAxis(axis,amount*Math.PI/180);matrix.copy(front).multiply(move).multiply(back);}
  return matrix;
 }};
}

export function createF35B(T,options){
 options=options||{};const palette=Object.assign({},F35B_PALETTE,options.palette||{});
 const root=new T.Group();root.name='f35b-source-reconstruction';
 const byName={},parts=[],animations=[],materials={};
 for(const role of Object.keys(palette)){
  const glass=role==='glass',metal=role==='metal';
  materials[role]=new T.MeshStandardMaterial({vertexColors:true,roughness:glass ? .16 : metal ? .40 : .62,metalness:glass ? .6 : metal ? .70 : .22,side:T.DoubleSide,transparent:glass,opacity:glass ? .40 : 1,depthWrite:!glass});
 }
 for(const file of F35B_SOURCE.models){
  const container=new T.Group();container.name='source-'+file.name;root.add(container);
  function add(node,parent,parentMatrix){
   const matrix=parentMatrix.clone().multiply(transformFor(T,node)),group=new T.Group();group.name=node.name||node.type;parent.add(group);
   group.userData.source={file:file.name,name:node.name,vertexCount:node.vertices.length,polygonCount:node.surfaces.length,localTranslation:node.loc.slice(),localRotation:node.rot.slice()};
   if(node.vertices.length){
    const role=roleFor(node.name,file.name),g=buildGeometry(T,node,matrix,file.materials,palette[role]);
    const mesh=new T.Mesh(g,materials[role]);mesh.name=node.name+'-geometry';mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
    group.matrixAutoUpdate=false;group.userData.bindSourceMatrix=matrix.clone();group.userData.sourceNode=node;
    byName[node.name]=group;parts.push(group);
   }
   for(const child of node.children)add(child,group,matrix);
  }add(file.root,container,new T.Matrix4());
  for(const spec of file.animations){
   const anim=compileAnimation(T,spec);anim.names=list(spec['object-name']);animations.push(anim);
  }
 }
 // Group every part by the XML transforms that affect it. Original logical
 // nodes remain addressable; all GPU geometry retains the source coordinates.
 for(const part of parts)part.userData.animationChain=animations.filter(a=>a.names.indexOf(part.name)>=0);
 // The upstream source has an optional pylon set, kept in the source data.
 // Default clean configuration is identical to the upstream default selection.
 if(byName.pylons)byName.pylons.visible=!!options.pylons;
 if(byName.ReheatL)byName.ReheatL.visible=options.engineOn!==false;
 const mechanical={conversion:1,liftDoor:0,nozzleAngle:0,gear:0};
 root.userData.update=function(time,conversion,gearAmount,controls){
  const c=clamp(Number.isFinite(conversion)?conversion:1,0,1),g=clamp(Number.isFinite(gearAmount)?gearAmount:(options.gear||0),0,1);
  const clock=Number.isFinite(time)?time:0,k=controls||{};
  const properties={
   'controls/engines/engine/mixture':c,'engines/engine[0]/n2':options.engineOn===false?0:80*(1-c),
   'gear/gear[0]/position-norm':g,'gear/gear[1]/position-norm':g,'gear/gear[2]/position-norm':g,
   'surface-positions/aileron-pos-norm':k.roll||0,'surface-positions/elevator-pos-norm':k.pitch||0,
   'surface-positions/rudder-pos-norm':k.yaw||0,'surface-positions/nozzle-yaw':k.yaw||0,
   'controls/flight/elevator':k.pitch||0,'controls/flight/aileron':k.roll||0,'controls/flight/rudder':k.yaw||0,
   'controls/engines/engine[1]/throttle':k.throttle||0,'controls/gear/gear-down':g,
   'canopy/position-norm':k.canopy||0,'baydoors/position-norm':k.bay||0
  };
  for(const a of animations)a.update(properties,clock);
  for(const part of parts){
   part.matrix.identity();
   for(const a of part.userData.animationChain)part.matrix.multiply(a.matrix);
   part.matrixWorldNeedsUpdate=true;
  }
  mechanical.conversion=c;mechanical.gear=g;
  mechanical.liftDoor=interpolation([{ind:0,dep:80},{ind:.5,dep:80},{ind:1,dep:0}],c)*Math.PI/180;
  mechanical.nozzleAngle=interpolation([{ind:0,dep:95},{ind:.5,dep:0},{ind:1,dep:0}],c)*Math.PI/180;
 };
 root.userData.kind='F-35B';root.userData.forward=[0,0,-1];root.userData.sourceRevision=F35B_SOURCE.revision;root.userData.sourceLicense=F35B_SOURCE.license;
 root.userData.parts=byName;root.userData.mechanical=mechanical;
 root.userData.sockets={nose:[0,.5,-9.3],gun:[0,-.7,-2.5],missileLeft:[-.9,-.7,0],missileRight:[.9,-.7,0],eye:[0,1.58,-4.9]};
 let disposed=false;
 root.userData.dispose=function(){
  if(disposed)return;disposed=true;const geometries=new Set();root.traverse(n=>{if(n.geometry)geometries.add(n.geometry);});
  geometries.forEach(g=>g.dispose());Object.keys(materials).forEach(k=>materials[k].dispose());root.removeFromParent();
 };
 root.scale.setScalar(Number.isFinite(options.scale)?options.scale:1);root.userData.update(0,1);
 return root;
}

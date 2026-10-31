import bpy,json,sys,math,struct
from pathlib import Path
from mathutils import Vector

root=Path(__file__).resolve().parents[3];out=Path(__file__).resolve().parent
manifest=json.loads((out/'export-manifest.json').read_text())
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
selected=set(args)
cases=[case for case in manifest['cases'] if not selected or case['id'] in selected]
bpy.ops.wm.read_factory_settings(use_empty=True);s=bpy.context.scene
materials={}
for source in sorted({m['source'] for case in cases for m in json.loads((out/(case['id']+'.json')).read_text())['meshes'] if m.get('source')}):
    data=(root/source).read_bytes();length=struct.unpack_from('<I',data,12)[0];glb=json.loads(data[20:20+length])
    old_objects=set(s.objects);old_materials=set(bpy.data.materials)
    bpy.ops.import_scene.gltf(filepath=str(root/source));created=set(s.objects)-old_objects;added=set(bpy.data.materials)-old_materials
    mapping=[]
    for i,entry in enumerate(glb.get('materials',[])):
        name=entry.get('name','Material_'+str(i))
        found=[m for m in added if m.name==name or m.name.startswith(name+'.')]
        if len(found)!=1:raise RuntimeError('Material mapping ambiguous: '+source+' '+name+' '+str([m.name for m in added]))
        found[0].use_fake_user=True;mapping.append(found[0])
    materials[source]=mapping
    for o in created:bpy.data.objects.remove(o,do_unlink=True)

s.render.engine='CYCLES';s.cycles.samples=12;s.cycles.max_bounces=3;s.cycles.use_denoising=False;s.render.threads_mode='FIXED';s.render.threads=1
s.render.resolution_x=1152;s.render.resolution_y=768;s.render.resolution_percentage=100
s.world=bpy.data.worlds.new('inspection-world');s.world.use_nodes=True;s.world.node_tree.nodes['Background'].inputs[0].default_value=(.4,.45,.5,1);s.world.node_tree.nodes['Background'].inputs[1].default_value=.65
def xyz(v):return Vector((v[0],-v[2],v[1]))
for loc,en in [((2,4,6),650),((-3,-3,4),500)]:
    d=bpy.data.lights.new('inspection-light','AREA');d.energy=en;d.shape='DISK';d.size=5;o=bpy.data.objects.new('inspection-light',d);s.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,0,.6))-o.location).to_track_quat('-Z','Y').to_euler()
camera=bpy.data.cameras.new('inspection-camera');cam=bpy.data.objects.new('inspection-camera',camera);s.collection.objects.link(cam);s.camera=cam
results=[]
for case in cases:
    doc=json.loads((out/(case['id']+'.json')).read_text());objects=[]
    for m in doc['meshes']:
        p=m['positions'];verts=[(p[n],-p[n+2],p[n+1]) for n in range(0,len(p),3)];idx=m['indices'];faces=[idx[n:n+3] for n in range(0,len(idx),3)]
        mesh=bpy.data.meshes.new(m['name']);mesh.from_pydata(verts,[],faces);mesh.update();obj=bpy.data.objects.new(m['name'],mesh);s.collection.objects.link(obj);objects.append(obj)
        if m.get('source'):
            for mat in m['materials']:
                if mat['index'] is None:raise RuntimeError('Missing original material index: '+m['name'])
                mesh.materials.append(materials[m['source']][mat['index']])
        else:
            for mat in m['fallbackMaterials']:
                material=bpy.data.materials.new('runtime-procedural-'+m['name']);material.diffuse_color=tuple(mat.get('color') or [.8,.6,.3])+(mat.get('opacity',1),);mesh.materials.append(material)
        for group in m['groups']:
            for polygon in mesh.polygons[group['start']//3:(group['start']+group['count'])//3]:polygon.material_index=group.get('materialIndex',0)
        if m['uv']:
            layer=mesh.uv_layers.new(name='UVMap');uv=m['uv']
            for loop in mesh.loops:layer.data[loop.index].uv=(uv[loop.vertex_index*2],1-uv[loop.vertex_index*2+1])
        if m.get('normals'):
            ns=m['normals'];mesh.normals_split_custom_set_from_vertices([(ns[n],-ns[n+2],ns[n+1]) for n in range(0,len(ns),3)])
            for polygon in mesh.polygons:polygon.use_smooth=True
    for view in doc['views']:
        cam.location=xyz(view['camera']);cam.rotation_euler=(xyz(view['target'])-cam.location).to_track_quat('-Z','Y').to_euler();camera.clip_start=.03;camera.clip_end=100
        if 'ortho' in view:camera.type='ORTHO';camera.ortho_scale=view['ortho']
        else:camera.type='PERSP';camera.sensor_fit='VERTICAL';camera.angle_y=math.radians(view['fov'])
        path=out/(case['id']+'-'+view['name']+'.png');s.render.filepath=str(path);bpy.ops.render.render(write_still=True)
        results.append({'case':case['id'],'view':view['name'],'file':str(path.relative_to(root))})
    for obj in objects:
        data=obj.data;bpy.data.objects.remove(obj,do_unlink=True);bpy.data.meshes.remove(data)
previous=json.loads((out/'render-manifest.json').read_text())['renders'] if selected and (out/'render-manifest.json').exists() else []
results=[entry for entry in previous if entry['case'] not in selected]+results
(out/'render-manifest.json').write_text(json.dumps({'renderer':bpy.app.version_string,'engine':'Cycles','threads':1,'samples':12,'scope':'Offline inspection only, not WebGL acceptance','renders':results},indent=2))

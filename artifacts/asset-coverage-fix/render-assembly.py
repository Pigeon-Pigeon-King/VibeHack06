import bpy,json,sys
from pathlib import Path
from mathutils import Vector
root=Path(__file__).resolve().parents[2];doc=json.loads((root/'artifacts/asset-coverage-fix/cart-assembly.json').read_text())
bpy.ops.wm.read_factory_settings(use_empty=True);s=bpy.context.scene
materials={}
for source in {m['source'] for m in doc['meshes']}:
 prior=set(s.objects);bpy.ops.import_scene.gltf(filepath=str(root/source));created=set(s.objects)-prior
 meshes=[o for o in created if o.type=='MESH' and len(o.data.materials)]
 if not meshes:raise RuntimeError(source)
 materials[source]=meshes[0].data.materials[0]
 materials[source].use_fake_user=True
 for o in created:bpy.data.objects.remove(o,do_unlink=True)
for m in doc['meshes']:
 p=m['positions'];verts=[(p[n],-p[n+2],p[n+1]) for n in range(0,len(p),3)];i=m['indices'];faces=[i[n:n+3] for n in range(0,len(i),3)]
 mesh=bpy.data.meshes.new(m['name']);mesh.from_pydata(verts,[],faces);mesh.materials.append(materials[m['source']]);o=bpy.data.objects.new(m['name'],mesh);s.collection.objects.link(o)
 if m['uv']:
  layer=mesh.uv_layers.new(name='UVMap');uv=m['uv']
  for loop in mesh.loops:layer.data[loop.index].uv=(uv[loop.vertex_index*2],1-uv[loop.vertex_index*2+1])
 mesh.update()
s.render.engine='CYCLES';s.cycles.samples=12;s.cycles.max_bounces=3;s.cycles.use_denoising=False;s.render.threads_mode='FIXED';s.render.threads=1;s.render.resolution_x=1440;s.render.resolution_y=720;s.render.resolution_percentage=100
s.world=bpy.data.worlds.new('world');s.world.use_nodes=True;s.world.node_tree.nodes['Background'].inputs[0].default_value=(.4,.45,.5,1);s.world.node_tree.nodes['Background'].inputs[1].default_value=.6
bpy.ops.mesh.primitive_plane_add(size=100,location=(0,0,-.02));f=bpy.context.object;mat=bpy.data.materials.new('inspection-floor');mat.diffuse_color=(.22,.24,.27,1);f.data.materials.append(mat)
for loc,en in [((1,-4,8),1200),((5,4,6),900)]:
 d=bpy.data.lights.new('Area','AREA');d.energy=en;d.shape='DISK';d.size=7;o=bpy.data.objects.new('Area',d);s.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector((2.6,0,.7))-o.location).to_track_quat('-Z','Y').to_euler()
d=bpy.data.cameras.new('camera');o=bpy.data.objects.new('camera',d);s.collection.objects.link(o);s.camera=o;d.type='ORTHO';d.ortho_scale=9
for name,loc in [('front',(7,-11,8)),('rear',(-3,11,6))]:
 o.location=loc;o.rotation_euler=(Vector((2.6,0,.7))-o.location).to_track_quat('-Z','Y').to_euler();s.render.filepath=str(root/('artifacts/asset-coverage-fix/cart-assembly-'+name+'.png'));bpy.ops.render.render(write_still=True)

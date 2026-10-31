import bpy,sys,json,math
from pathlib import Path
from mathutils import Vector,Matrix
root=Path('/Users/penguin/VibeHack06-asset-coverage')
bpy.ops.wm.read_factory_settings(use_empty=True)
s=bpy.context.scene;s.render.engine='CYCLES';s.cycles.samples=8;s.cycles.max_bounces=3;s.cycles.use_denoising=False;s.render.threads_mode='FIXED';s.render.threads=1;s.render.resolution_x=960;s.render.resolution_y=560;s.render.resolution_percentage=100
bpy.ops.import_scene.gltf(filepath=str(root/'public/assets/generated/production-20261031-props-r1/PROP-TRANSFER.glb'))
for o in s.objects:
 if o.type=='MESH':print('MESH',o.name,'bounds',list(o.dimensions),flush=True)
s.world=bpy.data.worlds.new('World');s.world.use_nodes=True;s.world.node_tree.nodes['Background'].inputs[0].default_value=(.35,.4,.45,1);s.world.node_tree.nodes['Background'].inputs[1].default_value=.6
for loc,en in [((2,-2,4),500),((-2,1,3),300)]:
 d=bpy.data.lights.new('Area','AREA');d.energy=en;d.shape='DISK';d.size=3;o=bpy.data.objects.new('Area',d);s.collection.objects.link(o);o.location=loc;o.rotation_euler=(-o.location).to_track_quat('-Z','Y').to_euler()
d=bpy.data.cameras.new('camera');o=bpy.data.objects.new('camera',d);s.collection.objects.link(o);o.location=(1.5,-1.8,1.1);o.rotation_euler=(-o.location).to_track_quat('-Z','Y').to_euler();s.camera=o;d.type='ORTHO';d.ortho_scale=1.65
s.render.filepath=str(root/'artifacts/asset-coverage-fix/cart-source.png');bpy.ops.render.render(write_still=True)

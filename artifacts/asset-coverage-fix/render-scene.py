import bpy,json,math,sys
from pathlib import Path
from mathutils import Matrix,Vector
root=Path(__file__).resolve().parents[2]
scenario=sys.argv[sys.argv.index('--')+1] if '--' in sys.argv else 'workers'
doc=json.loads((root/f'artifacts/asset-coverage-fix/{scenario}-assembly.json').read_text())
bpy.ops.wm.read_factory_settings(use_empty=True);scene=bpy.context.scene
convert=Matrix(((1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)));inverse=convert.inverted()
source_materials={}
for path in sorted({m['path'] for m in doc['materials'].values() if m.get('path')}):
    before=set(scene.objects);bpy.ops.import_scene.gltf(filepath=str(root/path));created=set(scene.objects)-before
    mats=list(dict.fromkeys(m for o in created if o.type=='MESH' for m in o.data.materials))
    for m in mats:m.use_fake_user=True
    source_materials[path]=mats
    for o in created:bpy.data.objects.remove(o,do_unlink=True)
materials={}
for key,m in doc['materials'].items():
    if m.get('path'):
        source=source_materials[m['path']];materials[key]=next((x for x in source if x.name==m['name'] or x.name.startswith(m['name']+'.')),source[0])
    else:
        material=bpy.data.materials.new(key);material.use_nodes=True;shader=material.node_tree.nodes.get('Principled BSDF')
        shader.inputs['Base Color'].default_value=(*m['color'],1);shader.inputs['Roughness'].default_value=m['roughness'];shader.inputs['Metallic'].default_value=m['metalness'];materials[key]=material
meshes={}
for obj in doc['objects']:
    meshkey=(obj['geometry'],tuple(obj['materials']))
    if meshkey not in meshes:
        g=doc['geometries'][obj['geometry']];p=g['position'];idx=g['indices'];mesh=bpy.data.meshes.new(obj['name'])
        mesh.from_pydata([(p[i],-p[i+2],p[i+1]) for i in range(0,len(p),3)],[],[idx[i:i+3] for i in range(0,len(idx),3)])
        for key in obj['materials']:mesh.materials.append(materials[key])
        for group in g['groups']:
            for i in range(group['start']//3,min(len(mesh.polygons),(group['start']+group['count'])//3)):mesh.polygons[i].material_index=group['materialIndex']
        if g['uv']:
            uv=g['uv'];layer=mesh.uv_layers.new(name='UVMap')
            for loop in mesh.loops:layer.data[loop.index].uv=(uv[loop.vertex_index*2],1-uv[loop.vertex_index*2+1])
        if g['normal']:
            for poly in mesh.polygons:poly.use_smooth=True
            n=g['normal'];mesh.normals_split_custom_set_from_vertices([(n[i],-n[i+2],n[i+1]) for i in range(0,len(n),3)])
        mesh.update();meshes[meshkey]=mesh
    for values in obj['matrices']:
        o=bpy.data.objects.new(obj['name'],meshes[meshkey]);scene.collection.objects.link(o)
        original=Matrix([[values[col*4+row] for col in range(4)] for row in range(4)])
        o.matrix_world=convert@original@inverse
scene.render.engine='CYCLES';scene.cycles.samples=8;scene.cycles.max_bounces=2;scene.cycles.use_denoising=False
scene.render.threads_mode='FIXED';scene.render.threads=1;scene.render.resolution_x=1440;scene.render.resolution_y=810;scene.render.resolution_percentage=100
scene.world=bpy.data.worlds.new('inspection-world');scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.42,.52,.58,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.65
light=bpy.data.lights.new('inspection-sun','SUN');light.energy=2.5;o=bpy.data.objects.new('inspection-sun',light);scene.collection.objects.link(o);o.rotation_euler=(.45,-.4,-.5)
c=doc['camera'];camera=bpy.data.cameras.new('inspection-camera');camera.type='PERSP';camera.sensor_fit='VERTICAL';camera.sensor_height=24;camera.lens=12/math.tan(math.radians(c['fov'])/2)
o=bpy.data.objects.new('inspection-camera',camera);scene.collection.objects.link(o);scene.camera=o
o.location=(convert@Vector((*c['position'],1))).to_3d();target=(convert@Vector((*c['target'],1))).to_3d();o.rotation_euler=(target-o.location).to_track_quat('-Z','Y').to_euler()
scene.render.filepath=str(root/f'artifacts/asset-coverage-fix/{scenario}-offline.png');bpy.ops.render.render(write_still=True)

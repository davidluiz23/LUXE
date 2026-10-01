"""Reproducible original ALKEBULAN terracotta study, authored in Blender.

Run from the repository root:
  blender --background --python scripts/blender/create_heritage_scene.py

The work is a contemporary interpretation informed by Nok sculptural conventions,
not a scan, reconstruction, replica, or historical artifact. See production notes.
"""
import bpy
import math
import json
import random
import sys
from pathlib import Path
from mathutils import Vector, noise
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
WEB = ROOT / 'Frontend' / 'assets' / 'heritage'
SOURCE = ROOT / 'source-assets' / 'heritage'
WEB.mkdir(parents=True, exist_ok=True)
SOURCE.mkdir(parents=True, exist_ok=True)
random.seed(819)
print('HERITAGE: Blender Python initialized', flush=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for block in list(bpy.data.materials):
    bpy.data.materials.remove(block)

def apply(obj, mod):
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=mod.name)

def smooth(obj):
    for poly in obj.data.polygons:
        poly.use_smooth = True
    return obj

def sphere(name, pos, scale, segments=48, rings=32):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=pos)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return smooth(obj)

def mesh(name, verts, faces):
    data = bpy.data.meshes.new(name)
    data.from_pydata(verts, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    return smooth(obj)

def tube(name, points, radius=.035, resolution=3, closed=False):
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '3D'
    curve.resolution_u = 8
    curve.bevel_depth = radius
    curve.bevel_resolution = resolution
    spline = curve.splines.new('BEZIER')
    spline.bezier_points.add(len(points)-1)
    for bp, co in zip(spline.bezier_points, points):
        bp.co = co
        bp.handle_left_type = 'AUTO'
        bp.handle_right_type = 'AUTO'
    spline.use_cyclic_u = closed
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target='MESH')
    obj.select_set(False)
    return smooth(obj)

def join(objects, name):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    objects[0].name = name
    return objects[0]

def boolean(obj, cutter):
    mod = obj.modifiers.new('Carved into clay', 'BOOLEAN')
    mod.operation = 'DIFFERENCE'
    mod.solver = 'EXACT'
    mod.object = cutter
    apply(obj, mod)
    bpy.data.objects.remove(cutter, do_unlink=True)

def lathe(name, profile, steps=96):
    verts=[]
    for z,rx,ry in profile:
        for j in range(steps):
            a=j/steps*math.tau
            verts.append((rx*math.sin(a), -ry*math.cos(a), z))
    faces=[]
    for i in range(len(profile)-1):
        for j in range(steps):
            k=i*steps+j
            n=i*steps+(j+1)%steps
            faces.append((k,n,n+steps,k+steps))
    faces += [tuple(reversed(range(steps))), tuple((len(profile)-1)*steps+j for j in range(steps))]
    return mesh(name,verts,faces)

# A continuous bust silhouette: cropped shoulders, slender neck, elongated head.
body = lathe('Hand-shaped shoulder and neck', [
    (.04,.83,.50),(.10,.94,.55),(.22,1.02,.59),(.40,1.05,.61),
    (.61,.99,.58),(.83,.79,.52),(1.03,.56,.43),(1.24,.43,.37),
    (1.58,.43,.36),(1.83,.50,.41)], 80)
head = lathe('Elongated head', [
    (1.56,.13,.15),(1.66,.38,.36),(1.84,.52,.52),(2.06,.64,.64),
    (2.32,.73,.73),(2.61,.80,.79),(2.90,.88,.82),(3.18,.92,.82),
    (3.50,.94,.81),(3.79,.88,.76),(4.02,.78,.65),(4.20,.59,.49),
    (4.32,.26,.21),(4.34,.01,.01)],96)
core=[body,head]
# Coherent modeled nose with a long, softly faceted bridge.
core.append(mesh('Sculpted nose bridge',[
    (-.12,-.70,3.54),(.12,-.70,3.54),(-.125,-.84,3.42),(.125,-.84,3.42),
    (-.16,-1.07,2.78),(.16,-1.07,2.78),(-.24,-.87,2.59),(.24,-.87,2.59),
    (-.14,-.69,2.56),(.14,-.69,2.56)],
    [(0,1,3,2),(2,3,5,4),(4,5,7,6),(6,7,9,8),(0,2,4,6,8),(1,9,7,5,3),(0,8,9,1)]))
core.append(sphere('Nose tip',(0,-.98,2.73),(.19,.19,.15)))
for side in [-1,1]:
    core.append(sphere('Nostril wing',(side*.195,-.87,2.68),(.12,.16,.12),32,20))
    # Cheek planes rise towards the outside of the eye.
    cheek=sphere('Cheek plane',(side*.54,-.65,2.73),(.29,.16,.36))
    cheek.rotation_euler.y=side*.20
    core.append(cheek)
core.append(sphere('Upper lip',(0,-.755,2.355),(.32,.18,.095)))
core.append(sphere('Lower lip',(0,-.76,2.225),(.30,.17,.11)))
core.append(sphere('Chin',(0,-.51,1.95),(.40,.17,.22)))
for side in [-1,1]:
    ear=sphere('Ear body',(side*.925,-.035,2.93),(.20,.23,.41))
    ear.rotation_euler.y=side*.10
    core.append(ear)
core = join(core, 'Terracotta | continuous hand-shaped form')
remesh=core.modifiers.new('Fused clay form','REMESH')
remesh.mode='VOXEL'
remesh.voxel_size=.033
remesh.use_smooth_shade=True
apply(core,remesh)
relax=core.modifiers.new('Hand-smoothed transitions','SMOOTH')
relax.factor=.70
relax.iterations=5
apply(core,relax)
print('HERITAGE: continuous clay form sculpted', flush=True)

# Subtractive details. Holes and incised lips remain real geometry as light moves.
for side in [-1,1]:
    boolean(core,sphere('Perforated pupil',(side*.485,-.74,3.185),(.090,.31,.103),32,24))
    boolean(core,sphere('Pierced nostril',(side*.16,-.985,2.631),(.047,.09,.049),24,16))
    boolean(core,sphere('Ear hollow',(side*1.024,-.18,2.96),(.085,.15,.255),32,24))
boolean(core,sphere('Incised mouth opening',(0,-.881,2.296),(.268,.066,.033),48,16))

details=[]
for side in [-1,1]:
    # A triangular eye contour frames each real perforated pupil.
    pts=[(.19,-.785,3.355),(.49,-.825,3.458),(.83,-.583,3.34),
         (.65,-.708,3.10),(.48,-.825,3.015),(.19,-.785,3.355)]
    details.append(tube('Triangular eye contour',[(x*side,y,z) for x,y,z in pts],.043,3))
    details.append(tube('Brow ridge',[(side*.16,-.746,3.52),(side*.47,-.796,3.59),(side*.81,-.562,3.47)],.072,4))
    details.append(tube('Ear inner ridge',[(side*1.045,-.154,3.14),(side*.972,-.218,3.01),(side*1.011,-.184,2.79)],.031,3))
    # Small oblique facial incisions are decorative, not alleged writing.
    for i in range(3):
        x=side*(.64+i*.065)
        details.append(tube('Short cheek relief',[(x,-.624+i*.036,2.62),(x+side*.025,-.568+i*.035,2.45)],.016,2))

# Original elaborate hairstyle: swept, ribbed cap with one sculptural crest.
cap=lathe('Sculpted coiffure',[ (3.75,.85,.76),(3.88,.94,.83),(4.08,.98,.85),
    (4.30,.90,.76),(4.52,.73,.63),(4.72,.43,.39),(4.83,.06,.06)],96)
details.append(cap)
for i in range(30):
    angle=i/30*math.tau
    pts=[]
    for j,(z,rx,ry) in enumerate([(3.89,.95,.84),(4.08,.99,.86),(4.30,.91,.77),(4.52,.74,.64),(4.72,.44,.40),(4.79,.20,.19)]):
        t=j/5
        a=angle+t*.42
        pts.append((rx*math.sin(a),-ry*math.cos(a),z))
    details.append(tube('Swept clay coiffure rib',pts,.024,2))
# Raised bands produce a deliberate, continuous boundary between skin and hair.
for z,rx,ry in [(3.845,.91,.799),(3.939,.965,.847)]:
    details.append(tube('Coiffure binding',[(rx*math.sin(t*math.tau/64),-ry*math.cos(t*math.tau/64),z) for t in range(64)],.037,3,True))
# Broad carved crest, aligned front to back, gives the silhouette a memorable finish.
crest=lathe('Crest crown',[(4.68,.14,.24),(4.86,.20,.29),(5.06,.19,.26),(5.19,.10,.17),(5.23,.02,.05)],48)
details.append(crest)
for i in [-2,-1,0,1,2]:
    details.append(tube('Crest incision relief',[(i*.034,-.255,4.83),(i*.043,-.279,4.94),(i*.037,-.241,5.08),(i*.018,-.143,5.18)],.012,2))

# Three nested collar bands, following the continuous torso.
for z,rx,ry in [(1.25,.455,.401),(1.10,.53,.441),(.925,.657,.500)]:
    details.append(tube('Modeled collar',[(rx*math.sin(t*math.tau/72),-ry*math.cos(t*math.tau/72),z) for t in range(72)],.053,3,True))

# Optimize the continuous mesh while keeping silhouettes and carvings intact.
decimate=core.modifiers.new('Web geometry reduction','DECIMATE')
decimate.ratio=.68
apply(core,decimate)
sculpture=join([core]+details,'ALKEBULAN | contemporary terracotta study')
smooth(sculpture)
print('HERITAGE: modeled features and coiffure assembled', flush=True)

# Fine actual form variation and clay color are portable mesh/vertex data.
for vertex in sculpture.data.vertices:
    p=vertex.co
    amount=(noise.noise_vector(p*18.7).x*.0029 + noise.noise_vector(p*61.0).z*.0008)
    vertex.co += vertex.normal*amount
clay_color = sculpture.data.color_attributes.new(name='Clay pigment',type='BYTE_COLOR',domain='CORNER')
for poly in sculpture.data.polygons:
    for li in poly.loop_indices:
        p=sculpture.data.vertices[sculpture.data.loops[li].vertex_index].co
        n=noise.noise_vector(p*2.8).x*.075 + noise.noise_vector(p*19.0).z*.035
        clay_color.data[li].color=(max(.08,.335+n),max(.025,.089+n*.31),max(.012,.031+n*.15),1)

# A small tiled normal map retains fired-clay grain in Blender and glTF.
size=512
rng=np.random.default_rng(819)
height=rng.random((size,size)).astype(np.float32)
height=(height+np.roll(height,1,0)+np.roll(height,1,1))/3
dx=(np.roll(height,-1,1)-np.roll(height,1,1))*.95
dy=(np.roll(height,-1,0)-np.roll(height,1,0))*.95
nz=np.ones_like(dx)
norm=np.sqrt(dx*dx+dy*dy+nz*nz)
pixels=np.stack((dx/norm*.5+.5,dy/norm*.5+.5,nz/norm*.5+.5,np.ones_like(dx)),axis=-1)
grain=bpy.data.images.new('Fired clay | fine grain',width=size,height=size,alpha=False)
grain.colorspace_settings.name='Non-Color'
grain.pixels.foreach_set(pixels.ravel())
grain.filepath_raw=str(WEB/'clay-grain-normal.png')
grain.file_format='PNG'
grain.save()
grain.pack()
bpy.context.view_layer.objects.active=sculpture
sculpture.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=1.15,island_margin=.006)
bpy.ops.object.mode_set(mode='OBJECT')
print('HERITAGE: portable material and UVs ready', flush=True)
for loop in sculpture.data.uv_layers.active.data:
    loop.uv *= 4
mat=bpy.data.materials.new('Warm terracotta | pigmented fired clay')
mat.use_nodes=True
nodes=mat.node_tree.nodes
links=mat.node_tree.links
shader=nodes.get('Principled BSDF')
shader.inputs['Roughness'].default_value=.76
shader.inputs['Specular IOR Level'].default_value=.28
color=nodes.new('ShaderNodeVertexColor')
color.layer_name='Clay pigment'
links.new(color.outputs['Color'],shader.inputs['Base Color'])
image=nodes.new('ShaderNodeTexImage')
image.image=grain
normal=nodes.new('ShaderNodeNormalMap')
normal.inputs['Strength'].default_value=.24
links.new(image.outputs['Color'],normal.inputs['Color'])
links.new(normal.outputs['Normal'],shader.inputs['Normal'])
sculpture.data.materials.clear()
sculpture.data.materials.append(mat)

# Turntable provides editable source animation; browser uses its own bounded motion.
turntable=bpy.data.objects.new('HeritageTurntable',None)
bpy.context.collection.objects.link(turntable)
sculpture.parent=turntable
for frame, angle in [(1,-.24),(90,.29),(180,-.24)]:
    turntable.rotation_euler.z=angle
    turntable.keyframe_insert(data_path='rotation_euler',frame=frame)
bpy.context.scene.frame_start=1
bpy.context.scene.frame_end=180
bpy.context.scene.render.fps=30
bpy.context.scene.frame_set(1)

scene=bpy.context.scene
scene.render.engine='CYCLES'
scene.cycles.samples=16
scene.cycles.use_auto_tile=True
scene.cycles.tile_size=256
scene.render.threads_mode='FIXED'
scene.render.threads=2
scene.cycles.use_denoising=True
scene.render.resolution_x=800
scene.render.resolution_y=960
scene.render.resolution_percentage=100
scene.render.film_transparent=True
scene.render.image_settings.file_format='PNG'
scene.render.image_settings.color_mode='RGBA'
scene.world.color=(.18,.15,.115)
scene.view_settings.view_transform='AgX'

def point_at(obj,target):
    obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()

def light(name,pos,power,size,color):
    data=bpy.data.lights.new(name,'AREA')
    data.energy=power
    data.shape='DISK'
    data.size=size
    data.color=color
    obj=bpy.data.objects.new(name,data)
    bpy.context.collection.objects.link(obj)
    obj.location=pos
    point_at(obj,(0,0,2.7))
    return obj

light('Warm softbox | key',(-4.3,-4.8,7),680,3.5,(1,.87,.73))
light('Paper bounce | fill',(4,-2,3.8),95,3.0,(.95,.93,.85))
light('Clay edge | rim',(2,3.1,6),740,2.8,(1,.68,.44))
camera_data=bpy.data.cameras.new('Editorial portrait camera')
camera=bpy.data.objects.new('Editorial portrait camera',camera_data)
bpy.context.collection.objects.link(camera)
camera.location=(.7,-11.5,4.2)
point_at(camera,(0,0,2.64))
camera_data.type='ORTHO'
camera_data.ortho_scale=6.13
scene.camera=camera

# A shadow catcher stays in the source and transparent poster, never in the asset.
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,0))
floor=bpy.context.object
floor.name='Source-only shadow catcher'
floor.is_shadow_catcher=True
floor_mat=bpy.data.materials.new('Warm paper floor')
floor_mat.diffuse_color=(.79,.76,.68,1)
floor.data.materials.append(floor_mat)

bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'alkebulan-terracotta.blend'))
print('HERITAGE: editable Blender source saved', flush=True)
bpy.ops.object.select_all(action='DESELECT')
sculpture.select_set(True)
turntable.select_set(True)
bpy.context.view_layer.objects.active=sculpture
bpy.ops.export_scene.gltf(filepath=str(WEB/'terracotta-study.glb'),export_format='GLB',
    use_selection=True,export_animations=True,export_yup=True,export_cameras=False,
    export_lights=False,export_apply=True,export_normals=True,export_texcoords=True,
    export_materials='EXPORT',export_vertex_color='ACTIVE',export_draco_mesh_compression_enable=True,
    export_draco_mesh_compression_level=6)
render_poster='--skip-render' not in sys.argv
if render_poster:
    scene.render.filepath=str(WEB/'terracotta-study.png')
    bpy.ops.render.render(write_still=True)
    poster=bpy.data.images['Render Result']
    scene.render.image_settings.file_format='WEBP'
    scene.render.image_settings.quality=88
    poster.save_render(filepath=str(WEB/'terracotta-study.webp'),scene=scene)
    scene.render.image_settings.file_format='PNG'
stats={'vertices':len(sculpture.data.vertices),'polygons':len(sculpture.data.polygons),
    'triangles':sum(len(p.vertices)-2 for p in sculpture.data.polygons),
    'glbBytes':(WEB/'terracotta-study.glb').stat().st_size,
    'posterWebpBytes':(WEB/'terracotta-study.webp').stat().st_size if render_poster else None,
    'height':5.23,'axes':'glTF Y up, front +Z','poster':'transparent 800x960 PNG/WebP, Cycles 16 denoised samples, 256px tiles' if render_poster else 'Export complete. Generate the storefront poster with node scripts/render-heritage-poster.cjs',
    'animation':'HeritageTurntable, 180 frames at 30 fps, bounded clay study turn',
    'source':'original procedural sculpture authored in Blender; contemporary Nok-informed study'}
(SOURCE/'production-stats.json').write_text(json.dumps(stats,indent=2)+'\n',encoding='utf-8')
print('HERITAGE_PRODUCTION_COMPLETE '+json.dumps(stats))

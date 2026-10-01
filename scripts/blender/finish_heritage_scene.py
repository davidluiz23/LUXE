"""Polish the first generated source without recomputing its sculpted booleans.

This script is retained as production history. A clean build now incorporates
the same pigment, crown profile and light refinements in create_heritage_scene.py.
"""
import bpy
import json
import math
from pathlib import Path
from mathutils import noise

ROOT=Path(__file__).resolve().parents[2]
WEB=ROOT/'Frontend'/'assets'/'heritage'
SOURCE=ROOT/'source-assets'/'heritage'
bpy.ops.wm.open_mainfile(filepath=str(SOURCE/'alkebulan-terracotta.blend'))
print('HERITAGE: saved source reopened for material/crown polish',flush=True)
sculpture=bpy.data.objects['ALKEBULAN | contemporary terracotta study']
parent=sculpture.parent
clay=sculpture.data.materials[0]
new=[]
for i in range(30):
    angle=i/30*math.tau
    points=[]
    for j,(z,rx,ry) in enumerate([(3.89,.95,.84),(4.08,.99,.86),(4.30,.91,.77),(4.52,.74,.64),(4.72,.44,.40),(4.79,.20,.19)]):
        a=angle+j/5*.42
        points.append((rx*math.sin(a),-ry*math.cos(a),z))
    curve=bpy.data.curves.new('Raised swept coiffure detail','CURVE')
    curve.dimensions='3D'
    curve.resolution_u=8
    curve.bevel_depth=.024
    curve.bevel_resolution=2
    spline=curve.splines.new('BEZIER')
    spline.bezier_points.add(len(points)-1)
    for bp,co in zip(spline.bezier_points,points):
        bp.co=co
        bp.handle_left_type='AUTO'
        bp.handle_right_type='AUTO'
    obj=bpy.data.objects.new('Raised swept coiffure detail',curve)
    bpy.context.collection.objects.link(obj)
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active=obj
    bpy.ops.object.convert(target='MESH')
    obj.parent=parent
    obj.data.materials.append(clay)
    for poly in obj.data.polygons:
        poly.use_smooth=True
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=1.15,island_margin=.006)
    bpy.ops.object.mode_set(mode='OBJECT')
    for loop in obj.data.uv_layers.active.data:
        loop.uv*=4
    new.append(obj)
bpy.ops.object.select_all(action='DESELECT')
sculpture.select_set(True)
for obj in new:
    obj.select_set(True)
bpy.context.view_layer.objects.active=sculpture
bpy.ops.object.join()
pigment=sculpture.data.color_attributes.get('Clay pigment')
for poly in sculpture.data.polygons:
    for li in poly.loop_indices:
        p=sculpture.data.vertices[sculpture.data.loops[li].vertex_index].co
        n=noise.noise_vector(p*2.8).x*.075 + noise.noise_vector(p*19.0).z*.035
        pigment.data[li].color=(max(.08,.335+n),max(.025,.089+n*.31),max(.012,.031+n*.15),1)
key=bpy.data.objects['Warm softbox | key'].data
key.energy=680
key.size=3.5
key.color=(1,.87,.73)
bpy.data.objects['Paper bounce | fill'].data.energy=95
rim=bpy.data.objects['Clay edge | rim'].data
rim.energy=740
rim.color=(1,.68,.44)
scene=bpy.context.scene
scene.render.threads_mode='FIXED'
scene.render.threads=2
scene.render.filepath=str(WEB/'terracotta-study.png')
scene.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'alkebulan-terracotta.blend'))
bpy.ops.object.select_all(action='DESELECT')
sculpture.select_set(True)
parent.select_set(True)
bpy.context.view_layer.objects.active=sculpture
bpy.ops.export_scene.gltf(filepath=str(WEB/'terracotta-study.glb'),export_format='GLB',
    use_selection=True,export_animations=True,export_yup=True,export_cameras=False,
    export_lights=False,export_apply=True,export_normals=True,export_texcoords=True,
    export_materials='EXPORT',export_vertex_color='ACTIVE',export_draco_mesh_compression_enable=True,
    export_draco_mesh_compression_level=6)
print('HERITAGE: refined source and GLB saved; rendering poster',flush=True)
bpy.ops.render.render(write_still=True)
poster=bpy.data.images['Render Result']
scene.render.image_settings.file_format='WEBP'
scene.render.image_settings.quality=88
poster.save_render(filepath=str(WEB/'terracotta-study.webp'),scene=scene)
scene.render.image_settings.file_format='PNG'
stats={'vertices':len(sculpture.data.vertices),'polygons':len(sculpture.data.polygons),
    'triangles':sum(len(p.vertices)-2 for p in sculpture.data.polygons),
    'glbBytes':(WEB/'terracotta-study.glb').stat().st_size,
    'posterWebpBytes':(WEB/'terracotta-study.webp').stat().st_size,
    'height':5.23,'axes':'glTF Y up, front +Z','poster':'transparent PNG/WebP, Cycles 48 samples',
    'animation':'HeritageTurntable, 180 frames at 30 fps, bounded clay study turn',
    'source':'original procedural sculpture authored in Blender; contemporary Nok-informed study'}
(SOURCE/'production-stats.json').write_text(json.dumps(stats,indent=2)+'\n',encoding='utf-8')
print('HERITAGE_REFINEMENT_COMPLETE '+json.dumps(stats),flush=True)

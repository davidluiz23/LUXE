"""Refine the authored sculpture with physical scoring, pores and fired-clay variation.

Keeps the original editable source, then updates the production blend and Draco GLB.
No Cycles render: use the browser poster exporter after this script completes.
"""
import bpy, math, json, shutil
import numpy as np
from pathlib import Path
from mathutils import noise, Vector
ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT/'source-assets'/'heritage'
WEB=ROOT/'Frontend'/'assets'/'heritage'
base=SOURCE/'alkebulan-terracotta-clean.blend'
if not base.exists(): shutil.copy2(SOURCE/'alkebulan-terracotta.blend',base)
bpy.ops.wm.open_mainfile(filepath=str(base))
print('DETAIL: opened original editable source',flush=True)
obj=bpy.data.objects['ALKEBULAN | contemporary terracotta study']
mesh=obj.data
count=len(mesh.vertices)
coords=np.empty(count*3,dtype=np.float32);mesh.vertices.foreach_get('co',coords);coords=coords.reshape((-1,3))
normals=np.empty(count*3,dtype=np.float32);mesh.vertices.foreach_get('normal',normals);normals=normals.reshape((-1,3))
x,y,z=coords[:,0],coords[:,1],coords[:,2]
rng=np.random.default_rng(702)
grain=(np.sin(x*81.4+y*44.2+z*21.8)*np.cos(z*57.8-x*37.2))*.004
grain+=np.sin(x*19.8+z*28.1)*np.sin(y*36.3-z*8.8)*.005
grain+=np.minimum(0,rng.normal(0,.0038,count))
# Fine actual scoring on both temples. These are original abstract marks, not writing.
front=np.clip((-y-.37)*4,0,1)
for side in [-1,1]:
    for n in range(5):
        line_x=side*(.61+n*.037 + (z-2.70)*.10)
        distance=np.abs(x-line_x)
        mask=(z>2.50)&(z<2.88)&(y<-.39)
        grain-=np.exp(-(distance/.012)**2)*.012*mask*front
    # Delicate concentric scoring around the brow and forehead.
    for n in range(3):
        line_z=3.67+n*.039 - (x-side*.30)**2*.08
        mask=(x*side>.12)&(x*side<.78)&(y<-.5)
        grain-=np.exp(-((z-line_z)/.010)**2)*.010*mask
coords+=normals*grain[:,None]
mesh.vertices.foreach_set('co',coords.ravel());mesh.update()
pigment=mesh.color_attributes.get('Clay pigment')
colors=np.empty((len(pigment.data),4),dtype=np.float32)
for i,loop in enumerate(mesh.loops):
    p=Vector(coords[loop.vertex_index]);n=noise.noise_vector(p*3.5).x
    fine=noise.noise_vector(p*34).z
    mottling=noise.noise_vector(p*10.8).y
    fired=.82 + n*.30 + mottling*.18
    fleck=max(0,fine-.21)*.30
    colors[i]=(.285*fired+fleck,.087*fired+fleck*.70,.033*fired+fleck*.44,1)
pigment.data.foreach_set('color',colors.ravel())
mat=mesh.materials[0]
shader=mat.node_tree.nodes.get('Principled BSDF')
shader.inputs['Roughness'].default_value=.84
shader.inputs['Specular IOR Level'].default_value=.25
# A portable tangent normal map with clustered mineral grain, pits and tiny fissures.
size=512
yy,xx=np.mgrid[:size,:size].astype(np.float32)
height=rng.normal(0,.18,(size,size)).astype(np.float32)
height=(height+np.roll(height,1,0)+np.roll(height,1,1))/3
for _ in range(420):
    cx,cy=rng.uniform(0,size,2);radius=rng.uniform(.65,2.3)
    dx=np.minimum(abs(xx-cx),size-abs(xx-cx));dy=np.minimum(abs(yy-cy),size-abs(yy-cy))
    height-=np.exp(-(dx*dx+dy*dy)/(radius*radius))*rng.uniform(.3,.8)
dx=(np.roll(height,-1,1)-np.roll(height,1,1))*1.55
dy=(np.roll(height,-1,0)-np.roll(height,1,0))*1.55
norm=np.sqrt(dx*dx+dy*dy+1)
pixels=np.stack((dx/norm*.5+.5,dy/norm*.5+.5,1/norm*.5+.5,np.ones_like(dx)),axis=-1)
grain_image=bpy.data.images.get('Fired clay | fine grain')
grain_image.pixels.foreach_set(pixels.ravel());grain_image.filepath_raw=str(WEB/'clay-grain-normal.png');grain_image.save();grain_image.pack()
for node in mat.node_tree.nodes:
    if node.type=='NORMAL_MAP':node.inputs['Strength'].default_value=.55
obj['art_direction']='Original contemporary clay study. Physical temple scoring, irregular surface and portable mineral pore normal map.'
obj['detail_revision']=2
bpy.context.scene.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'alkebulan-terracotta.blend'))
print('DETAIL: detailed editable Blender source saved',flush=True)
bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);obj.parent.select_set(True);bpy.context.view_layer.objects.active=obj
bpy.ops.export_scene.gltf(filepath=str(WEB/'terracotta-study.glb'),export_format='GLB',use_selection=True,export_animations=True,export_yup=True,export_cameras=False,export_lights=False,export_apply=True,export_normals=True,export_texcoords=True,export_materials='EXPORT',export_vertex_color='ACTIVE',export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=6)
stats=json.loads((SOURCE/'production-stats.json').read_text(encoding='utf-8'))
stats.update(vertices=count,polygons=len(mesh.polygons),triangles=sum(len(p.vertices)-2 for p in mesh.polygons),glbBytes=(WEB/'terracotta-study.glb').stat().st_size,detailRevision=2)
(SOURCE/'production-stats.json').write_text(json.dumps(stats,indent=2)+'\n',encoding='utf-8')
print('DETAIL_COMPLETE '+json.dumps(stats),flush=True)

"""Re-render the existing authored study with a bounded CPU memory budget."""
import bpy
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
WEB=ROOT/'Frontend'/'assets'/'heritage'
SOURCE=ROOT/'source-assets'/'heritage'
bpy.ops.wm.open_mainfile(filepath=str(SOURCE/'alkebulan-terracotta.blend'))
scene=bpy.context.scene
scene.render.engine='CYCLES'
scene.render.threads_mode='FIXED'
scene.render.threads=2
scene.cycles.samples=16
scene.cycles.use_denoising=True
scene.cycles.use_auto_tile=True
scene.cycles.tile_size=256
scene.render.resolution_x=800
scene.render.resolution_y=960
scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.render.image_settings.color_mode='RGBA'
scene.render.filepath=str(WEB/'terracotta-study.png')
scene.render.film_transparent=True
scene.frame_set(1)
print('HERITAGE: rendering 800x960, 16 denoised samples, 256px tiles',flush=True)
bpy.ops.render.render(write_still=True)
scene.render.image_settings.file_format='WEBP'
scene.render.image_settings.quality=88
bpy.data.images['Render Result'].save_render(filepath=str(WEB/'terracotta-study.webp'),scene=scene)
scene.render.image_settings.file_format='PNG'
sculpture=bpy.data.objects['ALKEBULAN | contemporary terracotta study']
stats={'vertices':len(sculpture.data.vertices),'polygons':len(sculpture.data.polygons),
    'triangles':sum(len(p.vertices)-2 for p in sculpture.data.polygons),
    'glbBytes':(WEB/'terracotta-study.glb').stat().st_size,
    'posterWebpBytes':(WEB/'terracotta-study.webp').stat().st_size,
    'height':5.23,'axes':'glTF Y up, front +Z','poster':'transparent 800x960 PNG/WebP, Cycles 16 denoised samples, 256px tiles',
    'animation':'HeritageTurntable, 180 frames at 30 fps, bounded clay study turn',
    'source':'original procedural sculpture authored in Blender; contemporary Nok-informed study'}
(SOURCE/'production-stats.json').write_text(json.dumps(stats,indent=2)+'\n',encoding='utf-8')
print('HERITAGE_POSTER_COMPLETE '+json.dumps(stats),flush=True)

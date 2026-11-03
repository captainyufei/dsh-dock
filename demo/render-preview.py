"""Build, check, render and encode the Chinese / English README GIF loops.

Requires Python 3, Node.js / npx, Chrome supported by HyperFrames, FFmpeg,
and Pillow for the final composited first/last frame check.
"""
from pathlib import Path
import argparse, hashlib, json, shutil, subprocess, sys
from PIL import Image, ImageChops

BASE = Path(__file__).resolve().parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--lang', choices=['zh','en','both'], default='both')
parser.add_argument('--width', type=int, default=1200)
parser.add_argument('--fps', type=int, default=15)
parser.add_argument('--colors', type=int, default=256)
parser.add_argument('--dither', choices=['none','bayer'], default='none')
parser.add_argument('--encode-only', action='store_true', help='Reuse an existing lossless PNG frame sequence.')
args = parser.parse_args()
languages = ['zh','en'] if args.lang=='both' else [args.lang]
reports = {}

for lang in languages:
    work = BASE/'.preview-work'/lang
    if not args.encode_only:
        subprocess.run([sys.executable,str(BASE/'build-preview.py'),'--lang',lang],check=True)
        with (work/'check.json').open('w') as result, (work/'check.log').open('w') as log:
            subprocess.run(['npx','--yes','hyperframes@0.8.226','check',str(work),'--json'],stdout=result,stderr=log,check=True)
        if (work/'frames').exists(): shutil.rmtree(work/'frames')
        with (work/'render.log').open('w') as log:
            subprocess.run(['npx','--yes','hyperframes@0.8.226','render',str(work),'--output',str(work/'frames'),'--format','png-sequence','--fps',str(args.fps),'--workers','2','--skill','hyperframes','--json'],stdout=log,stderr=subprocess.STDOUT,check=True)
    name = 'preview.gif' if lang=='zh' else 'preview.en.gif'
    target = BASE.parent/'assets/readme'/name
    # One palette for the whole loop avoids frame-to-frame color flicker.
    filters=(f'fps={args.fps},scale={args.width}:-1:flags=lanczos,split[frames][stats];'
             f'[stats]palettegen=max_colors={args.colors}:stats_mode=diff[palette];'
             f'[frames][palette]paletteuse=dither={args.dither}:bayer_scale=4:diff_mode=rectangle')
    subprocess.run(['ffmpeg','-v','error','-y','-framerate',str(args.fps),'-pattern_type','glob','-i',str(work/'frames'/'*.png'),'-filter_complex',filters,'-an','-loop','0',str(target)],check=True)
    with Image.open(target) as gif:
        loop=gif.info.get('loop'); first=gif.convert('RGB'); duration=0
        for index in range(gif.n_frames):
            gif.seek(index); duration+=gif.info.get('duration',0)
        last=gif.convert('RGB')
        equal=ImageChops.difference(first,last).getbbox() is None
        record={'file':'../assets/readme/'+name,'width':gif.width,'height':gif.height,'frames':gif.n_frames,'durationMilliseconds':duration,'loop':loop,'bytes':target.stat().st_size,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'firstLastCompositedFramesIdentical':equal,'globalPaletteMaximumColors':args.colors,'renderFps':args.fps,'audio':False,'dither':args.dither,'intermediate':'lossless PNG frames'}
    if loop!=0 or not equal or not 44000<=duration<=45000:
        raise RuntimeError(f'GIF loop validation failed: {record}')
    if record['bytes']>5_000_000:
        raise RuntimeError(f'GIF exceeds 5 MB: {name}')
    (work/'gif-verification.json').write_text(json.dumps(record,indent=2)+'\n')
    reports[lang]=record
    print(json.dumps(record,indent=2))

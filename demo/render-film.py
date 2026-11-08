"""Check and render isolated, reproducible bilingual 45-second feature films."""
from pathlib import Path
import argparse,json,shutil,subprocess,sys
BASE=Path(__file__).resolve().parent
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--lang',choices=['zh','en','both'],default='both')
args=parser.parse_args()
for lang in (['zh','en'] if args.lang=='both' else [args.lang]):
 work=BASE/'.preview-work'/('film-'+lang);work.mkdir(parents=True,exist_ok=True)
 subprocess.run([sys.executable,str(BASE/'build-demo.py'),'--lang',lang,'--output',str(work)],check=True)
 for relative in ['assets/gsap.min.js','assets/fonts/demo-sans.woff2','assets/fonts/OFL.txt','assets/audio/dock-bgm.mp3']:
  target=work/relative;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(BASE/relative,target)
 (work/'meta.json').write_text(json.dumps({'id':'dock-film-'+lang,'name':'DeepSeek Dock 0.2.0'},indent=2)+'\n')
 with (work/'check.json').open('w') as out,(work/'check.log').open('w') as err:
  subprocess.run(['npx','--yes','hyperframes@0.8.226','check',str(work),'--json'],stdout=out,stderr=err,check=True)
 name='demo.mp4' if lang=='zh' else 'demo.en.mp4'
 with (work/'render.log').open('w') as log:
  subprocess.run(['npx','--yes','hyperframes@0.8.226','render',str(work),'--output',str(BASE.parent/'assets/readme'/name),'--fps','30','--quality','delivery','--workers','2','--skill','hyperframes','--json'],stdout=log,stderr=subprocess.STDOUT,check=True)
 with (work/'snapshots.log').open('w') as log:
  subprocess.run(['npx','--yes','hyperframes@0.8.226','snapshot',str(work),'--at','0,2.2,6.9,10.2,15.5,22.3,25.0,30.8,34.2,38.6,43.5','--output',str(work/'snapshots')],stdout=log,stderr=subprocess.STDOUT,check=True)
 poster='poster.png' if lang=='zh' else 'poster.en.png'
 shutil.copy2(next((work/'snapshots').glob('*at-6.9s.png')),BASE.parent/'assets/readme'/poster)
 if lang=='zh':
  for time,name in [('2.2','dock-collapsed.png'),('6.9','dock-customize.png'),('15.5','global-search.png'),('22.3','notification-inbox.png'),('38.6','video-preview.png')]:
   shutil.copy2(next((work/'snapshots').glob('*at-'+time+'s.png')),BASE.parent/'assets/readme'/name)
 print('Rendered '+lang+' film and stills')
subprocess.run([sys.executable,str(BASE/'build-demo.py'),'--lang','zh'],check=True)

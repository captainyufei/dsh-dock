"""Build a seamless 45-second GIF source from the full feature film timeline."""
from pathlib import Path
import argparse, json, re, shutil, subprocess, sys
BASE=Path(__file__).resolve().parent
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--lang',choices=['zh','en'],default='zh')
args=parser.parse_args()
output=BASE/'.preview-work'/args.lang
output.mkdir(parents=True,exist_ok=True)
subprocess.run([sys.executable,str(BASE/'build-demo.py'),'--lang',args.lang,'--loop','--output',str(output)],check=True)
for relative in ['assets/gsap.min.js','assets/fonts/demo-sans.woff2','assets/fonts/OFL.txt']:
 target=output/relative;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(BASE/relative,target)
scene=output/'compositions/ui-demo.html'
scene.write_text(scene.read_text().replace('</style>','.enddescription,.enddescription-en,.endsub{display:none}</style>',1))
root=(output/'index.html').read_text()
root=re.sub(r'<audio\b.*?</audio>','',root,flags=re.S)
(output/'index.html').write_text(root)
(output/'meta.json').write_text(json.dumps({'id':'dock-readme-'+args.lang,'name':'DeepSeek Dock 0.2.0 README loop'},indent=2)+'\n')
(output/'text.txt').unlink()
print(f'Built {args.lang} full-feature README loop')

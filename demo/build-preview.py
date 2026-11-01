"""Build a seamless 14-second README loop without altering the 45-second film."""
from pathlib import Path
import argparse, json, re, shutil, subprocess, sys

BASE = Path(__file__).resolve().parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--lang', choices=['zh', 'en'], default='zh')
args = parser.parse_args()
output = BASE / '.preview-work' / args.lang
output.mkdir(parents=True, exist_ok=True)
subprocess.run([sys.executable, str(BASE/'build-demo.py'), '--lang', args.lang, '--output', str(output)], check=True)
for relative in ['assets/gsap.min.js', 'assets/fonts/demo-sans.woff2', 'assets/fonts/OFL.txt']:
    target = output / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(BASE / relative, target)

scene = (output/'compositions/ui-demo.html').read_text()
extra_css = '''
/* The loop starts with a complete chat, and returns to exactly this state. */
#home-view,.caption,#endcard,#custom,#dock-menu,#pin-menu,#unpin-menu,#saved,#video{display:none!important}
#chat-view{opacity:1}
.chatbody{left:350px;width:620px}
.chatcomposer{left:335px;width:650px}
.loop-caption{position:absolute;left:190px;right:190px;top:965px;text-align:center;font-size:32px;line-height:1.4;font-weight:550}
#loop-caption-tools{opacity:0}
'''
scene = scene.replace('</style>', extra_css+'</style>', 1)
# These two panels intentionally slide beyond the clipped application window.
scene = scene.replace('id="workspace"','id="workspace" data-layout-allow-overflow data-layout-allow-occlusion')
scene = scene.replace('id="drawer"','id="drawer" data-layout-allow-overflow data-layout-allow-occlusion')
first = 'Collapse the list. Keep your Dock.' if args.lang=='en' else '收起会话列表，常用入口仍在'
second = 'One toggle. Restore your existing tools.' if args.lang=='en' else '一个开关，恢复已有工具内容'
scene = scene.replace('</div><script>', f'<div class="loop-caption" id="loop-caption-dock">{first}</div><div class="loop-caption" id="loop-caption-tools">{second}</div></div><script>', 1)
script = '''
const tl=gsap.timeline({paused:true});
tl.set('#drawer',{x:620,autoAlpha:0},0);
tl.set('#chat-view',{autoAlpha:1},0);
tl.set('#cursor',{x:1660,y:820,scale:1},0);
tl.set('#top-title',{innerText:TITLE},0);
tl.set('#loop-caption-dock',{opacity:1},0);
const move=(x,y,t,d=.45)=>tl.to('#cursor',{x,y,duration:d,ease:'power2.inOut'},t);
const click=t=>{tl.to('#cursor',{scale:.82,duration:.08},t);tl.to('#cursor',{scale:1,duration:.12},t+.08);};
// The list collapses; the Dock remains physically fixed.
move(457,177,1);click(1.5);
tl.to('#workspace,#main-panel,#top-title',{x:-310,duration:.65,ease:'power3.inOut'},1.5);
tl.to('.chatbody,.chatcomposer',{x:155,duration:.65,ease:'power3.inOut'},1.5);
tl.set('#workspace',{autoAlpha:0},2.16);
move(145,300,2.25);move(457,177,3.4);click(3.9);
tl.set('#workspace',{autoAlpha:1},3.9);
tl.to('#workspace,#main-panel,#top-title',{x:0,duration:.65,ease:'power3.inOut'},3.9);
tl.to('.chatbody,.chatcomposer',{x:0,duration:.65,ease:'power3.inOut'},3.9);
// The existing notes tab opens with one toggle, then closes back to the chat.
move(1770,178,5.2,.65);click(5.95);
tl.to('#loop-caption-dock',{opacity:0,duration:.18},5.8);
tl.to('#loop-caption-tools',{opacity:1,duration:.18},6.02);
tl.set('#drawer',{autoAlpha:1},5.95);
tl.to('#drawer',{x:0,duration:.7,ease:'power3.inOut'},5.95);
tl.to('.chatbody,.chatcomposer',{x:-295,duration:.7,ease:'power3.inOut'},5.95);
tl.to('#button-plus',{autoAlpha:0,duration:.15},5.95);
tl.to('#button-close',{autoAlpha:1,duration:.15},5.95);
click(9.6);
tl.to('#drawer',{x:620,duration:.7,ease:'power3.inOut'},9.6);
tl.set('#drawer',{autoAlpha:0},10.31);
tl.to('.chatbody,.chatcomposer',{x:0,duration:.7,ease:'power3.inOut'},9.6);
tl.to('#button-close',{autoAlpha:0,duration:.15},9.6);
tl.to('#button-plus',{autoAlpha:1,duration:.15},9.6);
move(1660,820,10.5,.65);
tl.to('#loop-caption-tools',{opacity:0,duration:.18},11.1);
tl.to('#loop-caption-dock',{opacity:1,duration:.18},11.35);
// Hold the exact starting state for the final 2.47 seconds; no fade to blank.
window.__timelines['ui-demo']=tl;
'''.replace('TITLE', json.dumps('Product demo' if args.lang=='en' else '产品演示', ensure_ascii=False))
scene = re.sub(r'<script>.*?</script>', '<script>'+script+'</script>', scene, flags=re.S)
if args.lang=='en' and re.search('[\u4e00-\u9fff]',scene):
    raise ValueError('English loop contains untranslated Chinese text')
(output/'compositions/ui-demo.html').write_text(scene)
root = (output/'index.html').read_text()
root = re.sub(r'<audio\b.*?</audio>', '', root, flags=re.S)
root = root.replace('data-duration="45"','data-duration="14"').replace('Simulated feature demo','Simulated README loop')
(output/'index.html').write_text(root)
(output/'meta.json').write_text(json.dumps({'id':'dock-readme-'+args.lang,'name':'DeepSeek Dock README loop'},indent=2)+'\n')
# Generated text and local render state never become public source files.
(output/'text.txt').unlink()
print(f'Built {args.lang} README preview in {output.name}')

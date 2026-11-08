"""Verify rendered media and write compact, path-safe delivery metadata.
Requires FFmpeg/ffprobe, Pillow and fonttools[brotli]. Run after both renders.
"""
from pathlib import Path
from html.parser import HTMLParser
from datetime import datetime,timezone
import hashlib,json,re,subprocess
from PIL import Image,ImageChops
from fontTools.ttLib import TTFont
D=Path(__file__).resolve().parent; A=D.parent/'assets/readme'; W=D/'.preview-work'
def run(command): return subprocess.run(command,capture_output=True,text=True,check=True)
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def checks(kind):
 x=json.loads((W/kind/'check.json').read_text()); result={}
 for k,v in x.items():
  if isinstance(v,dict) and 'errorCount' in v:
   assert v['errorCount']==0,(kind,k,v['errorCount'])
   result[k]={name:v[name] for name in ['errorCount','warningCount','infoCount'] if name in v}
   result[k]['warningCodes']=sorted({f['code'] for f in v.get('findings',[]) if f['severity']=='warning'})
 return result
class VisibleText(HTMLParser):
 def __init__(self):super().__init__();self.skip=0;self.text=''
 def handle_starttag(self,t,a):
  if t in ['style','script']:self.skip+=1
 def handle_endtag(self,t):
  if t in ['style','script']:self.skip-=1
 def handle_data(self,s):
  if not self.skip:self.text+=s
font=TTFont(D/'assets/fonts/demo-sans.woff2');cmap=set(font.getBestCmap())
reviewTimes=[0,.95,1.2,1.45,1.6,2.2,3.1,3.32,3.5,3.75,6.9,10.2,15.5,22.3,25,30.8,34.2,38.6,42.5,44.933]
common={'product':'DeepSeek Dock','version':'0.2.0','verifiedAt':datetime.now(timezone.utc).isoformat(),'simulation':True,'compatibility':'macOS / DeepSeek Harness 0.2.2-rc.1; illustrative UI sourced from Dock 0.2.0','hyperframes':'0.8.226','reviewMomentsSeconds':reviewTimes,'humanAudioListeningClaimed':False}
films={};gifs={};audioHashes=[]
for lang in ['zh','en']:
 text=VisibleText();text.feed((W/lang/'compositions/ui-demo.html').read_text())
 required={ord(c) for c in text.text if not c.isspace()};missing=required-cmap
 assert not missing,('Missing font characters',lang,missing)
 if lang=='en':assert not re.search('[\u4e00-\u9fff]',text.text)
 name='demo.mp4' if lang=='zh' else 'demo.en.mp4';p=A/name
 run(['ffmpeg','-v','error','-i',str(p),'-f','null','-'])
 probe=json.loads(run(['ffprobe','-v','error','-show_entries','format=duration,size:stream=codec_name,pix_fmt,width,height,r_frame_rate,nb_frames,sample_rate,channels,duration','-of','json',str(p)]).stdout)
 assert probe['format']['duration']=='45.000000'
 assert probe['streams'][0]['nb_frames']=='1350'
 assert probe['streams'][1]['channels']==2
 pcm=run(['ffmpeg','-v','error','-i',str(p),'-map','0:a:0','-f','hash','-hash','sha256','-']).stdout.strip().split('=')[-1];audioHashes.append(pcm)
 loud=run(['ffmpeg','-hide_banner','-i',str(p),'-map','0:a:0','-af','loudnorm=I=-22:TP=-1.5:LRA=11:print_format=json','-f','null','-']).stderr
 loudness=json.JSONDecoder().raw_decode(loud[loud.rfind('{'):])[0]
 films[lang]={'file':'../assets/readme/'+name,'sha256':digest(p),'bytes':p.stat().st_size,'probe':probe,'fullDecode':'passed','decodedAudioSha256':pcm,'audio':True,'integratedLufs':float(loudness['input_i']),'truePeakDbtp':float(loudness['input_tp']),'loudnessRangeLu':float(loudness['input_lra']),'check':checks('film-'+lang),'visibleFontCharactersCovered':True,'posterSeconds':6.9}
 name='preview.gif' if lang=='zh' else 'preview.en.gif';p=A/name
 run(['ffmpeg','-v','error','-i',str(p),'-f','null','-'])
 with Image.open(p) as gif:
  first=gif.convert('RGBA');duration=0
  for i in range(gif.n_frames):gif.seek(i);duration+=gif.info.get('duration',0)
  last=gif.convert('RGBA');equal=ImageChops.difference(first,last).getbbox() is None
  assert gif.info.get('loop')==0 and equal and duration==45000
  assert gif.size==(1200,675) and gif.n_frames==675 and p.stat().st_size<5_000_000
  gifs[lang]={'file':'../assets/readme/'+name,'sha256':digest(p),'bytes':p.stat().st_size,'width':gif.width,'height':gif.height,'frames':gif.n_frames,'durationMilliseconds':duration,'loop':0,'firstLastCompositedFramesIdentical':equal,'renderFps':15,'globalPaletteMaximumColors':256,'dither':'none','audio':False,'fullDecode':'passed','check':checks(lang),'visibleFontCharactersCovered':True}
assert audioHashes[0]==audioHashes[1]
stills={p.name:{'sha256':digest(p),'bytes':p.stat().st_size,'dimensions':Image.open(p).size} for p in A.glob('*.png')}
(D/'verification.json').write_text(json.dumps(common|{'languages':films,'audioSameAcrossLanguages':True,'sourceBgmSha256':digest(D/'assets/audio/dock-bgm.mp3'),'fontSha256':digest(D/'assets/fonts/demo-sans.woff2'),'stills':stills,'review':'REVIEW.md'},ensure_ascii=False,indent=2)+'\n')
(D/'preview-verification.json').write_text(json.dumps(common|{'languages':gifs,'sharedTimeline':'timeline.js','loopReset':'The branded replay card covers the illustrative reset; the opening scene is restored before the loop boundary.','review':'REVIEW.md'},ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'films':{k:{a:v[a] for a in ['sha256','bytes','integratedLufs','truePeakDbtp']} for k,v in films.items()},'gifs':{k:{a:v[a] for a in ['sha256','bytes','frames','durationMilliseconds']} for k,v in gifs.items()}},indent=2))

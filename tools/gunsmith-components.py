"""Independent, local reference-image component pipeline. Requires Pillow and numpy."""
import json, hashlib, time, io, urllib.request, urllib.parse, subprocess
from pathlib import Path
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parent.parent
LOCAL=ROOT/'artifacts/gunsmith-v2'; OUT=ROOT/'public/assets/gunsmith/v2'
LOCAL.mkdir(exist_ok=True);OUT.mkdir(parents=True,exist_ok=True)
spec=json.loads((ROOT/'art/gunsmith-v2/assets.json').read_text())
template=json.loads((ROOT/'art/gunsmith-v2/workflow-api.json').read_text())
jpath=LOCAL/'jobs.json';jobs=json.loads(jpath.read_text()) if jpath.exists() else {}
def digest(b):return hashlib.sha256(b).hexdigest()
def save():
 tmp=jpath.with_suffix('.tmp');tmp.write_text(json.dumps(jobs,indent=2));tmp.replace(jpath)
def api(path,body=None):
 data=json.dumps(body).encode() if body is not None else None
 req=urllib.request.Request('http://127.0.0.1:8188'+path,data,{'Content-Type':'application/json'})
 return json.load(urllib.request.urlopen(req,timeout=60))
def upload(name,data):
 boundary='StrikeComponentReference'
 body=(f'--{boundary}\r\nContent-Disposition: form-data; name="image"; filename="{name}"\r\nContent-Type: image/png\r\n\r\n').encode()+data+f'\r\n--{boundary}--\r\n'.encode()
 req=urllib.request.Request('http://127.0.0.1:8188/upload/image',body,{'Content-Type':'multipart/form-data; boundary='+boundary})
 return json.load(urllib.request.urlopen(req,timeout=60))['name']
subprocess.run(['node','tools/gunsmith-reference.mjs'],cwd=ROOT,check=True)
entries={}
for gun,slots in spec['weapons'].items():
 original=Image.open(LOCAL/'references'/f'{gun}.png').convert('RGBA');w,h=original.size
 sourcehash=digest((ROOT/f'public/assets/characters/{gun}.svg').read_bytes())
 # Quantize only to colors actually present in this weapon: no unrelated olive/cyan palette.
 pixels=np.asarray(original);rgb=Image.fromarray(pixels[pixels[:,:,3]>240][:,:3].reshape(1,-1,3));palette=np.array(rgb.quantize(colors=12).convert('RGB')).reshape(-1,3);palette=np.unique(palette,axis=0)
 entries[gun]={'source':f'/assets/characters/{gun}.svg','sourceSha256':sourcehash,'width':w,'height':h,'parts':{}}
 for part in spec['parts']:
  key=gun+'-'+part;slot='magazine' if part=='quickmag' else 'barrel';x,y,rw,rh=slots[slot];rect=[round(x*w),round(y*h),max(1,round(rw*w)),max(1,round(rh*h))]
  # The reference is a crop from the original component, never a generated whole gun.
  crop=original.crop((rect[0],rect[1],rect[0]+rect[2],rect[1]+rect[3]))
  if crop.getbbox() is None: crop=original.crop((round(w*.3),round(h*.25),round(w*.6),round(h*.6)))
  ref=Image.new('RGB',(512,384),'white');crop.thumbnail((440,300),Image.Resampling.LANCZOS);ref.paste(crop,((512-crop.width)//2,(384-crop.height)//2),crop)
  buf=io.BytesIO();ref.save(buf,format='PNG');refbytes=buf.getvalue();(LOCAL/f'{key}.reference.png').write_bytes(refbytes)
  graph=json.loads(json.dumps(template));graph['13']['inputs']['image']=f'strike-{key}-{digest(refbytes)[:12]}.png'
  kind={'heavy':'a reinforced heavy barrel and handguard component, thicker and slightly longer','short':'a shortened compact barrel and handguard component, visibly shorter','quickmag':'a detachable compact ammunition magazine component with a small quick release base tab'}[part]
  if gun=='shotgun' and part=='quickmag':kind='a short horizontal tubular ammunition magazine component for an under-barrel mount'
  graph['3']['inputs']['text']=f'Using the supplied cropped original weapon component as the exact color and drawing style reference, draw ONLY {kind}. Isolated mechanical PART, NOT A GUN. No receiver, no stock, no pistol grip, no trigger, no full weapon. Match original flat grey colors and thick black cartoon outlines. Orthographic side profile, installation direction left to right. Single component centered on pure white background, no shadow, no lettering, no extra objects.'
  graph['5']['inputs']['noise_seed']=771000+list(spec['weapons']).index(gun)*10+spec['parts'].index(part)
  for node in ['7','8']:graph[node]['inputs'].update(width=512,height=384)
  graph['12']['inputs']['filename_prefix']=f'project-strike/gunsmith-components/v2/{key}'
  gh=digest(json.dumps(graph,sort_keys=True).encode());job=jobs.get(key)
  if job and (job['graphHash']!=gh or job['sourceSha256']!=sourcehash):raise RuntimeError('Reference or workflow changed: create a new pipeline revision')
  if not job:
   actual=upload(graph['13']['inputs']['image'],refbytes)
   if actual!=graph['13']['inputs']['image']:raise RuntimeError('Upload name mismatch')
   jobs[key]=job={'graphHash':gh,'sourceSha256':sourcehash,'status':'submitting'};save()
   (LOCAL/f'{key}.workflow.json').write_text(json.dumps(graph,indent=2))
   job['promptId']=api('/prompt',{'prompt':graph,'client_id':'strike-gunsmith-components-v2'})['prompt_id'];job['status']='queued';save();print(key+': submitted',flush=True)
  if 'promptId' not in job:raise RuntimeError('Ambiguous submission; recover recorded job before retrying')
  rawpath=LOCAL/f'{key}.original.png'
  if rawpath.exists() and job.get('originalSha256') and digest(rawpath.read_bytes())!=job['originalSha256']:raise RuntimeError('Original output was changed')
  if not rawpath.exists():
   while True:
    entry=api('/history/'+job['promptId']).get(job['promptId'])
    if entry and entry.get('status',{}).get('status_str')=='error':raise RuntimeError(str(entry))
    if entry and entry.get('outputs',{}).get('12',{}).get('images'):break
    time.sleep(2)
   images=entry['outputs']['12']['images']
   if len(images)!=1:raise RuntimeError('Exactly one output required')
   rawpath.write_bytes(urllib.request.urlopen('http://127.0.0.1:8188/view?'+urllib.parse.urlencode(images[0])).read())
  # White matte -> transparent component, preserving black outlines. Keep original bytes for audit.
  im=Image.open(rawpath).convert('RGB');a=np.array(im);alpha=np.where(a.min(axis=2)>225,0,255).astype('uint8')
  visible=a[alpha>0].astype('int32');nearest=((visible[:,None,:]-palette[None,:,:].astype('int32'))**2).sum(axis=2).argmin(axis=1);a[alpha>0]=palette[nearest]
  result=Image.fromarray(np.dstack((a,alpha)),'RGBA');bbox=result.getbbox()
  if not bbox:raise RuntimeError('Empty component')
  result=result.crop(bbox);out=OUT/f'{key}.png';result.save(out)
  target=rect.copy()
  if part=='heavy':target[2]=round(rect[2]*1.12)
  if part=='short':target[2]=round(rect[2]*.72)
  if part=='quickmag':target[3]=round(rect[3]*.8)
  else:target[0]-=12;target[2]+=12
  if part=='quickmag' and gun in ['mp5','scout']:target[1]=round(h*({'mp5':.49,'scout':.43}[gun]))
  mask=[rect[0],0,w-rect[0],h]
  if gun=='saw':mask=[rect[0],round(h*.35),w-rect[0],h-round(h*.35)]
  entries[gun]['parts'][part]={'file':out.name,'sha256':digest(out.read_bytes()),'width':result.width,'height':result.height,'replace':mask if slot=='barrel' else None,'target':target,'referenceSha256':digest(refbytes)}
  job['originalSha256']=digest(rawpath.read_bytes());job['status']='complete';job['sha256']=digest(out.read_bytes());save();print(key+': complete',flush=True)
 (OUT/'manifest.json').write_text(json.dumps({'version':2,'weapons':entries},indent=2))
(ROOT/'src/client/presentation/gunsmith-components.json').write_bytes((OUT/'manifest.json').read_bytes())
print('All per-weapon components published.',flush=True)

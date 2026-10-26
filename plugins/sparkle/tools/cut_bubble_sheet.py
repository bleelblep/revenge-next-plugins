"""Step 2: cuts the labelled sheet into sprites/blow, sprites/look, fx/bubble_1..6 and fx/pop, scaled
(0.54) to match the fixed sprites and anchored on the horn so the unicorn stays put. Prints the
BlowRelease values for Sprites.kt. Usage: python tools/cut_bubble_sheet.py 118   (cell width)
Then run build_sprites.py."""
from PIL import Image
import numpy as np, json, os, shutil
import pathlib, tempfile
HERE = pathlib.Path(__file__).resolve().parent.parent
WORK = pathlib.Path(tempfile.gettempdir())
SHEET = str(HERE / "art/bubble_sheet.png")
P = str(HERE) + "/"
im=np.array(Image.open(SHEET).convert('RGBA')); lab=np.load(WORK / 'sparkle_lab.npy')
comps={c[0]:c for c in json.load(open(WORK / 'sparkle_comps.json')) if c[5]>=15}
BUBBLES={8,15,17,18,55,56}
import sys
S=0.54; CW=int(sys.argv[1]) if len(sys.argv)>1 else 90; CH=145; FLOOR=4
def down(a,s):
    w,h=max(1,round(a.shape[1]*s)),max(1,round(a.shape[0]*s))
    f=a.astype(float); f[:,:,:3]*=f[:,:,3:4]/255
    q=np.array(Image.fromarray(f.astype(np.uint8)).resize((w,h),Image.BOX)).astype(float)
    al=q[:,:,3:4]; rgb=np.where(al>0,q[:,:,:3]*255/np.maximum(al,1),0)
    return np.concatenate([rgb,np.where(al>=128,255,0)],2).clip(0,255).astype(np.uint8)
def mask_of(ids):
    return np.isin(lab,list(ids))
# idle horn anchor: yellow pixels near the top middle of idle_01
ia=np.array(Image.open(P+'sprites/idle/idle_01.png').convert('RGBA')).astype(int)
ym=(ia[:,:,3]>128)&(ia[:,:,0]>200)&(ia[:,:,1]>120)&(ia[:,:,2]<120); ym[:,:25]=False; ym[:,70:]=False; ym[20:,:]=False
ys,xs=np.nonzero(ym); idle_w=ia.shape[1]
ANCHOR=xs.mean()+(CW-idle_w)/2
print('horn anchor x in cell',round(ANCHOR,1))
def horn_x(main):
    c=comps[main]; m=lab[c[2]:c[2]+14,c[1]:c[3]]==main; ys,xs=np.nonzero(m); return c[1]+xs.mean()
def frame(main, extra_range, scale, exclude=()):
    c=comps[main]; x0,x1=extra_range; y0,y1=c[2]-40,c[4]+10
    ids={main}
    for k,d in comps.items():
        if k==main or k in BUBBLES or k in exclude: continue
        cx=(d[1]+d[3])/2; cy=(d[2]+d[4])/2
        if x0<=cx<=x1 and y0<=cy<=y1: ids.add(k)
    m=mask_of(ids); ys,xs=np.nonzero(m[y0:y1,x0:x1]); bx0,bx1=x0+xs.min(),x0+xs.max()+1; by0,by1=y0+ys.min(),y0+ys.max()+1
    sub=im[by0:by1,bx0:bx1].copy(); sub[~m[by0:by1,bx0:bx1]]=0
    small=down(sub,scale)
    hx=(horn_x(main)-bx0)*scale; bottom=(c[4]-by0)*scale   # unicorn's own bottom (rainbow), not sparkles
    ox=round(ANCHOR-hx); oy=round(CH-FLOOR-bottom)
    canvas=Image.new('RGBA',(CW,CH),(0,0,0,0))
    tile=Image.fromarray(small); canvas.paste(tile,(ox,oy),tile)
    clipped = ox<0 or ox+tile.width>CW or oy<0
    return canvas,(bx0,by0,ox,oy),clipped
def to_cell(pt,tr,scale):
    bx0,by0,ox,oy=tr; return ((pt[0]-bx0)*scale+ox,(pt[1]-by0)*scale+oy)
# rows, in sheet order; x ranges bound each cell's sparkles
blow=[(1,(40,230)),(2,(240,430)),(3,(440,640)),(4,(645,845)),(6,(850,1050)),(7,(1055,1250)),(5,(1255,1395)),
      (9,(40,260)),(10,(265,460)),(11,(465,680)),(13,(685,812)),(14,(900,1080)),(12,(1255,1510)),
      (26,(40,240)),(24,(250,460)),(25,(470,680)),(27,(685,900)),(28,(920,1140)),(29,(1290,1510))]
look=[50,52,51,53,54]
out_blow=P+'sprites/blow'; out_look=P+'sprites/look'
for d in (out_blow,out_look): shutil.rmtree(d,ignore_errors=True); os.makedirs(d)
tr_of={}
for i,(k,r) in enumerate(blow,1):
    img,tr,cl=frame(k,r,S); tr_of[k]=tr; img.save(f'{out_blow}/blow_{i:02d}.png')
    if cl: print('clipped blow',i,k)
LS=S*223/166
for i,k in enumerate(look,1):
    c=comps[k]; img,tr,cl=frame(k,(c[1]-5,c[3]+5),LS); img.save(f'{out_look}/look_{i:02d}.png')
    if cl: print('clipped look',i)
# where each released bubble sits in its frame, in cell pixels
rel=[]
for fi,(bub,frame_comp) in [(7,(8,5)),(11,(17,13)),(13,(18,12))]:
    b=comps[bub]; ctr=((b[1]+b[3])/2,(b[2]+b[4])/2); cx,cy=to_cell(ctr,tr_of[frame_comp],S)
    rel.append((fi-1,round(cx,1),round(cy,1),round((b[3]-b[1])*S,1),bub))
print('releases (frameIndex, cx, cy, diameter, comp):',rel)
# bubble variants
for f in os.listdir(P+'fx'):
    if f.startswith('bubble'): os.remove(P+'fx/'+f)
order=[8,15,17,55,56,18]
for i,k in enumerate(order,1):
    c=comps[k]; sub=im[c[2]:c[4],c[1]:c[3]].copy(); sub[lab[c[2]:c[4],c[1]:c[3]]!=k]=0
    t=Image.fromarray(down(sub,S)); t.save(f"{P}fx/bubble_{i}.png"); print('bubble',i,'comp',k,t.size)
print('variant index of released comps:',{k:order.index(k) for k in (8,17,18)})
# pop: the three sparkle clusters after the last bubble on row 4
ids=[k for k,d in comps.items() if d[1]>=1100 and d[3]<=1340 and d[2]>=860 and d[4]<=960]
m=mask_of(ids); ys,xs=np.nonzero(m[860:960,1100:1340]); x0,x1,y0,y1=1100+xs.min(),1100+xs.max()+1,860+ys.min(),860+ys.max()+1
sub=im[y0:y1,x0:x1].copy(); sub[~m[y0:y1,x0:x1]]=0
Image.fromarray(down(sub,S)).save(P+'fx/pop.png'); print('pop',len(ids),'pieces', Image.open(P+'fx/pop.png').size)

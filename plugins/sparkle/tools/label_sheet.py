"""Step 1 of re-cutting art/bubble_sheet.png: labels every separate piece of art (alpha >= 200) and
saves the labels to the temp folder for cut_bubble_sheet.py. Run from anywhere: python tools/label_sheet.py"""
from PIL import Image, ImageDraw
import numpy as np
from collections import deque
import pathlib, tempfile
HERE = pathlib.Path(__file__).resolve().parent.parent
WORK = pathlib.Path(tempfile.gettempdir())
SHEET = str(HERE / "art/bubble_sheet.png")
im=np.array(Image.open(SHEET).convert('RGBA'))
fg=im[:,:,3]>=200
H,W=fg.shape
lab=np.zeros((H,W),np.int32); comps=[]; k=0
ys,xs=np.nonzero(fg)
for y0,x0 in zip(ys,xs):
    if lab[y0,x0]: continue
    k+=1; q=deque([(y0,x0)]); lab[y0,x0]=k; x1=x2=x0; y1=y2=y0; a=0
    while q:
        y,x=q.popleft(); a+=1
        if x<x1:x1=x
        if x>x2:x2=x
        if y<y1:y1=y
        if y>y2:y2=y
        for dy in (-1,0,1):
            for dx in (-1,0,1):
                ny,nx=y+dy,x+dx
                if 0<=ny<H and 0<=nx<W and fg[ny,nx] and not lab[ny,nx]:
                    lab[ny,nx]=k; q.append((ny,nx))
    comps.append([int(v) for v in (k,x1,y1,x2+1,y2+1,a)])
np.save(WORK / 'sparkle_lab.npy', lab)
import json; json.dump(comps,open(WORK / 'sparkle_comps.json','w'))

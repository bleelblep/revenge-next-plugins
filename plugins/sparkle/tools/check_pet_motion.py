"""Validate source/runtime coverage and embedded strip bytes before packaging."""
import base64
import io
import json
import re
from pathlib import Path
from PIL import Image

ROOT=Path(__file__).resolve().parent.parent
ART=ROOT/'art/pet_motion'
SRC=ROOT/'src/main/kotlin/com/bleelblep/sparkle'
records=json.loads((ART/'manifest.json').read_text())
states=set(re.findall(r'^\s*([A-Z_]+)\("',(SRC/'Sprites.kt').read_text(),re.M))
assert len(records)==12 and len({r['id'] for r in records})==12
data=(SRC/'PetMotionData.kt').read_text()
embedded=re.findall(r'"([a-z_0-9-]+)" to PetMotionData.Strip\(intArrayOf\(([^)]*)\), (true|false), arrayOf\(([^)]*)\)\)',data)
assert len(embedded)==288
index=0
for r in records:
    assert {a['name'].split('-')[0].upper() for a in r['animations']}==states
    assert 0<r['mouth'][0]<r['w'] and 0<r['mouth'][1]<r['h']
    for a in r['animations']:
        name,times,loop,chunks=embedded[index];index+=1
        raw=base64.b64decode(''.join(re.findall('"([^"]*)"',chunks)))
        assert name==a['name'] and raw==(ART/r['id']/(name+'.png')).read_bytes()
        assert list(map(int,times.split(',')))==a['times'] and min(a['times'])>0
        with Image.open(io.BytesIO(raw)) as im:
            assert im.size==(r['w']*len(a['times']),r['h'])
            for i in range(len(a['times'])):
                frame=im.crop((i*r['w'],0,(i+1)*r['w'],r['h']))
                b=frame.getbbox();assert b and b[0]>0 and b[1]>0 and b[2]<r['w'] and b[3]<r['h']
                if name=='reaction-0':
                    colours=set(frame.get_flattened_data())
                    assert all(c in colours for c in ((255,102,140,255),(255,148,182,255),(239,114,158,255)))
        if name=='blow':assert a['times']==[125]*19
print('PASS: 12 breeds, 288 embedded clips, every Anim, 3 hearts per affection frame, safe outline margins and exact bubble timing.')

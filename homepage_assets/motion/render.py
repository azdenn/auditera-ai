"""Edit the four synthetic LeaseVerify captures into the silent homepage loop.
Run capture.cjs first, then python render.py CAPTURE_DIRECTORY.
"""
from pathlib import Path
from functools import lru_cache
import math
import subprocess
import sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageOps

src = Path(sys.argv[1])
dest = Path(__file__).resolve().parents[2] / 'dist' / 'media'
dest.mkdir(exist_ok=True)
W, H, FPS = 1080, 660, 24
DURATIONS = [4, 5, 4, 4]
ink, quiet, foil = '#eef7ff', '#b8ccdf', '#7cc6f3'
@lru_cache(None)
def font(size, family='ui'):
    filename = {'ui':'segoeui.ttf','bold':'seguisb.ttf','mono':'consola.ttf'}[family]
    return ImageFont.truetype(str(Path('C:/Windows/Fonts') / filename), size)
def text(d, xy, value, size, fill=ink, family='ui'):
    d.text(xy, value, font=font(size,family), fill=fill, anchor='lt')
def ease(v):
    v = max(0,min(1,v))
    return v*v*(3-2*v)
def fit(im,w,h):
    return ImageOps.contain(im,(w,h),Image.Resampling.LANCZOS)

# Fine blue orbital lines move around a stationary, readable document surface.
bg = Image.new('RGB',(W,H))
pixels = bg.load()
for y in range(H):
    for x in range(W):
        glow=math.exp(-(((x-910)/430)**2+((y-180)/260)**2))
        glint=math.exp(-(((x-90)/760)**2+((y-580)/190)**2))
        pixels[x,y]=(int(15+13*glow+8*glint),int(26+27*glow+11*glint),int(39+55*glow+14*glint))
bd=ImageDraw.Draw(bg)
for n in range(11):
    bd.arc((450+n*11,-215+n*6,1400+n*10,330+n*7),7,139,fill=(48-n,60-n*2,82-n*3),width=1)
for x in range(18,W,26):
    for y in range(14,H,26):
        if x>740 or y>500: bd.point((x,y),fill='#446281')
heads=['Start with two files.','See the difference.','Keep the finding.','Take the report with you.']
kickers=['SOURCE DOCUMENTS','CHARGE COMPARISON','SAVED REPORT','DOWNLOADED COPY']
sub=['Unit B302   /   Lease PDF + rent roll','Trash service   /   Unit B302','Lumen Court   /   Mismatches only','Lumen Court - Charge Review.html']
images=[Image.open(src/(n+'.png')).convert('RGB') for n in ['sources','findings','save','report']]
# Crop out only the empty margins below the content of the downloaded HTML.
images[3]=images[3].crop((34,56,784,472))
def panel(canvas,im,x,y,w,h):
    d=ImageDraw.Draw(canvas)
    d.rounded_rectangle((x+2,y+7,x+w+2,y+h+7),14,fill='#101c29')
    d.rounded_rectangle((x,y,x+w,y+h),14,fill='#f4f9ff',outline='#98b6d1',width=2)
    shot=fit(im,w-24,h-18)
    canvas.paste(shot,(x+12,y+(h-shot.height)//2))
empty, lease_only, before_save = [Image.open(src/(n+'.png')).convert('RGB') for n in ['empty','lease-only','before-save']]
def dissolve(a,b,t):
    if t<=0:return a
    if t>=1:return b
    return Image.blend(a.resize(b.size),b,ease(t))
def scene(i,t):
    frame=bg.copy()
    d=ImageDraw.Draw(frame)
    text(d,(54,40),'LeaseVerify',30,ink,'bold')
    text(d,(742,47),'LUMEN COURT  /  SAMPLE AUDIT',18,quiet,'mono')
    d.line((54,91,1026,91),fill='#42617d')
    text(d,(55,133),kickers[i],20,foil,'mono')
    text(d,(52,172),heads[i],62,ink,'bold')
    text(d,(56,262),sub[i],27,quiet)
    dy=round(16*(1-ease(t/.6)))
    if i==1:
        for j,(label,money) in enumerate([('LEASE','$17'),('RENT ROLL','$27'),('DIFFERENCE','+$10 / mo')]):
            x=56+j*310
            text(d,(x,335+dy),label,19,quiet,'mono')
            text(d,(x,371+dy),money,48,foil if j==2 else ink,'bold')
        panel(frame,images[i],54,464+dy,972,112)
    else:
        shot=images[i]
        if i==0:
            shot=dissolve(empty,lease_only,(t-.52)/.26) if t<1.55 else dissolve(lease_only,shot,(t-1.55)/.26)
        elif i==2:
            shot=dissolve(before_save,shot,(t-1.55)/.28)
        panel(frame,shot,54,322+dy,972,250)
        if i==3:
            # A visual echo of the download action beside the actual report.
            d.line((658,345+dy,658,551+dy),fill='#aabed1',width=2)
            d.line([(733,374+dy),(733,417+dy),(718,402+dy)],fill='#2e6387',width=5)
            d.line([(733,417+dy),(748,402+dy)],fill='#2e6387',width=5)
            text(d,(707,445+dy),'Report copy',31,'#1f3046','bold')
            text(d,(708,494+dy),'HTML document',23,'#445a70')
    for j in range(4):
        x=54+246*j
        d.rounded_rectangle((x,618,x+230,622),2,fill='#41566d')
        fraction=1 if j<i else min(1,t/DURATIONS[i]) if j==i else 0
        if fraction>0:d.rounded_rectangle((x,618,x+max(3,round(230*fraction)),622),2,fill=foil)
    return frame
output=dest/'leaseverify-walkthrough.mp4'
cmd=['ffmpeg','-hide_banner','-loglevel','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-','-an','-c:v','libx264','-threads','2','-preset','veryfast','-crf','19','-pix_fmt','yuv420p','-movflags','+faststart',str(output)]
proc=subprocess.Popen(cmd,stdin=subprocess.PIPE)
for i,duration in enumerate(DURATIONS):
    previous=scene((i-1)%4,DURATIONS[(i-1)%4])
    for n in range(duration*FPS):
        t=n/FPS
        frame=scene(i,t)
        if i and n<7:frame=Image.blend(previous,frame,ease((n+1)/7))
        proc.stdin.write(frame.tobytes())
proc.stdin.close()
if proc.wait():raise SystemExit('Video encode failed')
scene(1,2.5).save(dest/'leaseverify-walkthrough.webp',quality=93)

"""Render silent tours from capture-gallery.cjs screenshots of synthetic audit runs."""
from pathlib import Path
import subprocess
import sys
from PIL import Image, ImageDraw, ImageFont, ImageOps

source = Path(sys.argv[1])
media = Path(__file__).resolve().parents[2] / 'dist' / 'media'
font_dir = Path('C:/Windows/Fonts')
heading = ImageFont.truetype(str(font_dir / 'seguisb.ttf'), 31)
small = ImageFont.truetype(str(font_dir / 'segoeui.ttf'), 20)
width, height, fps = 1080, 656, 24
scenes = {
    'concession': ('ConcessionVerify', [('upload', 'Start with the ledger and rent roll'), ('rows', 'Open the unit’s concession breakdown'), ('detail', 'Two $800 credits add up to four weeks')]),
    'deposit': ('DepositVerify', [('upload', 'Compare the coverage invoice with the rent roll'), ('rows', 'Find the unit flagged for review'), ('detail', 'See the $35 invoice with no matching charge')]),
    'reports': ('Saved reports', [('save', 'Save just the mismatches'), ('library', 'Reopen the report from the dashboard'), ('copy', 'Download a copy with the finding inside')])
}
for slug, (title, steps) in scenes.items():
    stills = []
    for name, caption in steps:
        frame = Image.new('RGB', (width, height), '#122333')
        draw = ImageDraw.Draw(frame)
        draw.text((24, 9), title, font=small, fill='#dbeeff')
        draw.text((1056, 9), 'Lumen Court  /  Sample audit', font=small, anchor='rt', fill='#b4cbdc')
        shot = Image.open(source / f'{slug}-{name}.png').convert('RGB')
        frame.paste(ImageOps.fit(shot,(width,540)),(0,43))
        draw.text((24, 593), caption, font=heading, fill='#f4f9fc')
        stills.append(frame)
    stills[-1].save(media / f'{slug}-tour.webp', quality=87)
    command = ['ffmpeg','-loglevel','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s',f'{width}x{height}','-r',str(fps),'-i','-','-an','-c:v','libx264','-threads','2','-preset','veryfast','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',str(media / f'{slug}-tour.mp4')]
    encoder = subprocess.Popen(command, stdin=subprocess.PIPE)
    try:
        for i, still in enumerate(stills):
            for n in range(4 * fps):
                progress = n / (4 * fps)
                blend = max(0, (n - (4 * fps - 8)) / 8)
                frame = Image.blend(still, stills[(i+1)%len(stills)], blend) if blend else still.copy()
                draw = ImageDraw.Draw(frame)
                for j in range(3):
                    x = 24+j*347
                    draw.rectangle((x,644,x+337,646),fill='#405365')
                    amount = 1 if j<i else progress if j==i else 0
                    if amount:
                        draw.rectangle((x,644,x+round(337*amount),646),fill='#a5d9fb')
                encoder.stdin.write(frame.tobytes())
    finally:
        encoder.stdin.close()
        if encoder.wait():
            raise RuntimeError(f'Encoding failed for {slug}')


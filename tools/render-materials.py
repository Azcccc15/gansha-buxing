"""Render every delivered PDF page and make inspection sheets."""
from pathlib import Path
import pypdfium2 as pdfium
from PIL import Image, ImageDraw
from pypdf import PdfReader

root = Path(__file__).resolve().parents[1]
out = root / 'private/qa'
out.mkdir(parents=True, exist_ok=True)
names = [('源程序鉴别材料.pdf', 'source'), ('操作说明书.pdf', 'manual'), ('申请填报参考.pdf', 'application'), ('界面操作示例.pdf', 'screens')]
for filename, label in names:
    path = root / 'private/copyright' / filename
    doc = pdfium.PdfDocument(str(path))
    folder = out / label; folder.mkdir(exist_ok=True)
    thumbs = []
    for index in range(len(doc)):
        image = doc[index].render(scale=1.5).to_pil().convert('RGB')
        image.save(folder / f'page-{index+1:02}.png')
        image.thumbnail((220, 320))
        tile = Image.new('RGB', (240, 350), 'white'); tile.paste(image, ((240-image.width)//2, 25))
        ImageDraw.Draw(tile).text((10, 6), label + ' ' + str(index+1), fill='black')
        thumbs.append(tile)
    for offset in range(0, len(thumbs), 12):
        chosen = thumbs[offset:offset+12]
        sheet = Image.new('RGB', (960, 350 * ((len(chosen)+3)//4)), '#dddddd')
        for index, image in enumerate(chosen): sheet.paste(image, ((index%4)*240, (index//4)*350))
        sheet.save(out / f'{label}-sheet-{offset//12+1}.png')
    reader = PdfReader(str(path))
    assert len(reader.pages) == len(doc)
    assert all('干啥不行目标规划管理软件' in page.extract_text() for page in reader.pages)
    print(label, len(doc), 'pages rendered and text checked')

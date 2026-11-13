import glob, os
from pptx import Presentation
from pptx.util import Inches

slides = sorted(glob.glob('submission/slides/slide-*.png'))
prs = Presentation()
prs.slide_width = Inches(13.333)
prs.slide_height = Inches(7.5)
blank = prs.slide_layouts[6]
for f in slides:
    s = prs.slides.add_slide(blank)
    s.shapes.add_picture(f, 0, 0, width=prs.slide_width, height=prs.slide_height)
prs.save('submission/把桩-作品说明.pptx')
print('slides in deck:', len(slides), os.path.getsize('submission/把桩-作品说明.pptx'))

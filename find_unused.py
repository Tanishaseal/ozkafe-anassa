import os
import re

with open('src/data/menu.js', 'r', encoding='utf-8') as f:
    content = f.read()

used_images = set(re.findall(r"/images/([^'\"]+\.(?:png|jpg|jpeg))", content))
all_images = set([f for f in os.listdir('public/images') if f.endswith('.png') or f.endswith('.jpg') or f.endswith('.jpeg')])

unused = all_images - used_images
print(f"Unused images: {len(unused)}")
for img in unused:
    print(f"  {img}")

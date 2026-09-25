import os
import re
from PIL import Image

src_image = r"C:\Users\TANISHA\.gemini\antigravity-ide\brain\6b0d9b5f-0ccd-407f-9b71-ac8a6cef948a\veg_momos_1790276725370.jpg"
public_dir = "public/images"
new_filename = "veg_momo_updated.png"
dest_path = os.path.join(public_dir, new_filename)

def update():
    print("Processing image with PIL...")
    img = Image.open(src_image)
    img.thumbnail((400, 400))
    img = img.convert("RGBA")
    
    datas = img.getdata()
    newData = []
    
    # White background threshold
    for item in datas:
        # If it's near white, make it transparent
        if item[0] > 240 and item[1] > 240 and item[2] > 240:
            newData.append((255, 255, 255, 0))
        else:
            newData.append(item)
            
    img.putdata(newData)
    img.save(dest_path, "PNG")
    print(f"Saved {dest_path}")
    
    menu_path = 'src/data/menu.js'
    with open(menu_path, 'r', encoding='utf-8') as f:
        content = f.read()
        
    pattern = r"(name:\s*'Veg Momo'.*?img:\s*')([^']+)'"
    content = re.sub(pattern, rf"\1/images/{new_filename}'", content, count=1, flags=re.DOTALL)

    with open(menu_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("menu.js updated successfully.")

if __name__ == '__main__':
    update()

import os
import re
from PIL import Image
import io

src_image_path = r"C:\Users\TANISHA\.gemini\antigravity-ide\brain\6b0d9b5f-0ccd-407f-9b71-ac8a6cef948a\.user_uploaded\media_1790276998488.png"

# Tighter bounding boxes to avoid the text
# Width of each col = 115
# Top row Y: 10 to 115
# Col 0: 5 to 110, Col 1: 120 to 225, Col 2: 235 to 340, Col 3: 350 to 455, Col 4: 465 to 570
items = [
    {"name": "Berrylicious Mocka Coffee", "box": (0, 10, 115, 115)},
    {"name": "Vietnamese / Cold Coffee", "box": (115, 10, 230, 115)},
    {"name": "Coffee Fizzy", "box": (230, 10, 345, 115)},
    {"name": "Mandarina", "box": (345, 10, 460, 115)},
    {"name": "Affogato", "box": (460, 10, 575, 115)},
    # Bottom row Y: 175 to 280
    {"name": "Lemon & Peach Ice Tea", "box": (115, 175, 230, 280)}, 
    {"name": "Hibiscus Ice Tea", "box": (230, 175, 345, 280)},
    {"name": "Butterfly Ice Tea", "box": (345, 175, 460, 280)}
]

def sanitize_filename(name):
    return re.sub(r'[^a-zA-Z0-9]', '_', name).lower()

def make_transparent(img):
    img = img.convert("RGBA")
    datas = img.getdata()
    newData = []
    for item in datas:
        # Beige background color roughly (239, 233, 226)
        if item[0] > 220 and item[1] > 215 and item[2] > 200:
            newData.append((255, 255, 255, 0))
        else:
            newData.append(item)
    img.putdata(newData)
    return img

def extract_and_update():
    img = Image.open(src_image_path).convert("RGB")
    
    menu_path = 'src/data/menu.js'
    with open(menu_path, 'r', encoding='utf-8') as f:
        content = f.read()

    for item in items:
        name = item["name"]
        box = item["box"]
        print(f"Extracting {name} at {box}")
        
        cropped = img.crop(box)
        cropped = make_transparent(cropped)
        
        filename = f"{sanitize_filename(name)}_extracted.png"
        dest_path = os.path.join("public", "images", filename)
        
        cropped.save(dest_path, "PNG")
        print(f"  -> Saved to {dest_path}")
        
        # Update menu.js
        # Look for the item block
        # Because names like 'Vietnamese / Cold Coffee' have slash, it might be tricky in regex
        # I'll replace the name exactly in the text
        pattern = rf"(name:\s*'{re.escape(name)}'.*?img:\s*')([^']+)'"
        content = re.sub(pattern, rf"\1/images/{filename}'", content, count=1, flags=re.DOTALL)
        
    with open(menu_path, 'w', encoding='utf-8') as f:
        f.write(content)
        
    print("Successfully updated menu.js with extracted images!")

if __name__ == '__main__':
    extract_and_update()

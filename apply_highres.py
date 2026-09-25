import os
import re
from PIL import Image

images = [
    {"name": "Berrylicious Mocka Coffee", "src": r"C:\Users\TANISHA\.gemini\antigravity-ide\brain\6b0d9b5f-0ccd-407f-9b71-ac8a6cef948a\berrylicious_mocka_1790277367344.jpg"},
    {"name": "Vietnamese / Cold Coffee", "src": r"C:\Users\TANISHA\.gemini\antigravity-ide\brain\6b0d9b5f-0ccd-407f-9b71-ac8a6cef948a\vietnamese_cold_coffee_1790277378429.jpg"},
    {"name": "Coffee Fizzy", "src": r"C:\Users\TANISHA\.gemini\antigravity-ide\brain\6b0d9b5f-0ccd-407f-9b71-ac8a6cef948a\coffee_fizzy_1790277390296.jpg"},
    {"name": "Mandarina", "src": r"C:\Users\TANISHA\.gemini\antigravity-ide\brain\6b0d9b5f-0ccd-407f-9b71-ac8a6cef948a\mandarina_1790277402387.jpg"},
    {"name": "Affogato", "src": r"C:\Users\TANISHA\.gemini\antigravity-ide\brain\6b0d9b5f-0ccd-407f-9b71-ac8a6cef948a\affogato_1790277418723.jpg"},
    {"name": "Lemon & Peach Ice Tea", "src": r"C:\Users\TANISHA\.gemini\antigravity-ide\brain\6b0d9b5f-0ccd-407f-9b71-ac8a6cef948a\lemon_peach_tea_1790277432063.jpg"},
    {"name": "Hibiscus Ice Tea", "src": r"C:\Users\TANISHA\.gemini\antigravity-ide\brain\6b0d9b5f-0ccd-407f-9b71-ac8a6cef948a\hibiscus_tea_1790277443163.jpg"},
    {"name": "Butterfly Ice Tea", "src": r"C:\Users\TANISHA\.gemini\antigravity-ide\brain\6b0d9b5f-0ccd-407f-9b71-ac8a6cef948a\butterfly_tea_1790277454127.jpg"}
]

def sanitize_filename(name):
    return re.sub(r'[^a-zA-Z0-9]', '_', name).lower()

def make_transparent(img):
    img = img.convert("RGBA")
    datas = img.getdata()
    newData = []
    for item in datas:
        # High quality generated images have pure white background
        if item[0] > 240 and item[1] > 240 and item[2] > 240:
            newData.append((255, 255, 255, 0))
        else:
            newData.append(item)
    img.putdata(newData)
    return img

def update():
    menu_path = 'src/data/menu.js'
    with open(menu_path, 'r', encoding='utf-8') as f:
        content = f.read()

    for item in images:
        name = item["name"]
        src = item["src"]
        print(f"Processing {name}")
        
        img = Image.open(src)
        img.thumbnail((400, 400)) # resize so it's not too huge for the UI
        img = make_transparent(img)
        
        filename = f"{sanitize_filename(name)}_highres.png"
        dest_path = os.path.join("public", "images", filename)
        
        img.save(dest_path, "PNG")
        print(f"  -> Saved to {dest_path}")
        
        # Update menu.js
        pattern = rf"(name:\s*'{re.escape(name)}'.*?img:\s*')([^']+)'"
        content = re.sub(pattern, rf"\1/images/{filename}'", content, count=1, flags=re.DOTALL)
        
    with open(menu_path, 'w', encoding='utf-8') as f:
        f.write(content)
        
    print("Successfully updated menu.js with high-res images!")

if __name__ == '__main__':
    update()

import os
import re
from rembg import remove, new_session
from PIL import Image
import io

images_to_process = {
    'Single Espresso': 'coffee_single_espresso_1790271012232.jpg',
    'Double Espresso': 'coffee_double_espresso_1790271077796.jpg',
    'Americano': 'coffee_americano_1790271089696.jpg',
    'Espresso Macchiato': 'coffee_macchiato_1790271103650.jpg',
    'Cortado': 'coffee_cortado_1790271115775.jpg',
    'Cappuccino': 'coffee_cappuccino_1790271127234.jpg',
    'Latte': 'coffee_latte_1790271138470.jpg',
    'Flat White': 'coffee_flat_white_1790271150237.jpg'
}

artifact_dir = r"C:\Users\TANISHA\.gemini\antigravity-ide\brain\6b0d9b5f-0ccd-407f-9b71-ac8a6cef948a"
public_dir = "public/images"

def sanitize_filename(name):
    return re.sub(r'[^a-zA-Z0-9]', '_', name).lower()

def update_menu():
    menu_path = 'src/data/menu.js'
    with open(menu_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    print("Initializing U2NET session...")
    session = new_session("u2net")
    
    for item_name, img_file in images_to_process.items():
        src_path = os.path.join(artifact_dir, img_file)
        if not os.path.exists(src_path):
            print(f"File not found: {src_path}")
            continue
            
        print(f"Processing {item_name}...")
        
        img = Image.open(src_path)
        img.thumbnail((400, 400))
        img = img.convert('RGB')
        buffer = io.BytesIO()
        img.save(buffer, format="JPEG")
        resized_data = buffer.getvalue()
        
        output_data = remove(
            resized_data,
            session=session,
            alpha_matting=False  # DISABLED ALPHA MATTING TO PREVENT OOM
        )
        
        new_filename = f"{sanitize_filename(item_name)}.png"
        dest_path = os.path.join(public_dir, new_filename)
        
        with open(dest_path, 'wb') as f:
            f.write(output_data)
        
        print(f"Saved {dest_path}")
        
        pattern = rf"(name:\s*'{item_name}'.*?img:\s*')([^']+)'"
        content = re.sub(pattern, rf"\1/images/{new_filename}'", content, count=1, flags=re.DOTALL)

    with open(menu_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("menu.js updated successfully.")

if __name__ == '__main__':
    update_menu()

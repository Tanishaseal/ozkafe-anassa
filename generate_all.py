import os
import re
import urllib.request
import urllib.parse
from rembg import remove, new_session
from PIL import Image
import io
import time

def sanitize_filename(name):
    return re.sub(r'[^a-zA-Z0-9]', '_', name).lower()

SKIP_IMAGES = {
    '/images/single_espresso.png',
    '/images/double_espresso.png',
    '/images/americano.png',
    '/images/espresso_macchiato.png',
    '/images/cortado.png',
    '/images/cappuccino.png',
    '/images/latte.png',
    '/images/flat_white.png'
}

def generate_image(name, item_id, session):
    prompt = f"A high quality food photography of {name}, cafe style, overhead view, isolated on a pure white background"
    encoded_prompt = urllib.parse.quote(prompt)
    url = f"https://image.pollinations.ai/prompt/{encoded_prompt}?width=512&height=512&nologo=true&seed={item_id}"
    
    print(f"Generating image for {name} ({item_id})...")
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    
    max_retries = 3
    for attempt in range(max_retries):
        try:
            with urllib.request.urlopen(req, timeout=15) as response:
                data = response.read()
            
            img = Image.open(io.BytesIO(data))
            img.thumbnail((400, 400))
            img = img.convert('RGB')
            buffer = io.BytesIO()
            img.save(buffer, format="JPEG")
            resized_data = buffer.getvalue()
            
            output_data = remove(
                resized_data,
                session=session,
                alpha_matting=False
            )
            
            filename = f"{sanitize_filename(name)}_{item_id}.png"
            dest_path = os.path.join("public/images", filename)
            
            with open(dest_path, 'wb') as f:
                f.write(output_data)
                
            return f"/images/{filename}"
            
        except Exception as e:
            print(f"  Attempt {attempt+1} failed for {name}: {e}")
            time.sleep(2)
            
    return None

def main():
    menu_path = 'src/data/menu.js'
    with open(menu_path, 'r', encoding='utf-8') as f:
        content = f.read()

    print("Initializing U2NET session...")
    session = new_session("u2net")
    
    blocks = content.split("id: ")
    new_blocks = [blocks[0]]
    count = 0
    
    for block in blocks[1:]:
        item_id_match = re.match(r"'([^']+)'", block)
        name_match = re.search(r"name:\s*'([^']+)'", block)
        img_match = re.search(r"img:\s*'([^']+)'", block)
        
        if item_id_match and name_match and img_match:
            item_id = item_id_match.group(1)
            name = name_match.group(1)
            img_path = img_match.group(1)
            
            if img_path not in SKIP_IMAGES:
                expected_filename = f"{sanitize_filename(name)}_{item_id}.png"
                if expected_filename not in img_path:
                    new_img_path = generate_image(name, item_id, session)
                    if new_img_path:
                        old_line = f"img: '{img_path}'"
                        new_line = f"img: '{new_img_path}'"
                        block = block.replace(old_line, new_line)
                        count += 1
                        print(f"  -> Updated {name}")

        new_blocks.append("id: " + block)

    with open(menu_path, 'w', encoding='utf-8') as f:
        f.write("".join(new_blocks))
        
    print(f"Done! Generated and updated {count} images in menu.js.")

if __name__ == "__main__":
    main()

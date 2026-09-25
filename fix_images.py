import os
import re
import urllib.request
from duckduckgo_search import DDGS
from rembg import remove
from PIL import Image
import io
import time

def sanitize_filename(name):
    return re.sub(r'[^a-zA-Z0-9]', '_', name).lower()

def download_image_for_item(name, item_id):
    query = f"{name} coffee cafe food isolated transparent"
    print(f"Searching for: {query}")
    try:
        results = DDGS().images(query, max_results=3)
        if not results:
            print(f"  No results for {name}")
            return None
        
        for res in results:
            url = res['image']
            try:
                req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(req, timeout=5) as response:
                    data = response.read()
                
                # Resize image before rembg to prevent OOM
                img = Image.open(io.BytesIO(data))
                img.thumbnail((400, 400))
                img = img.convert('RGB')
                buffer = io.BytesIO()
                img.save(buffer, format="JPEG")
                resized_data = buffer.getvalue()
                
                print(f"  Downloaded from {url}, removing background...")
                output_data = remove(
                    resized_data,
                    alpha_matting=True,
                    alpha_matting_foreground_threshold=240,
                    alpha_matting_background_threshold=10,
                    alpha_matting_erode_size=5
                )
                
                filename = f"public/images/{sanitize_filename(name)}_{item_id}.png"
                with open(filename, 'wb') as f:
                    f.write(output_data)
                
                print(f"  Saved to {filename}")
                return f"/images/{sanitize_filename(name)}_{item_id}.png"
            except Exception as e:
                print(f"  Failed for url {url}: {e}")
                continue
    except Exception as e:
        print(f"  Search failed: {e}")
    return None

def main():
    menu_path = 'src/data/menu.js'
    with open(menu_path, 'r', encoding='utf-8') as f:
        content = f.read()

    items = re.findall(r"id:\s*'([^']+)',\s*name:\s*'([^']+)'(.*?)(img:\s*'[^']+')", content, re.DOTALL)
    
    img_map = {}
    for item_id, name, middle, img_line in items:
        img_match = re.search(r"img:\s*'([^']+)'", img_line)
        if img_match:
            img = img_match.group(1)
            if img not in img_map:
                img_map[img] = []
            img_map[img].append((item_id, name, img_line))

    new_content = content
    
    for img, item_list in img_map.items():
        if len(item_list) > 1:
            print(f"Duplicate image: {img} used by {len(item_list)} items.")
            for i in range(1, len(item_list)):
                item_id, name, img_line = item_list[i]
                
                # Check if we already created it
                expected_path = f"/images/{sanitize_filename(name)}_{item_id}.png"
                if os.path.exists(f"public{expected_path}"):
                    new_img_path = expected_path
                else:
                    new_img_path = download_image_for_item(name, item_id)
                    time.sleep(1)
                
                if new_img_path:
                    new_img_line = f"img: '{new_img_path}'"
                    pattern = rf"(id:\s*'{item_id}',\s*name:\s*'{re.escape(name)}'.*?)({re.escape(img_line)})"
                    new_content = re.sub(pattern, r"\1" + new_img_line, new_content, count=1, flags=re.DOTALL)

    with open(menu_path, 'w', encoding='utf-8') as f:
        f.write(new_content)
    
    print("Done generating new images and updating menu.js")

if __name__ == "__main__":
    main()

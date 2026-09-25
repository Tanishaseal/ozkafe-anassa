import os
import re
from rembg import remove
from PIL import Image
import io

def clean_backgrounds():
    menu_path = 'src/data/menu.js'
    
    with open(menu_path, 'r', encoding='utf-8') as f:
        menu_content = f.read()

    # Find all image paths
    image_paths = re.findall(r"['\"]/images/([^'\"]+\.(?:png|jpg|jpeg))['\"]", menu_content)
    unique_images = list(set(image_paths))

    print(f"Found {len(unique_images)} unique images in menu.js.")

    for img_name in unique_images:
        input_path = os.path.join('public/images', img_name)
        if not os.path.exists(input_path):
            print(f"Skipping {img_name}: File not found.")
            continue
            
        print(f"Processing {img_name}...")
        
        try:
            with open(input_path, 'rb') as i:
                input_data = i.read()
            
            output_data = remove(
                input_data, 
                alpha_matting=True, 
                alpha_matting_foreground_threshold=240, 
                alpha_matting_background_threshold=10, 
                alpha_matting_erode_size=10
            )
            
            base_name, ext = os.path.splitext(img_name)
            new_img_name = f"{base_name}.png"
            output_path = os.path.join('public/images', new_img_name)
            
            with open(output_path, 'wb') as o:
                o.write(output_data)
                
            print(f"Successfully processed {img_name} -> {new_img_name}")
            
            # If the original was not a png, delete the original and update menu.js
            if ext.lower() in ['.jpg', '.jpeg']:
                try:
                    os.remove(input_path)
                except Exception as e:
                    print(f"Warning: Could not delete {input_path} - {e}")
                    
                # Update menu.js
                menu_content = menu_content.replace(f"'/images/{img_name}'", f"'/images/{new_img_name}'")
                menu_content = menu_content.replace(f"\"/images/{img_name}\"", f"\"/images/{new_img_name}\"")
                
        except Exception as e:
            print(f"Error processing {img_name}: {e}")

    # Write back the updated menu.js
    with open(menu_path, 'w', encoding='utf-8') as f:
        f.write(menu_content)
        
    print("Background removal complete. menu.js updated.")

if __name__ == "__main__":
    clean_backgrounds()

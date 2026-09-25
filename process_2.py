import os
from rembg import remove
from PIL import Image

def process():
    for name in ["new_chicken.png", "new_nachos.png"]:
        in_path = os.path.join("public/images", name)
        out_path = os.path.join("public/images", "bg_" + name)
        print(f"Processing {name}...")
        try:
            with open(in_path, 'rb') as i:
                data = i.read()
            out = remove(data, alpha_matting=True, alpha_matting_foreground_threshold=240, alpha_matting_background_threshold=10, alpha_matting_erode_size=10)
            with open(out_path, 'wb') as o:
                o.write(out)
            os.rename(out_path, in_path)
            print("Done")
        except Exception as e:
            print(f"Error: {e}")

process()

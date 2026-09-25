import os
from rembg import remove
from PIL import Image

def process_images():
    img_dir = "public/images"
    for filename in os.listdir(img_dir):
        if filename.endswith(".png"):
            input_path = os.path.join(img_dir, filename)
            try:
                print(f"Processing {filename}...")
                with open(input_path, 'rb') as i:
                    input_data = i.read()
                
                # alpha_matting=True is great for soft edges like food/smoke
                output_data = remove(input_data, alpha_matting=True, alpha_matting_foreground_threshold=240, alpha_matting_background_threshold=10, alpha_matting_erode_size=10)
                
                with open(input_path, 'wb') as o:
                    o.write(output_data)
                print(f"Successfully processed {filename}")
            except Exception as e:
                print(f"Error processing {filename}: {e}")

if __name__ == "__main__":
    process_images()

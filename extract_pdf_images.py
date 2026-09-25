import fitz
import os

pdf_path = "anassa menu.pdf"
output_dir = "pdf_images"
os.makedirs(output_dir, exist_ok=True)

doc = fitz.open(pdf_path)
image_count = 0

for page_index in range(len(doc)):
    page = doc[page_index]
    image_list = page.get_images(full=True)
    
    if image_list:
        print(f"[+] Found {len(image_list)} images on page {page_index}")
    else:
        print(f"[!] No images found on page {page_index}")
        
    for image_index, img in enumerate(image_list, start=1):
        xref = img[0]
        base_image = doc.extract_image(xref)
        image_bytes = base_image["image"]
        image_ext = base_image["ext"]
        image_name = f"page{page_index}_img{image_index}.{image_ext}"
        
        with open(os.path.join(output_dir, image_name), "wb") as f:
            f.write(image_bytes)
        print(f"  - Saved {image_name}")
        image_count += 1

print(f"Extracted {image_count} images.")

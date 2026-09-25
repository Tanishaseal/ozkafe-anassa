import fitz
import os

pdf_path = "anassa menu.pdf"
doc = fitz.open(pdf_path)

for page_index in range(len(doc)):
    page = doc[page_index]
    
    # Get image info
    images = page.get_images(full=True)
    if not images:
        continue
        
    print(f"\n--- PAGE {page_index} ---")
    
    # Get all text blocks
    text_blocks = page.get_text("blocks")
    
    # Get image rects. get_image_rects is not always reliable but let's try
    for img_index, img in enumerate(images, start=1):
        xref = img[0]
        try:
            rects = page.get_image_rects(xref)
            if not rects:
                continue
            rect = rects[0] # taking first occurrence
            
            # Find the closest text block below the image
            closest_text = None
            min_dist = 9999
            
            for block in text_blocks:
                # block: (x0, y0, x1, y1, "text", block_no, block_type)
                # block_type 0 is text
                if block[6] == 0:
                    text_rect = fitz.Rect(block[:4])
                    # distance in y
                    dy = text_rect.y0 - rect.y1
                    if 0 < dy < min_dist:
                        # Also check if they align horizontally
                        if min(text_rect.x1, rect.x1) - max(text_rect.x0, rect.x0) > -50:
                            min_dist = dy
                            closest_text = block[4].strip()
            
            print(f"Image {img_index} at {rect}: Closest text below = {repr(closest_text)}")
        except Exception as e:
            print(f"Error for image {img_index}: {e}")

import sys
import os

try:
    from PIL import Image, ImageChops
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "Pillow"])
    from PIL import Image, ImageChops

def crop_logo(input_path, output_icon_path, output_splash_path):
    print(f"Opening {input_path}...")
    img = Image.open(input_path).convert("RGBA")
    
    # Create a white background image to handle transparency if needed
    bg = Image.new("RGBA", img.size, (255, 255, 255, 255))
    bg.paste(img, (0, 0), img)
    
    # Convert to grayscale to find bounding box of non-white pixels
    gray = bg.convert("L")
    inv = ImageChops.invert(gray)
    bbox = inv.getbbox()
    
    if not bbox:
        print("Image is entirely white?")
        return

    # bbox is (left, upper, right, lower)
    # We want to separate the top logo from the bottom text.
    # Let's scan horizontally to find a gap of white space.
    width, height = bg.size
    
    # Let's find horizontal lines that are completely white
    pixels = gray.load()
    
    row_is_content = []
    for y in range(bbox[1], bbox[3]):
        has_dark = False
        for x in range(bbox[0], bbox[2]):
            if pixels[x, y] < 240: # Not pure white
                has_dark = True
                break
        row_is_content.append(has_dark)
        
    # Find the largest gap of non-content (False) in row_is_content
    # The gap separates the logo and the text.
    max_gap_start = 0
    max_gap_length = 0
    
    current_gap_start = 0
    current_gap_length = 0
    
    in_gap = False
    
    for i, is_content in enumerate(row_is_content):
        if not is_content:
            if not in_gap:
                in_gap = True
                current_gap_start = i
                current_gap_length = 1
            else:
                current_gap_length += 1
        else:
            if in_gap:
                in_gap = False
                if current_gap_length > max_gap_length and i > len(row_is_content) * 0.3: 
                    # gap should be below the top part
                    max_gap_length = current_gap_length
                    max_gap_start = current_gap_start
                    
    print(f"Content bbox: {bbox}")
    
    # If a gap is found, crop above the gap. Otherwise, just guess top 65% of the bounding box.
    if max_gap_length > 5:
        bottom_crop = bbox[1] + max_gap_start
        print(f"Found gap of {max_gap_length} pixels. Cropping at Y={bottom_crop}")
    else:
        # Fallback to cropping the top 70% of the content
        bottom_crop = bbox[1] + int((bbox[3] - bbox[1]) * 0.7)
        print(f"No gap found. Fallback cropping at Y={bottom_crop}")

    # Crop the original image (with transparency) to the top logo part
    # We find the new bounding box of the top part to center it.
    top_box = (bbox[0], bbox[1], bbox[2], bottom_crop)
    logo_only = img.crop(top_box)
    
    # Now, let's create a 1024x1024 icon
    icon_size = 1024
    icon_img = Image.new("RGBA", (icon_size, icon_size), (255, 255, 255, 0)) # transparent
    
    # Calculate scaling factor to fit within 1024x1024 with some padding
    # Let's say padding is 100 pixels on each side -> max width/height = 824
    max_dim = icon_size - 200
    w, h = logo_only.size
    scale = min(max_dim / w, max_dim / h)
    
    new_w = int(w * scale)
    new_h = int(h * scale)
    
    logo_resized = logo_only.resize((new_w, new_h), Image.Resampling.LANCZOS)
    
    # Center the logo in the 1024x1024 image
    offset_x = (icon_size - new_w) // 2
    offset_y = (icon_size - new_h) // 2
    
    icon_img.paste(logo_resized, (offset_x, offset_y))
    icon_img.save(output_icon_path)
    print(f"Saved {output_icon_path}")
    
    # Save a copy as splash icon (can be same as icon, or resized)
    # Splash screens usually have a solid background, we can just use the icon with transparency
    # Expo splash screen handles resizing, we can just supply the transparent logo
    icon_img.save(output_splash_path)
    print(f"Saved {output_splash_path}")

if __name__ == "__main__":
    base_dir = "/Volumes/QUADEM/Personal/VIBE CODING/ERP/scanner-app/assets/images"
    input_file = os.path.join(base_dir, "raw-logo.png")
    
    if not os.path.exists(input_file):
        print(f"Error: {input_file} not found!")
        sys.exit(1)
        
    icon_file = os.path.join(base_dir, "icon.png")
    splash_file = os.path.join(base_dir, "splash-icon.png")
    android_fg_file = os.path.join(base_dir, "android-icon-foreground.png")
    
    crop_logo(input_file, icon_file, splash_file)
    crop_logo(input_file, android_fg_file, android_fg_file) # Just overwrite android fg with the same

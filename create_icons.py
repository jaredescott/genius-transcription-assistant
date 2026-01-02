#!/usr/bin/env python3
"""
Simple script to create icon files for the extension
Requires PIL/Pillow: pip install Pillow
"""

try:
    from PIL import Image, ImageDraw, ImageFont
    import os

    def create_icon(size, filename):
        # Create image with gradient background
        img = Image.new('RGB', (size, size), color=(102, 126, 234))
        draw = ImageDraw.Draw(img)
        
        # Draw a simple "G" letter
        try:
            # Try to use a system font
            font_size = int(size * 0.6)
            font = ImageFont.truetype("arial.ttf", font_size)
        except:
            try:
                font = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", font_size)
            except:
                # Fallback to default font
                font = ImageFont.load_default()
        
        # Calculate text position (centered)
        text = "G"
        bbox = draw.textbbox((0, 0), text, font=font)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]
        position = ((size - text_width) // 2, (size - text_height) // 2 - bbox[1])
        
        # Draw white "G"
        draw.text(position, text, fill=(255, 255, 255), font=font)
        
        # Save
        img.save(filename)
        print(f"Created {filename} ({size}x{size})")

    # Create icons
    create_icon(16, "icon16.png")
    create_icon(48, "icon48.png")
    create_icon(128, "icon128.png")
    
    print("\nAll icons created successfully!")
    
except ImportError:
    print("Pillow not installed. Installing...")
    import subprocess
    import sys
    subprocess.check_call([sys.executable, "-m", "pip", "install", "Pillow"])
    print("Please run this script again.")
except Exception as e:
    print(f"Error: {e}")
    print("\nCreating simple placeholder icons instead...")
    
    # Fallback: create simple colored squares
    from PIL import Image
    for size, filename in [(16, "icon16.png"), (48, "icon48.png"), (128, "icon128.png")]:
        img = Image.new('RGB', (size, size), color=(102, 126, 234))
        img.save(filename)
        print(f"Created placeholder {filename}")

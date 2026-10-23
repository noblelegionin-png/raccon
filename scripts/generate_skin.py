"""
Script to generate high-tech Cyberpunk N3R0 AI Companion Skin (64x64 PNG)
Follows Minecraft Bedrock 1.8+ dual-layer humanoid skin format.
"""
import sys
from PIL import Image, ImageDraw

def hex_to_rgb(hex_str, alpha=255):
    hex_str = hex_str.lstrip('#')
    return (int(hex_str[0:2], 16), int(hex_str[2:4], 16), int(hex_str[4:6], 16), alpha)

def create_nero_skin(output_path):
    img = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Palette
    C_CARBON_BASE = hex_to_rgb('#15181f')
    C_CARBON_DARK = hex_to_rgb('#0d0f14')
    C_CARBON_MID  = hex_to_rgb('#20242e')
    C_CYBER_WHITE = hex_to_rgb('#e2e8f0')
    C_CYBER_SILVER= hex_to_rgb('#94a3b8')
    C_NEON_GREEN  = hex_to_rgb('#00ff88')
    C_NEON_MINT   = hex_to_rgb('#10b981')
    C_NEON_CYAN   = hex_to_rgb('#06b6d4')
    C_GLOW_CORE   = hex_to_rgb('#6ee7b7')
    C_SKIN_SHADOW = hex_to_rgb('#2d3748')

    # Helper: fill rectangle
    def fill_rect(x1, y1, x2, y2, color):
        for y in range(y1, y2 + 1):
            for x in range(x1, x2 + 1):
                img.putpixel((x, y), color)

    # 1. HEAD (Base Layer)
    # Head Front: (8, 8) to (15, 15)
    fill_rect(8, 8, 15, 15, C_CARBON_BASE)
    # Hair / Helmet trim on face
    fill_rect(8, 8, 15, 9, C_CARBON_DARK)
    fill_rect(8, 8, 8, 11, C_CARBON_DARK)
    fill_rect(15, 8, 15, 11, C_CARBON_DARK)
    # Sleek cyber faceplate
    fill_rect(9, 10, 14, 14, C_CARBON_MID)
    # Glowing Neon Visor / Cybernetic Eyes (y=11, 12)
    fill_rect(9, 11, 11, 12, C_NEON_GREEN)
    fill_rect(12, 11, 14, 12, C_NEON_GREEN)
    img.putpixel((10, 11), C_GLOW_CORE)
    img.putpixel((13, 11), C_GLOW_CORE)
    # Sub-eye cybernetic line
    img.putpixel((9, 13), C_NEON_CYAN)
    img.putpixel((14, 13), C_NEON_CYAN)

    # Head Right: (0, 8) to (7, 15)
    fill_rect(0, 8, 7, 15, C_CARBON_BASE)
    fill_rect(2, 9, 5, 12, C_CARBON_MID)
    fill_rect(3, 10, 4, 11, C_NEON_GREEN) # Cybernetic ear/headset unit

    # Head Left: (16, 8) to (23, 15)
    fill_rect(16, 8, 23, 15, C_CARBON_BASE)
    fill_rect(18, 9, 21, 12, C_CARBON_MID)
    fill_rect(19, 10, 20, 11, C_NEON_GREEN) # Cybernetic ear unit

    # Head Back: (24, 8) to (31, 15)
    fill_rect(24, 8, 31, 15, C_CARBON_BASE)
    # Central cyber-spine glow strip down back of helmet
    for y in range(8, 16):
        img.putpixel((27, y), C_CARBON_DARK)
        img.putpixel((28, y), C_NEON_GREEN if y % 2 == 0 else C_NEON_CYAN)

    # Head Top: (8, 0) to (15, 7)
    fill_rect(8, 0, 15, 7, C_CARBON_DARK)
    fill_rect(10, 2, 13, 5, C_CARBON_MID)
    img.putpixel((11, 3), C_NEON_GREEN)
    img.putpixel((12, 3), C_NEON_GREEN)

    # Head Bottom: (16, 0) to (23, 7)
    fill_rect(16, 0, 23, 7, C_CARBON_DARK)

    # 2. HEAD OUTER LAYER (Visor HUD & Cybernetic Hair highlights)
    # Front Hat: (40, 8) to (47, 15)
    fill_rect(41, 11, 46, 12, hex_to_rgb('#00ff88', 210)) # Holographic HUD shield
    img.putpixel((40, 8), C_CYBER_WHITE)
    img.putpixel((47, 8), C_CYBER_WHITE)
    # Side antennas/wings
    img.putpixel((32, 9), C_NEON_GREEN)
    img.putpixel((48, 9), C_NEON_GREEN)

    # 3. TORSO (Base Layer)
    # Torso Front: (20, 20) to (27, 31)
    fill_rect(20, 20, 27, 31, C_CARBON_BASE)
    # White Titanium Cybernetic Chest Armor
    fill_rect(21, 20, 26, 23, C_CYBER_WHITE)
    fill_rect(22, 21, 25, 23, C_CYBER_SILVER)
    # Neon Energy Arc Reactor (Heart)
    fill_rect(23, 22, 24, 23, C_NEON_GREEN)
    img.putpixel((23, 22), C_GLOW_CORE)
    # Abdominal armor plates
    fill_rect(21, 25, 26, 26, C_CARBON_MID)
    fill_rect(22, 28, 25, 29, C_CARBON_MID)
    # Neon circuitry channels
    for y in range(24, 30):
        img.putpixel((20, y), C_NEON_MINT if y % 2 == 0 else C_CARBON_BASE)
        img.putpixel((27, y), C_NEON_MINT if y % 2 == 0 else C_CARBON_BASE)

    # Torso Back: (32, 20) to (39, 31)
    fill_rect(32, 20, 39, 31, C_CARBON_BASE)
    # Cybernetic Spine & Nero Emblem
    fill_rect(33, 21, 38, 23, C_CARBON_MID)
    for y in range(20, 32):
        img.putpixel((35, y), C_CARBON_DARK)
        img.putpixel((36, y), C_NEON_GREEN if y % 3 != 0 else C_NEON_CYAN)

    # Torso Right: (16, 20) to (19, 31)
    fill_rect(16, 20, 19, 31, C_CARBON_DARK)
    fill_rect(17, 22, 18, 28, C_CARBON_BASE)
    img.putpixel((17, 24), C_NEON_GREEN)

    # Torso Left: (28, 20) to (31, 31)
    fill_rect(28, 20, 31, 31, C_CARBON_DARK)
    fill_rect(29, 22, 30, 28, C_CARBON_BASE)
    img.putpixel((30, 24), C_NEON_GREEN)

    # Torso Top: (20, 16) to (27, 19)
    fill_rect(20, 16, 27, 19, C_CARBON_DARK)
    fill_rect(21, 17, 26, 18, C_CYBER_WHITE)

    # Torso Bottom: (28, 16) to (35, 19)
    fill_rect(28, 16, 35, 19, C_CARBON_DARK)

    # 4. TORSO OUTER LAYER (Jackets / Pauldrons / Armor Overlay)
    # Front: (20, 36) to (27, 47)
    fill_rect(21, 36, 26, 38, hex_to_rgb('#00ff88', 120)) # subtle glow over chestplate

    # 5. RIGHT ARM (Base & Overlay)
    # Front: (44, 20) to (47, 31)
    fill_rect(44, 20, 47, 31, C_CARBON_BASE)
    # Shoulder guard
    fill_rect(44, 20, 47, 22, C_CYBER_WHITE)
    # Neon circuit band
    fill_rect(44, 25, 47, 25, C_NEON_GREEN)
    # Cybernetic glove
    fill_rect(44, 29, 47, 31, C_CARBON_DARK)
    img.putpixel((45, 30), C_NEON_CYAN)
    # Right Arm Top: (44, 16) to (47, 19)
    fill_rect(44, 16, 47, 19, C_CYBER_WHITE)
    # Right Arm Back: (52, 20) to (55, 31)
    fill_rect(52, 20, 55, 31, C_CARBON_BASE)
    fill_rect(52, 20, 55, 22, C_CYBER_WHITE)
    # Right Arm Sides: (40..43) & (48..51)
    fill_rect(40, 20, 43, 31, C_CARBON_MID)
    fill_rect(48, 20, 51, 31, C_CARBON_MID)

    # 6. LEFT ARM (Base & Overlay)
    # Front: (36, 52) to (39, 63)
    fill_rect(36, 52, 39, 63, C_CARBON_BASE)
    fill_rect(36, 52, 39, 54, C_CYBER_WHITE)
    fill_rect(36, 57, 39, 57, C_NEON_GREEN)
    fill_rect(36, 61, 39, 63, C_CARBON_DARK)
    img.putpixel((38, 62), C_NEON_CYAN)
    # Left Arm Top: (36, 48) to (39, 51)
    fill_rect(36, 48, 39, 51, C_CYBER_WHITE)
    # Left Arm Sides & Back
    fill_rect(32, 52, 35, 63, C_CARBON_MID)
    fill_rect(40, 52, 43, 63, C_CARBON_BASE)
    fill_rect(44, 52, 47, 63, C_CARBON_DARK)

    # 7. RIGHT LEG (Base & Overlay)
    # Front: (4, 20) to (7, 31)
    fill_rect(4, 20, 7, 31, C_CARBON_BASE)
    fill_rect(4, 23, 7, 25, C_CARBON_MID)
    # Knee energy light
    fill_rect(5, 25, 6, 25, C_NEON_GREEN)
    # High-tech cyber boots
    fill_rect(4, 29, 7, 31, C_CYBER_WHITE)
    fill_rect(4, 30, 7, 31, C_CARBON_DARK)
    # Sides & Back: (0..3) & (8..15)
    fill_rect(0, 20, 3, 31, C_CARBON_MID)
    fill_rect(8, 20, 11, 31, C_CARBON_DARK)
    fill_rect(12, 20, 15, 31, C_CARBON_BASE)

    # 8. LEFT LEG (Base & Overlay)
    # Front: (20, 52) to (23, 63)
    fill_rect(20, 52, 23, 63, C_CARBON_BASE)
    fill_rect(20, 55, 23, 57, C_CARBON_MID)
    fill_rect(21, 57, 22, 57, C_NEON_GREEN)
    fill_rect(20, 61, 23, 63, C_CYBER_WHITE)
    fill_rect(20, 62, 23, 63, C_CARBON_DARK)
    # Sides & Back: (16..19) & (24..31)
    fill_rect(16, 52, 19, 63, C_CARBON_MID)
    fill_rect(24, 52, 27, 63, C_CARBON_DARK)
    fill_rect(28, 52, 31, 63, C_CARBON_BASE)

    img.save(output_path, 'PNG')
    print(f"Generated Cyberpunk N3R0 skin saved to {output_path}")

if __name__ == '__main__':
    target = sys.argv[1] if len(sys.argv) > 1 else 'd:/nero-labs-telegram-bot/packs/nero_resource_pack/textures/entity/n3r0.png'
    create_nero_skin(target)

from PIL import Image
from pathlib import Path

root = Path(__file__).resolve().parent.parent / "public" / "brand"
source = Path(__file__).resolve().parent / "assets" / "shipamaze-logo-source.png"
original = Image.open(source).convert("RGBA")

# Location #1 — sidebar card logo (original background preserved)
original.save(root / "logo-card.png", optimize=True)
original.save(root / "shipamaze-logo-with-bg.png", optimize=True)

# Transparent purple logo for light-mode headers
src = original.copy()
pixels = list(src.getdata())
transparent = []
for r, g, b, a in pixels:
    if r > 210 and g > 205 and b > 195:
        transparent.append((r, g, b, 0))
    elif r > 235 and g > 235 and b > 235:
        transparent.append((r, g, b, 0))
    else:
        transparent.append((r, g, b, 255))
src.putdata(transparent)
src.save(root / "logo-light.png", optimize=True)
src.save(root / "shipamaze-logo.png", optimize=True)

# White logo for dark-mode headers (transparent background)
dark_pixels = []
for r, g, b, a in transparent:
    if a > 0:
        dark_pixels.append((255, 255, 255, a))
    else:
        dark_pixels.append((0, 0, 0, 0))
logo_dark = Image.new("RGBA", src.size)
logo_dark.putdata(dark_pixels)
logo_dark.save(root / "logo-dark.png", optimize=True)

icon_base = src.copy()
icon_base.thumbnail((512, 512), Image.Resampling.LANCZOS)
for size, name in [
    (32, "favicon-32.png"),
    (180, "apple-touch-icon.png"),
    (192, "icon-192.png"),
    (512, "icon-512.png"),
]:
    im = icon_base.copy()
    im.thumbnail((size, size), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    x = (size - im.width) // 2
    y = (size - im.height) // 2
    canvas.paste(im, (x, y), im)
    canvas.save(root / name, optimize=True)

og = Image.new("RGBA", (1200, 630), (248, 246, 242, 255))
logo_og = Image.open(root / "logo-light.png").convert("RGBA")
logo_og.thumbnail((900, 380), Image.Resampling.LANCZOS)
x = (1200 - logo_og.width) // 2
y = (630 - logo_og.height) // 2
og.paste(logo_og, (x, y), logo_og)
og.convert("RGB").save(root / "og-image.png", optimize=True, quality=92)

print("Generated:", [p.name for p in sorted(root.glob("*"))])

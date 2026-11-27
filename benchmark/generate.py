"""Regenerate the synthetic JPEG scenes (requires Pillow)."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).parent / "frames"
COLORS = {"blue": "#245585", "red": "#aa3543", "green": "#3e7548"}
BACKGROUNDS = ["#dbc7a7", "#cfb797", "#e4cfaf"]
SCENES = [
    [["green square 4", "red circle 8"], ["red triangle 2"], ["blue triangle 7", "green circle 2"]],
    [["blue circle 2", "green square 5"], ["blue square 3"], ["red square 8", "blue triangle 9"]],
    [["green square 4"], ["red circle 7", "blue triangle 3"], ["green triangle 3", "blue circle 8"]],
    [["blue square 5", "green triangle 2"], ["red circle 8", "green circle 4"], ["red square 3"]],
    [["blue triangle 5", "red square 7"], ["blue square 4", "green triangle 3"], ["red circle 9"]],
    [["green circle 9", "blue square 3"], ["red square 4"], ["green square 6", "green triangle 2"]],
]


def tile(draw, x, y, description, *, covered=False):
    color, shape, digit = description.split()
    box = (x - 66, y - 66, x + 66, y + 66)
    if shape == "circle":
        draw.ellipse(box, fill=COLORS[color], outline="#f7ede2", width=4)
    elif shape == "square":
        draw.rounded_rectangle(box, radius=12, fill=COLORS[color], outline="#f7ede2", width=4)
    else:
        draw.polygon([(x, y - 82), (x + 84, y + 62), (x - 84, y + 62)],
                     fill=COLORS[color], outline="#f7ede2", width=4)
    if covered:
        draw.rounded_rectangle((x - 50, y - 43, x + 74, y + 53), radius=9, fill="#c18b61",
                               outline="#775939", width=5)
        return
    draw.text((x, y + (22 if shape == "triangle" else 0)), digit, fill="white",
              font=ImageFont.load_default(size=49), anchor="mm", stroke_width=1)


def main():
    for number, scene in enumerate(SCENES, 1):
        folder = ROOT / f"desk-{number:02d}"
        folder.mkdir(parents=True, exist_ok=True)
        for index, (view, objects) in enumerate(zip(("center", "left", "right"), scene)):
            image = Image.new("RGB", (570, 360), BACKGROUNDS[index])
            draw = ImageDraw.Draw(image)
            for y in range(12 + 8 * index, 360, 31):
                draw.line((0, y, 570, y + 15 * (index - 1)), fill="#baa482", width=1)
            for i, description in enumerate(objects):
                tile(draw, 161 + i * 237, 122 + i * 94, description)
            if view == "center" and number in (1, 4):
                tile(draw, 402, 104, "blue triangle 7" if number == 1 else "red circle 8", covered=True)
            image.save(folder / f"{view}.jpg", quality=88, optimize=True)


if __name__ == "__main__":
    main()

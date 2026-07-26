"""Create a compact, palette-limited pixel-pet image from an atlas frame."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--size", type=int, default=128)
    parser.add_argument("--padding", type=int, default=4)
    parser.add_argument("--colors", type=int, default=32)
    return parser.parse_args()


def prepare_base(
    source: Path,
    output: Path,
    *,
    size: int,
    padding: int,
    colors: int,
) -> dict[str, object]:
    if size <= 0 or padding < 0 or padding * 2 >= size:
        raise ValueError("size and padding do not leave a usable canvas")
    if not 1 <= colors <= 256:
        raise ValueError("colors must be between 1 and 256")

    with Image.open(source) as opened:
        image = opened.convert("RGBA")

    alpha = image.getchannel("A").point(lambda value: 255 if value >= 128 else 0)
    image.putalpha(alpha)
    bbox = alpha.getbbox()
    if bbox is None:
        raise ValueError("source contains no visible pixels")

    cropped = image.crop(bbox)
    available = size - 2 * padding
    scale = min(available / cropped.width, available / cropped.height)
    resized_size = (
        max(1, round(cropped.width * scale)),
        max(1, round(cropped.height * scale)),
    )
    resized = cropped.resize(resized_size, Image.Resampling.NEAREST)

    quantized_rgb = resized.convert("RGB").quantize(
        colors=colors,
        method=Image.Quantize.MEDIANCUT,
        dither=Image.Dither.NONE,
    ).convert("RGB")
    resized_alpha = resized.getchannel("A").point(
        lambda value: 255 if value >= 128 else 0,
    )
    quantized = quantized_rgb.convert("RGBA")
    quantized.putalpha(resized_alpha)

    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    left = (size - resized.width) // 2
    top = size - padding - resized.height
    canvas.alpha_composite(quantized, (left, top))

    pixels = list(canvas.get_flattened_data())
    normalized = [
        (red, green, blue, alpha_value) if alpha_value else (0, 0, 0, 0)
        for red, green, blue, alpha_value in pixels
    ]
    canvas.putdata(normalized)

    output.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output, format="PNG", optimize=True)

    visible_colors = {
        (red, green, blue)
        for red, green, blue, alpha_value in normalized
        if alpha_value == 255
    }
    alpha_values = sorted({alpha_value for *_, alpha_value in normalized})
    return {
        "source": str(source),
        "output": str(output),
        "dimensions": [size, size],
        "visible_colors": len(visible_colors),
        "alpha_values": alpha_values,
        "visible_bbox": list(canvas.getchannel("A").getbbox() or ()),
    }


def main() -> None:
    args = parse_args()
    result = prepare_base(
        args.source,
        args.output,
        size=args.size,
        padding=args.padding,
        colors=args.colors,
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

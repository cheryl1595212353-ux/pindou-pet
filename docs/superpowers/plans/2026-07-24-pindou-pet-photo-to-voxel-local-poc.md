# Local Photo-to-Voxel Cat POC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and run one reproducible local command that turns the existing `cat-01/front.png` into a transparent 58×58 pixel-art PNG and three GazPrash Single-mode OBJ depth variants.

**Architecture:** Focused Python modules own image contracts, rembg/photo2pixel inference, artifact manifests, OBJ validation, and preview rendering. A thin Go CLI calls the unmodified GazPrash backend from its ignored third-party checkout; all models, third-party source, environments, and experiment artifacts stay below ignored `var/photo-to-voxel-poc/`.

**Tech Stack:** Python 3.12, Pillow, NumPy, ONNX Runtime CPU, rembg, Go 1.23, GazPrash backend, pytest.

## Global Constraints

- Input is exactly `apps/web/public/demo-cats/cat-01/front.png`.
- Do not modify React, Three.js, FastAPI, or existing three-view voxel code.
- Keep third-party source, model caches, environments, PNGs, OBJs, and reports under ignored `var/photo-to-voxel-poc/`.
- Final 2D asset is exactly 58×58 RGBA with binary alpha and at most 24 opaque RGB colors.
- The 464×464 preview is an exact 8× nearest-neighbor enlargement.
- Use rembg model `birefnet-general-lite` on `CPUExecutionProvider`.
- Use photo2pixel ONNX settings `kernel_size=10`, `pixel_size=16`, `edge_thresh=100`.
- Use GazPrash Single rounded mode at depth scales `0.25`, `0.40`, and `0.65`; use `voxelScale=1.0`.
- Seed GazPrash's package-level random source with `1` so the OBJ is reproducible.
- Preserve every pre-existing dirty or untracked file; stage only files named by each task.

---

### Task 1: Deterministic 58×58 image contract

**Files:**
- Create: `scripts/photo_to_voxel_poc/__init__.py`
- Create: `scripts/photo_to_voxel_poc/image_contract.py`
- Test: `tests/unit/tools/test_photo_to_voxel_image_contract.py`

**Interfaces:**
- Consumes: rembg RGBA output and photo2pixel RGB output as `PIL.Image.Image`.
- Produces: `clean_foreground`, `build_pixel_asset`, `build_preview`, `validate_pixel_asset`, and `sha256_file`.

- [ ] **Step 1: Write failing image-contract tests**

```python
from pathlib import Path

from PIL import Image

from scripts.photo_to_voxel_poc.image_contract import (
    build_pixel_asset,
    build_preview,
    validate_pixel_asset,
)


def subject_rgba() -> Image.Image:
    image = Image.new("RGBA", (8, 12), (0, 0, 0, 0))
    for y in range(2, 12):
        for x in range(2, 6):
            image.putpixel((x, y), (120 + x, 70 + y, 40, 255))
    image.putpixel((7, 0), (255, 0, 0, 255))
    return image


def test_build_pixel_asset_is_exact_binary_and_connected(tmp_path: Path) -> None:
    foreground = subject_rgba()
    pixel_rgb = Image.new("RGB", foreground.size, (180, 120, 80))
    result = build_pixel_asset(foreground, pixel_rgb)
    result.save(tmp_path / "pixel.png")
    stats = validate_pixel_asset(result)

    assert result.mode == "RGBA"
    assert result.size == (58, 58)
    assert stats["alpha_values"] == [0, 255]
    assert stats["opaque_colors"] <= 24
    assert stats["largest_component_ratio"] >= 0.98
    assert result.getbbox()[3] == 56


def test_preview_repeats_every_source_pixel_as_an_8_by_8_block() -> None:
    asset = build_pixel_asset(
        subject_rgba(),
        Image.new("RGB", (8, 12), (180, 120, 80)),
    )
    preview = build_preview(asset)

    assert preview.size == (464, 464)
    assert preview.crop((80, 80, 88, 88)).getcolors(maxcolors=64) is not None
    assert len(preview.crop((80, 80, 88, 88)).getcolors(maxcolors=64)) == 1
```

- [ ] **Step 2: Run the focused test and verify red state**

Run:

```bash
python -m pytest tests/unit/tools/test_photo_to_voxel_image_contract.py -q
```

Expected: collection fails with `ModuleNotFoundError` for `image_contract`.

- [ ] **Step 3: Implement the image contract**

`image_contract.py` must expose these exact functions:

```python
from __future__ import annotations

from collections import deque
from hashlib import sha256
from pathlib import Path

from PIL import Image


def sha256_file(path: Path) -> str:
    digest = sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _largest_component(alpha: Image.Image) -> Image.Image:
    width, height = alpha.size
    active = {index for index, value in enumerate(alpha.getdata()) if value >= 128}
    best: set[int] = set()
    while active:
        seed = active.pop()
        queue = deque([seed])
        current = {seed}
        while queue:
            index = queue.popleft()
            x, y = index % width, index // width
            for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                neighbor = ny * width + nx
                if 0 <= nx < width and 0 <= ny < height and neighbor in active:
                    active.remove(neighbor)
                    current.add(neighbor)
                    queue.append(neighbor)
        if len(current) > len(best):
            best = current
    return Image.new("L", (width, height), 0).point(
        lambda _: 0
    ) if not best else Image.frombytes(
        "L",
        (width, height),
        bytes(255 if index in best else 0 for index in range(width * height)),
    )


def clean_foreground(image: Image.Image) -> tuple[Image.Image, Image.Image]:
    rgba = image.convert("RGBA")
    mask = _largest_component(rgba.getchannel("A"))
    cleaned = rgba.copy()
    cleaned.putalpha(mask)
    return cleaned, mask


def _quantize_rgba(image: Image.Image, colors: int = 24) -> Image.Image:
    alpha = image.getchannel("A")
    white = Image.new("RGB", image.size, "white")
    white.paste(image.convert("RGB"), mask=alpha)
    quantized = white.quantize(
        colors=colors,
        method=Image.Quantize.MEDIANCUT,
        dither=Image.Dither.NONE,
    ).convert("RGB")
    quantized.putalpha(alpha)
    return quantized


def build_pixel_asset(
    foreground: Image.Image,
    pixel_rgb: Image.Image,
    *,
    canvas_size: int = 58,
    margin: int = 2,
) -> Image.Image:
    cleaned, mask = clean_foreground(foreground)
    del cleaned
    resized_mask = mask.resize(pixel_rgb.size, Image.Resampling.NEAREST)
    rgba = pixel_rgb.convert("RGBA")
    rgba.putalpha(resized_mask)
    bbox = rgba.getbbox()
    if bbox is None:
        raise ValueError("foreground mask is empty")
    crop = rgba.crop(bbox)
    available = canvas_size - 2 * margin
    scale = min(available / crop.width, available / crop.height)
    target = (
        max(1, round(crop.width * scale)),
        max(1, round(crop.height * scale)),
    )
    crop = crop.resize(target, Image.Resampling.NEAREST)
    crop = _quantize_rgba(crop)
    canvas = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    x = (canvas_size - crop.width) // 2
    y = canvas_size - margin - crop.height
    canvas.alpha_composite(crop, (x, y))
    return canvas


def build_preview(asset: Image.Image) -> Image.Image:
    return asset.resize((464, 464), Image.Resampling.NEAREST)


def validate_pixel_asset(asset: Image.Image) -> dict[str, object]:
    if asset.mode != "RGBA" or asset.size != (58, 58):
        raise ValueError("pixel asset must be 58x58 RGBA")
    alpha_values = sorted(set(asset.getchannel("A").getdata()))
    if alpha_values != [0, 255]:
        raise ValueError(f"alpha must be binary, got {alpha_values}")
    opaque = [pixel[:3] for pixel in asset.getdata() if pixel[3] == 255]
    if not opaque:
        raise ValueError("pixel asset has no opaque pixels")
    mask = asset.getchannel("A")
    largest = _largest_component(mask)
    ratio = sum(value == 255 for value in largest.getdata()) / len(opaque)
    stats = {
        "size": [58, 58],
        "mode": "RGBA",
        "alpha_values": alpha_values,
        "opaque_colors": len(set(opaque)),
        "opaque_pixels": len(opaque),
        "largest_component_ratio": ratio,
    }
    if stats["opaque_colors"] > 24 or ratio < 0.98:
        raise ValueError(f"pixel asset violates color/connectivity contract: {stats}")
    return stats
```

- [ ] **Step 4: Run focused and existing Python tests**

Run:

```bash
python -m pytest tests/unit/tools/test_photo_to_voxel_image_contract.py -q
python -m pytest tests/unit/tools -q
```

Expected: new tests pass; existing tool tests remain green.

- [ ] **Step 5: Commit Task 1**

```bash
git add scripts/photo_to_voxel_poc/__init__.py \
  scripts/photo_to_voxel_poc/image_contract.py \
  tests/unit/tools/test_photo_to_voxel_image_contract.py
git commit -m "feat: normalize photo pixel assets"
```

---

### Task 2: rembg and photo2pixel pipeline

**Files:**
- Create: `scripts/photo_to_voxel_poc/run_pipeline.py`
- Test: `tests/unit/tools/test_photo_to_voxel_pipeline.py`

**Interfaces:**
- Consumes: repo root, ignored workspace root, rembg model name, and photo2pixel ONNX path.
- Produces: `01-original-cat.png` through `06-pixel-preview-464.png` plus a deterministic manifest dictionary.

- [ ] **Step 1: Write failing runner tests around injected inference functions**

```python
from pathlib import Path

from PIL import Image

from scripts.photo_to_voxel_poc.run_pipeline import PipelineConfig, run_image_stages


def test_run_image_stages_writes_numbered_outputs(tmp_path: Path) -> None:
    source = tmp_path / "source.png"
    Image.new("RGB", (40, 60), (240, 240, 240)).save(source)

    def fake_remove(image: Image.Image) -> Image.Image:
        result = Image.new("RGBA", image.size, (0, 0, 0, 0))
        result.paste((130, 80, 50, 255), (10, 5, 30, 60))
        return result

    def fake_pixelize(image: Image.Image) -> Image.Image:
        return image.convert("RGB")

    manifest = run_image_stages(
        PipelineConfig(source=source, output_dir=tmp_path / "run"),
        remove_background=fake_remove,
        pixelize=fake_pixelize,
    )

    assert manifest["pixel_asset"]["size"] == [58, 58]
    assert (tmp_path / "run/05-pixel-58.png").is_file()
    assert (tmp_path / "run/06-pixel-preview-464.png").is_file()
```

- [ ] **Step 2: Run and verify red state**

Run:

```bash
python -m pytest tests/unit/tools/test_photo_to_voxel_pipeline.py -q
```

Expected: import fails because `run_pipeline.py` does not exist.

- [ ] **Step 3: Implement exact pipeline boundaries**

Use these public definitions and inference settings:

```python
@dataclass(frozen=True)
class PipelineConfig:
    source: Path
    output_dir: Path
    rembg_model: str = "birefnet-general-lite"
    kernel_size: int = 10
    pixel_size: int = 16
    edge_thresh: float = 100.0


def make_rembg_runner(model_name: str) -> Callable[[Image.Image], Image.Image]:
    from rembg import new_session, remove

    session = new_session(model_name, providers=["CPUExecutionProvider"])
    return lambda image: remove(image, session=session).convert("RGBA")


def make_photo2pixel_runner(model_path: Path, config: PipelineConfig):
    import numpy as np
    import onnxruntime as ort

    session = ort.InferenceSession(
        str(model_path),
        providers=["CPUExecutionProvider"],
    )

    def pixelize(image: Image.Image) -> Image.Image:
        rgba = image.convert("RGBA")
        rgb = Image.new("RGB", rgba.size, "white")
        rgb.paste(rgba.convert("RGB"), mask=rgba.getchannel("A"))
        array = np.asarray(rgb, dtype=np.float32).transpose(2, 0, 1)[None, ...]
        output = session.run(
            ["output"],
            {
                "rgb": array,
                "param_kernel_size": np.array(config.kernel_size, np.int64),
                "param_pixel_size": np.array(config.pixel_size, np.int64),
                "param_edge_thresh": np.array(config.edge_thresh, np.float32),
            },
        )[0]
        pixels = output[0].transpose(1, 2, 0).clip(0, 255).astype(np.uint8)
        return Image.fromarray(pixels, "RGB")

    return pixelize
```

`run_image_stages` must copy the source to `01-original-cat.png`, save cleaned foreground and mask as `02` and `03`, save raw ONNX output as `04`, build and validate `05`, build `06`, and return hashes plus validation stats. The CLI defaults must be:

```python
repo_root = Path(__file__).resolve().parents[2]
workspace = repo_root / "var/photo-to-voxel-poc"
source = repo_root / "apps/web/public/demo-cats/cat-01/front.png"
model = workspace / "third_party/photo2pixel/photo2pixel.onnx"
os.environ.setdefault("U2NET_HOME", str(workspace / "models/rembg"))
```

- [ ] **Step 4: Verify the fake-inference integration test**

Run:

```bash
python -m pytest \
  tests/unit/tools/test_photo_to_voxel_image_contract.py \
  tests/unit/tools/test_photo_to_voxel_pipeline.py -q
```

Expected: all tests pass without downloading a model.

- [ ] **Step 5: Commit Task 2**

```bash
git add scripts/photo_to_voxel_poc/run_pipeline.py \
  tests/unit/tools/test_photo_to_voxel_pipeline.py
git commit -m "feat: orchestrate local photo pixelization"
```

---

### Task 3: Headless GazPrash adapter, OBJ validation, and previews

**Files:**
- Create: `scripts/photo_to_voxel_poc/gazprash_cli/main.go`
- Create: `scripts/photo_to_voxel_poc/obj_preview.py`
- Test: `tests/unit/tools/test_photo_to_voxel_obj_preview.py`

**Interfaces:**
- Consumes: `05-pixel-58.png`, a GazPrash checkout, and one depth scale.
- Produces: three colored OBJ files, geometry statistics, and 900×900 PNG previews.

- [ ] **Step 1: Write failing OBJ parser and renderer tests**

```python
from pathlib import Path

from PIL import Image

from scripts.photo_to_voxel_poc.obj_preview import inspect_obj, render_obj


CUBE = """\
v 0 0 0 1 0 0
v 1 0 0 1 0 0
v 1 1 0 1 0 0
v 0 1 0 1 0 0
f 1 2 3 4
"""


def test_obj_contract_and_preview(tmp_path: Path) -> None:
    source = tmp_path / "cube.obj"
    output = tmp_path / "cube.png"
    source.write_text(CUBE)

    stats = inspect_obj(source)
    render_obj(source, output, yaw_degrees=35)

    assert stats["vertices"] == 4
    assert stats["faces"] == 1
    assert stats["bounds"]["max"] == [1.0, 1.0, 0.0]
    assert Image.open(output).size == (900, 900)
```

- [ ] **Step 2: Run and verify red state**

Run:

```bash
python -m pytest tests/unit/tools/test_photo_to_voxel_obj_preview.py -q
```

Expected: import fails because `obj_preview.py` does not exist.

- [ ] **Step 3: Add the complete GazPrash CLI entry point**

```go
package main

import (
	"context"
	"encoding/base64"
	"flag"
	"fmt"
	"math/rand"
	"os"

	"pix2dTo3dApp/backend"
)

func main() {
	input := flag.String("input", "", "transparent PNG input")
	output := flag.String("output", "", "OBJ output")
	depth := flag.Float64("depth-scale", 0.4, "Z-axis depth multiplier")
	flag.Parse()
	if *input == "" || *output == "" {
		fmt.Fprintln(os.Stderr, "-input and -output are required")
		os.Exit(2)
	}
	data, err := os.ReadFile(*input)
	if err != nil {
		panic(err)
	}
	rand.Seed(1)
	settings := backend.Settings{
		Layout:               "single",
		Repeated:             false,
		Shape:                "rounded",
		BiasedScalingEnabled: false,
		BiasedScaleTop:       1.0,
		BiasedScaleMiddle:    1.0,
		BiasedScaleBottom:    1.0,
		DepthScale:           *depth,
		FlatDepth:            5.0,
		VoxelScale:           1.0,
	}
	err = backend.ConvertTo3D(
		context.Background(),
		base64.StdEncoding.EncodeToString(data),
		settings,
		*output,
	)
	if err != nil {
		panic(err)
	}
}
```

- [ ] **Step 4: Implement OBJ inspection and painter-order previews**

`obj_preview.py` must parse `v x y z r g b` and quad `f` lines, reject empty geometry or out-of-range indices, calculate non-zero bounds, rotate vertices around Y, invert model Y for the image plane, sort faces by mean camera depth, and draw filled polygons to a 900×900 RGBA image with Pillow:

```python
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw

Vertex = tuple[float, float, float, float, float, float]
Face = tuple[int, ...]


def _load_obj(path: Path) -> tuple[list[Vertex], list[Face]]:
    vertices: list[Vertex] = []
    faces: list[Face] = []
    for line in path.read_text().splitlines():
        fields = line.split()
        if not fields:
            continue
        if fields[0] == "v":
            if len(fields) < 7:
                raise ValueError(f"colored vertex requires six values: {line}")
            vertices.append(tuple(float(value) for value in fields[1:7]))
        elif fields[0] == "f":
            face = tuple(int(value.split("/")[0]) - 1 for value in fields[1:])
            if len(face) < 3:
                raise ValueError(f"face requires at least three vertices: {line}")
            faces.append(face)
    if not vertices or not faces:
        raise ValueError("OBJ must contain vertices and faces")
    if any(index < 0 or index >= len(vertices) for face in faces for index in face):
        raise ValueError("OBJ face index is out of range")
    return vertices, faces


def inspect_obj(path: Path) -> dict[str, object]:
    vertices, faces = _load_obj(path)
    axes = list(zip(*(vertex[:3] for vertex in vertices), strict=True))
    minimum = [min(axis) for axis in axes]
    maximum = [max(axis) for axis in axes]
    if not any(high > low for low, high in zip(minimum, maximum, strict=True)):
        raise ValueError("OBJ bounds are zero")
    return {
        "vertices": len(vertices),
        "faces": len(faces),
        "bounds": {"min": minimum, "max": maximum},
    }


def _transform(
    vertex: Vertex,
    yaw_degrees: float,
    pitch_degrees: float,
) -> tuple[float, float, float]:
    x, y, z = vertex[:3]
    yaw = math.radians(yaw_degrees)
    pitch = math.radians(pitch_degrees)
    x, z = x * math.cos(yaw) + z * math.sin(yaw), -x * math.sin(yaw) + z * math.cos(yaw)
    y, z = y * math.cos(pitch) - z * math.sin(pitch), y * math.sin(pitch) + z * math.cos(pitch)
    return x, -y, z


def _face_color(vertices: list[Vertex], face: Face) -> tuple[int, int, int, int]:
    rgb = [
        sum(vertices[index][channel] for index in face) / len(face)
        for channel in (3, 4, 5)
    ]
    first, second, third = (vertices[face[index]] for index in range(3))
    ux, uy = second[0] - first[0], second[1] - first[1]
    vx, vy = third[0] - first[0], third[1] - first[1]
    facing = min(1.0, abs(ux * vy - uy * vx))
    light = max(0.55, min(1.0, 0.72 + 0.28 * facing))
    return tuple(round(max(0.0, min(1.0, channel)) * 255 * light) for channel in rgb) + (255,)


def render_obj(
    source: Path,
    output: Path,
    *,
    yaw_degrees: float,
    pitch_degrees: float = -8.0,
    size: int = 900,
) -> None:
    vertices, faces = _load_obj(source)
    transformed = [
        _transform(vertex, yaw_degrees, pitch_degrees)
        for vertex in vertices
    ]
    x_values = [vertex[0] for vertex in transformed]
    y_values = [vertex[1] for vertex in transformed]
    span = max(max(x_values) - min(x_values), max(y_values) - min(y_values))
    if span <= 0:
        raise ValueError("OBJ projection has zero size")
    margin = size * 0.07
    scale = (size - 2 * margin) / span
    center_x = (min(x_values) + max(x_values)) / 2
    center_y = (min(y_values) + max(y_values)) / 2
    projected = [
        (
            size / 2 + (x - center_x) * scale,
            size / 2 + (y - center_y) * scale,
            z,
        )
        for x, y, z in transformed
    ]
    image = Image.new("RGBA", (size, size), (246, 243, 238, 255))
    draw = ImageDraw.Draw(image)
    ordered = sorted(
        faces,
        key=lambda face: sum(projected[index][2] for index in face) / len(face),
    )
    for face in ordered:
        polygon = [(projected[index][0], projected[index][1]) for index in face]
        draw.polygon(
            polygon,
            fill=_face_color(vertices, face),
            outline=(70, 62, 56, 72),
        )
    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output)


def render_standard_views(source: Path, output_dir: Path) -> list[Path]:
    views = (
        ("08-voxel-front.png", 0.0),
        ("09-voxel-side.png", 90.0),
        ("10-voxel-three-quarter.png", 35.0),
    )
    outputs = []
    for filename, yaw in views:
        output = output_dir / filename
        render_obj(source, output, yaw_degrees=yaw)
        outputs.append(output)
    return outputs


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    render_standard_views(args.input, args.output_dir)
    print(json.dumps(inspect_obj(args.input), indent=2))


if __name__ == "__main__":
    main()
```

Face color is the mean vertex RGB multiplied by a clamped directional-light factor in `[0.55, 1.0]`. The code uses background `(246, 243, 238, 255)` and a 7% image margin.

- [ ] **Step 5: Verify Go formatting and Python tests**

Run:

```bash
gofmt -d scripts/photo_to_voxel_poc/gazprash_cli/main.go
python -m pytest tests/unit/tools/test_photo_to_voxel_obj_preview.py -q
python -m pytest tests/unit/tools -q
```

Expected: no Go formatting diff; all tool tests pass.

- [ ] **Step 6: Commit Task 3**

```bash
git add scripts/photo_to_voxel_poc/gazprash_cli/main.go \
  scripts/photo_to_voxel_poc/obj_preview.py \
  tests/unit/tools/test_photo_to_voxel_obj_preview.py
git commit -m "feat: adapt and inspect GazPrash voxel output"
```

---

### Task 4: Pin and qualify the local third-party runtime

**Files:**
- Create: `scripts/photo_to_voxel_poc/README.md`
- Runtime only: `var/photo-to-voxel-poc/env/`
- Runtime only: `var/photo-to-voxel-poc/third_party/`
- Runtime only: `var/photo-to-voxel-poc/third-party-lock.json`

**Interfaces:**
- Consumes: GitHub repositories and conda-forge/PyPI packages.
- Produces: a Python 3.12 + Go 1.23 local environment and exact upstream commit lock.

- [ ] **Step 1: Create the isolated conda environment**

Run:

```bash
conda create -y -p var/photo-to-voxel-poc/env \
  -c conda-forge python=3.12 go=1.23 pip
```

Expected: `var/photo-to-voxel-poc/env/bin/python --version` reports Python 3.12 and `go version` reports Go 1.23.

- [ ] **Step 2: Clone and pin exact upstream commits**

Run:

```bash
git clone https://github.com/danielgatis/rembg.git \
  var/photo-to-voxel-poc/third_party/rembg
git -C var/photo-to-voxel-poc/third_party/rembg checkout \
  684f8e9f6c9162009b21ab637d8f2b0c05502470
git clone https://github.com/Jzou44/photo2pixel.git \
  var/photo-to-voxel-poc/third_party/photo2pixel
git -C var/photo-to-voxel-poc/third_party/photo2pixel checkout \
  fb5f9bad7d33aaa754ab6745a34edcbd1f4a2e46
git clone https://github.com/GazPrash/2d-to-3d-voxelizer.git \
  var/photo-to-voxel-poc/third_party/2d-to-3d-voxelizer
git -C var/photo-to-voxel-poc/third_party/2d-to-3d-voxelizer checkout \
  d3bf1cf1062225a9d24d3eb301ecb032cd4da8ce
```

Expected: each `git rev-parse HEAD` exactly matches the requested hash.

- [ ] **Step 3: Install only required Python runtime packages**

Run:

```bash
var/photo-to-voxel-poc/env/bin/python -m pip install \
  "./var/photo-to-voxel-poc/third_party/rembg[cpu]" \
  numpy pillow onnxruntime pytest
```

Expected: imports for `rembg`, `numpy`, `onnxruntime`, and `PIL` succeed using the isolated interpreter.

- [ ] **Step 4: Install the thin CLI into the ignored checkout**

Run:

```bash
mkdir -p \
  var/photo-to-voxel-poc/third_party/2d-to-3d-voxelizer/cmd/p2v-cli
cp scripts/photo_to_voxel_poc/gazprash_cli/main.go \
  var/photo-to-voxel-poc/third_party/2d-to-3d-voxelizer/cmd/p2v-cli/main.go
```

Then run from the GazPrash checkout with the conda environment on `PATH`:

```bash
PATH="$PWD/var/photo-to-voxel-poc/env/bin:$PATH" \
  go test ./backend/... ./cmd/p2v-cli
```

Expected: the backend and CLI compile successfully without Wails or Node.

- [ ] **Step 5: Record provenance and licenses**

Write `third-party-lock.json` with this exact schema:

```json
{
  "rembg": {
    "url": "https://github.com/danielgatis/rembg.git",
    "commit": "684f8e9f6c9162009b21ab637d8f2b0c05502470",
    "license": "MIT"
  },
  "photo2pixel": {
    "url": "https://github.com/Jzou44/photo2pixel.git",
    "commit": "fb5f9bad7d33aaa754ab6745a34edcbd1f4a2e46",
    "license": "Apache-2.0"
  },
  "gazprash": {
    "url": "https://github.com/GazPrash/2d-to-3d-voxelizer.git",
    "commit": "d3bf1cf1062225a9d24d3eb301ecb032cd4da8ce",
    "license": "MIT"
  }
}
```

The tracked README must document setup, the single run command, output names, the Single-mode limitation, and removal command `rm -rf var/photo-to-voxel-poc` as the explicit prototype cleanup path.

- [ ] **Step 6: Commit Task 4 tracked documentation only**

```bash
git status --short
git add scripts/photo_to_voxel_poc/README.md
git commit -m "docs: explain local photo voxel experiment"
```

Expected: nothing below `var/` appears staged.

---

### Task 5: Run the live cat experiment and capture evidence

**Files:**
- Runtime only: `var/photo-to-voxel-poc/run-cat-01/`
- Runtime only: `var/photo-to-voxel-poc/run-cat-01/manifest.json`
- Runtime only: `var/photo-to-voxel-poc/run-cat-01/experiment-report.md`

**Interfaces:**
- Consumes: the qualified environment and the fixed cat source.
- Produces: the full `01`–`10` artifact set, three OBJ variants, validation metrics, and a pass/fail report.

- [ ] **Step 1: Run all Python tests before live inference**

Run:

```bash
var/photo-to-voxel-poc/env/bin/python -m pytest tests/unit/tools -q
```

Expected: all tool tests pass.

- [ ] **Step 2: Run rembg and photo2pixel**

Run:

```bash
U2NET_HOME="$PWD/var/photo-to-voxel-poc/models/rembg" \
PATH="$PWD/var/photo-to-voxel-poc/env/bin:$PATH" \
var/photo-to-voxel-poc/env/bin/python \
  scripts/photo_to_voxel_poc/run_pipeline.py
```

Expected: numbered files `01` through `06` exist; `05-pixel-58.png` passes every automatic image contract.

- [ ] **Step 3: Generate three OBJ depth variants**

From `var/photo-to-voxel-poc/third_party/2d-to-3d-voxelizer`, run:

```bash
go run ./cmd/p2v-cli \
  -input ../../../run-cat-01/05-pixel-58.png \
  -output ../../../run-cat-01/07-voxel-shallow.obj \
  -depth-scale 0.25
go run ./cmd/p2v-cli \
  -input ../../../run-cat-01/05-pixel-58.png \
  -output ../../../run-cat-01/07-voxel-default.obj \
  -depth-scale 0.40
go run ./cmd/p2v-cli \
  -input ../../../run-cat-01/05-pixel-58.png \
  -output ../../../run-cat-01/07-voxel-deep.obj \
  -depth-scale 0.65
```

Expected: all three files contain valid colored vertices and faces.

- [ ] **Step 4: Validate and render the default OBJ**

Run:

```bash
var/photo-to-voxel-poc/env/bin/python \
  scripts/photo_to_voxel_poc/obj_preview.py \
  --input var/photo-to-voxel-poc/run-cat-01/07-voxel-default.obj \
  --output-dir var/photo-to-voxel-poc/run-cat-01
```

Expected:

- `08-voxel-front.png`
- `09-voxel-side.png`
- `10-voxel-three-quarter.png`

All previews are 900×900 and show non-background pixels.

- [ ] **Step 5: Complete manifest and experiment report**

The manifest must record:

- source and every artifact SHA-256;
- source dimensions and mode;
- rembg model and installed version;
- photo2pixel ONNX SHA-256 and three parameters;
- exact upstream commits and licenses;
- Python, Go, Pillow, NumPy, ONNX Runtime, and rembg versions;
- 58×58 contract statistics;
- vertex count, face count, and bounds for each OBJ;
- elapsed seconds for segmentation, pixelization, and each voxelization.

The report must mark each of these `PASS`, `FAIL`, or `NOT_TESTED`:

- foreground preserves ears, legs, and tail;
- 58×58 image preserves recognizable silhouette and main coat pattern;
- no visible background voxels;
- OBJ opens, rotates, and matches the front sprite;
- side/back approximation is acceptable for this POC;
- local warm run is reproducible.

- [ ] **Step 6: Inspect the artifacts visually and run final gates**

Open and compare:

- `01-original-cat.png`
- `02-foreground.png`
- `05-pixel-58.png`
- `06-pixel-preview-464.png`
- `08-voxel-front.png`
- `09-voxel-side.png`
- `10-voxel-three-quarter.png`

Run:

```bash
python -m pytest tests/unit/tools -q
git status --short
```

Expected: tests pass; only the planned tracked scripts/tests/docs are committed; `var/` remains absent from Git status.

If the 2D asset passes but side/back fails, stop with the explicit conclusion `SINGLE_VIEW_LIMITED`; do not alter the accepted 2D image to hide the 3D limitation.

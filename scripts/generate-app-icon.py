#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = ["Pillow", "click"]
# ///

# ABOUTME: Generates all macOS app icon sizes from a 1024x1024 source PNG.
# ABOUTME: Updates the Xcode asset catalog Contents.json and validates the output.

import json
from pathlib import Path

import click
from PIL import Image, ImageDraw

APPICONSET = (
    Path(__file__).resolve().parent.parent
    / "packages/desktop/Limn/Assets.xcassets/AppIcon.appiconset"
)

# Each macOS icon slot: (size_label, scale, pixel_size, filename)
ICON_SLOTS = [
    ("16x16", 1, 16, "icon_16x16.png"),
    ("16x16", 2, 32, "icon_16x16@2x.png"),
    ("32x32", 1, 32, "icon_32x32.png"),
    ("32x32", 2, 64, "icon_32x32@2x.png"),
    ("128x128", 1, 128, "icon_128x128.png"),
    ("128x128", 2, 256, "icon_128x128@2x.png"),
    ("256x256", 1, 256, "icon_256x256.png"),
    ("256x256", 2, 512, "icon_256x256@2x.png"),
    ("512x512", 1, 512, "icon_512x512.png"),
    ("512x512", 2, 1024, "icon_512x512@2x.png"),
]


def validate_source(path: Path) -> Image.Image:
    """Open and validate the source image is 1024x1024 PNG."""
    img = Image.open(path)
    if img.size != (1024, 1024):
        raise click.ClickException(
            f"Source must be 1024x1024, got {img.size[0]}x{img.size[1]}"
        )
    return img



def clean_old_icons() -> int:
    """Remove existing icon PNGs from the appiconset directory."""
    removed = 0
    for f in APPICONSET.glob("icon_*.png"):
        f.unlink()
        removed += 1
    return removed


def make_squircle_mask(size: int) -> Image.Image:
    """Create a macOS squircle (continuous rounded rect) mask.

    The corner radius is ~22.37% of the icon size, matching Apple's macOS
    icon shape. Uses a supersampled rounded rectangle for smooth edges.
    """
    # Supersample 4x for anti-aliased edges
    ss = 4
    ss_size = size * ss
    radius = round(size * 0.2237 * ss)

    mask = Image.new("L", (ss_size, ss_size), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle([0, 0, ss_size - 1, ss_size - 1], radius=radius, fill=255)
    return mask.resize((size, size), Image.LANCZOS)


def generate_icons(source: Image.Image) -> None:
    """Resize source image to all required sizes."""
    if source.mode != "RGBA":
        source = source.convert("RGBA")
    for size_label, scale, pixels, filename in ICON_SLOTS:
        resized = source.resize((pixels, pixels), Image.LANCZOS)
        # Apply macOS squircle mask so the icon has transparent corners.
        # Without this, macOS Tahoe puts the icon in "squircle jail".
        mask = make_squircle_mask(pixels)
        resized.putalpha(mask)
        resized.save(APPICONSET / filename, "PNG")
        click.echo(f"  {filename:30s} {pixels:4d}x{pixels:<4d} ({size_label} @{scale}x)")


def write_contents_json() -> None:
    """Write the Contents.json file with all icon entries."""
    images = []
    for size_label, scale, _, filename in ICON_SLOTS:
        images.append(
            {
                "filename": filename,
                "idiom": "mac",
                "scale": f"{scale}x",
                "size": size_label,
            }
        )

    contents = {
        "images": images,
        "info": {
            "author": "xcode",
            "version": 1,
        },
    }

    contents_path = APPICONSET / "Contents.json"
    contents_path.write_text(json.dumps(contents, indent=2) + "\n")
    click.echo(f"  Updated {contents_path.name}")


def validate_output() -> None:
    """Verify all expected files exist with correct dimensions."""
    errors = []
    for _, _, pixels, filename in ICON_SLOTS:
        path = APPICONSET / filename
        if not path.exists():
            errors.append(f"Missing: {filename}")
            continue
        img = Image.open(path)
        if img.size != (pixels, pixels):
            errors.append(
                f"{filename}: expected {pixels}x{pixels}, got {img.size[0]}x{img.size[1]}"
            )

    if errors:
        raise click.ClickException(
            "Validation failed:\n" + "\n".join(f"  {e}" for e in errors)
        )

    click.echo(f"\nValidation passed: {len(ICON_SLOTS)} icons, all correct dimensions")


@click.command()
@click.argument("source", type=click.Path(exists=True, dir_okay=False, path_type=Path))
def main(source: Path) -> None:
    """Generate macOS app icon sizes from a 1024x1024 source PNG."""
    source = source.resolve()
    click.echo(f"Source: {source}")

    img = validate_source(source)

    removed = clean_old_icons()
    if removed:
        click.echo(f"Cleaned {removed} old icon files")

    click.echo("Generating icons:")
    generate_icons(img)
    write_contents_json()
    validate_output()


if __name__ == "__main__":
    main()

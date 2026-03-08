#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = []
# ///
# ABOUTME: Packages the Limn desktop app into a signed, notarized DMG for distribution.
# ABOUTME: Expects a Release build at /tmp/limn-desktop-build/Release/Limn.app.

import plistlib
import subprocess
import sys
import tempfile
from pathlib import Path

BUILD_DIR = Path("/tmp/limn-desktop-build")
APP_PATH = BUILD_DIR / "Release" / "Limn.app"
KEYCHAIN_PROFILE = "limn-notarize"


def run(cmd: list[str], check: bool = True) -> subprocess.CompletedProcess[str]:
    print(f"$ {' '.join(cmd)}")
    return subprocess.run(cmd, check=check, text=True, capture_output=True)


def read_version() -> str:
    plist_path = APP_PATH / "Contents" / "Info.plist"
    if not plist_path.exists():
        print(f"Error: {plist_path} not found. Run 'just desktop-release' first.")
        sys.exit(1)
    with open(plist_path, "rb") as f:
        info = plistlib.load(f)
    return info["CFBundleShortVersionString"]


def create_dmg(version: str) -> Path:
    dmg_name = f"Limn-{version}.dmg"
    dmg_path = BUILD_DIR / dmg_name

    # Remove existing DMG if present
    dmg_path.unlink(missing_ok=True)

    # Create staging directory with app + Applications symlink
    with tempfile.TemporaryDirectory() as staging:
        staging_path = Path(staging)
        subprocess.run(
            ["cp", "-R", str(APP_PATH), str(staging_path / "Limn.app")],
            check=True,
        )
        (staging_path / "Applications").symlink_to("/Applications")

        result = run([
            "hdiutil", "create",
            "-volname", "Limn",
            "-srcfolder", str(staging_path),
            "-ov",
            "-format", "UDZO",
            str(dmg_path),
        ])
        if result.returncode != 0:
            print(f"hdiutil failed:\n{result.stderr}")
            sys.exit(1)

    print(f"Created {dmg_path}")
    return dmg_path


def sign_dmg(dmg_path: Path) -> None:
    result = run([
        "codesign", "--sign", "Developer ID Application",
        "--timestamp",
        str(dmg_path),
    ])
    if result.returncode != 0:
        print(f"codesign failed:\n{result.stderr}")
        sys.exit(1)
    print("DMG signed.")


def notarize(dmg_path: Path) -> None:
    print("Submitting for notarization (this may take several minutes)...")
    result = run([
        "xcrun", "notarytool", "submit",
        str(dmg_path),
        "--keychain-profile", KEYCHAIN_PROFILE,
        "--wait",
    ])
    if result.returncode != 0:
        print(f"Notarization failed:\n{result.stdout}\n{result.stderr}")
        sys.exit(1)
    print(f"Notarization complete:\n{result.stdout}")


def staple(dmg_path: Path) -> None:
    result = run(["xcrun", "stapler", "staple", str(dmg_path)])
    if result.returncode != 0:
        print(f"Stapling failed:\n{result.stderr}")
        sys.exit(1)
    print("Notarization ticket stapled.")


def main() -> None:
    if not APP_PATH.exists():
        print(f"Error: {APP_PATH} not found.")
        print("Run 'just desktop-release' first to build the Release app.")
        sys.exit(1)

    version = read_version()
    print(f"Packaging Limn v{version}")

    dmg_path = create_dmg(version)
    sign_dmg(dmg_path)
    notarize(dmg_path)
    staple(dmg_path)

    print(f"\nDone! DMG ready at: {dmg_path}")


if __name__ == "__main__":
    main()

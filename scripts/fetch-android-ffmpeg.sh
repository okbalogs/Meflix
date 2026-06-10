#!/usr/bin/env bash
# Downloads the prebuilt LGPL FFmpeg static executables for Android arm64-v8a
# and stages them as fake jniLibs (libffmpeg.so / libffprobe.so) so the
# Android packaging step can copy them into the generated Gradle project.
#
# Source: https://github.com/hzw1199/Android-FFmpeg-Prebuilt (FFmpeg 8.1.1,
# LGPL build, aarch64, 16KB-page-aligned, depends only on Android system libs).
set -euo pipefail

BASE_URL="https://raw.githubusercontent.com/hzw1199/Android-FFmpeg-Prebuilt/master/ffmpeg-8.1.1/bin"
FFMPEG_SHA256="480defd776199b5434008565974de5bf99822371c3cd9c1f130fda2c57de6439"
FFPROBE_SHA256="e66d481eb55af07282ea4efcdba5d18b564f809e9e40441dede7cc6ee9f88224"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST_DIR="$REPO_ROOT/src-tauri/android/bin"
mkdir -p "$DEST_DIR"

fetch() {
  local name="$1" sha="$2" dest="$3"
  if [ -f "$dest" ] && echo "$sha  $dest" | sha256sum -c --status; then
    echo "$name: already present and verified"
    return
  fi
  echo "Downloading $name ..."
  curl -fsSL --retry 4 --retry-delay 2 -o "$dest.tmp" "$BASE_URL/$name"
  echo "$sha  $dest.tmp" | sha256sum -c --status || {
    echo "ERROR: SHA256 mismatch for $name" >&2
    sha256sum "$dest.tmp" >&2
    rm -f "$dest.tmp"
    exit 1
  }
  chmod +x "$dest.tmp"
  mv "$dest.tmp" "$dest"
  echo "$name: downloaded and verified"
}

fetch ffmpeg "$FFMPEG_SHA256" "$DEST_DIR/libffmpeg.so"
fetch ffprobe "$FFPROBE_SHA256" "$DEST_DIR/libffprobe.so"

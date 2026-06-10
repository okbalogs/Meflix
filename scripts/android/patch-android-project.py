#!/usr/bin/env python3
"""Patches the Tauri-generated Android project (src-tauri/gen/android).

Run from the repo root after `tauri android init` and before
`tauri android build`. Idempotent — safe to run multiple times.

Applies:
  1. AndroidManifest.xml: media-read permissions + usesCleartextTraffic
     (the WebView must reach the local FFmpeg server on http://127.0.0.1:1421).
  2. MainActivity.kt: runtime permission request on startup.
  3. app/build.gradle.kts: useLegacyPackaging so the bundled FFmpeg
     executables are extracted to nativeLibraryDir, where exec() is allowed.
  4. Copies libffmpeg.so/libffprobe.so (fetched by
     scripts/fetch-android-ffmpeg.sh) into app/src/main/jniLibs/arm64-v8a/.
"""
import re
import shutil
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
GEN_ANDROID = REPO_ROOT / "src-tauri" / "gen" / "android"
APP_DIR = GEN_ANDROID / "app"
PACKAGE_PATH = "com/balogun/meflix"


def fail(msg: str) -> None:
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(1)


def patch_manifest() -> None:
    manifest = APP_DIR / "src" / "main" / "AndroidManifest.xml"
    if not manifest.exists():
        fail(f"manifest not found at {manifest} — did `tauri android init` run?")
    text = manifest.read_text()

    permissions = (
        '\n    <uses-permission android:name="android.permission.READ_MEDIA_VIDEO" />'
        '\n    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />'
    )
    if "READ_MEDIA_VIDEO" not in text:
        text, n = re.subn(r"(\n\s*<application)", permissions + r"\1", text, count=1)
        if n != 1:
            fail(f"could not find <application> tag in {manifest}")

    # The WebView must reach http://127.0.0.1:1421 in release builds too.
    # Tauri's template either omits the attribute or wires it to a Gradle
    # placeholder defaulting to "false"; force "true" in both cases (the
    # placeholder itself is handled in patch_gradle).
    if "usesCleartextTraffic" not in text:
        text = text.replace("<application", '<application\n        android:usesCleartextTraffic="true"', 1)

    manifest.write_text(text)
    print(f"patched {manifest}")


ON_CREATE = """class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: android.os.Bundle?) {
    super.onCreate(savedInstanceState)
    val perms = if (android.os.Build.VERSION.SDK_INT >= 33)
      arrayOf("android.permission.READ_MEDIA_VIDEO")
    else
      arrayOf("android.permission.READ_EXTERNAL_STORAGE")
    val missing = perms.filter { checkSelfPermission(it) != android.content.pm.PackageManager.PERMISSION_GRANTED }
    if (missing.isNotEmpty()) requestPermissions(missing.toTypedArray(), 1001)
  }
}"""


def patch_main_activity() -> None:
    activity = APP_DIR / "src" / "main" / "java" / PACKAGE_PATH / "MainActivity.kt"
    if not activity.exists():
        candidates = list((APP_DIR / "src" / "main").rglob("MainActivity.kt"))
        fail(f"MainActivity.kt not found at {activity}; found instead: {candidates}")
    text = activity.read_text()
    if "onCreate" in text:
        print(f"{activity} already patched")
        return
    # The generated file is `class MainActivity : TauriActivity()` — extend it
    # with a body that requests media permissions at startup. Fully qualified
    # names avoid having to touch the template's imports.
    new_text, n = re.subn(r"class MainActivity\s*:\s*TauriActivity\(\)", ON_CREATE, text)
    if n != 1:
        fail(f"unexpected MainActivity.kt contents:\n{text}")
    activity.write_text(new_text)
    print(f"patched {activity}")


def patch_gradle() -> None:
    gradle = APP_DIR / "build.gradle.kts"
    if not gradle.exists():
        fail(f"{gradle} not found")
    text = gradle.read_text()

    # If the manifest's cleartext flag goes through a placeholder, make sure
    # it is "true" everywhere (release builds included).
    cleartext, n = re.subn(
        r'manifestPlaceholders\["usesCleartextTraffic"\]\s*=\s*"false"',
        'manifestPlaceholders["usesCleartextTraffic"] = "true"',
        text,
    )
    if n:
        text = cleartext
        gradle.write_text(text)
        print(f"forced usesCleartextTraffic placeholder to true in {gradle}")

    if "useLegacyPackaging" in text:
        print(f"{gradle} already patched")
        return
    block = (
        "android {\n"
        "    packaging {\n"
        "        jniLibs {\n"
        "            // Extract the bundled FFmpeg executables to nativeLibraryDir\n"
        "            // so the app can exec() them (W^X forbids exec from app data).\n"
        "            useLegacyPackaging = true\n"
        "        }\n"
        "    }\n"
    )
    new_text, n = re.subn(r"android \{\n", block, text, count=1)
    if n != 1:
        fail(f"could not find `android {{` block in {gradle}")
    gradle.write_text(new_text)
    print(f"patched {gradle}")


def copy_ffmpeg_binaries() -> None:
    src_dir = REPO_ROOT / "src-tauri" / "android" / "bin"
    jni_dir = APP_DIR / "src" / "main" / "jniLibs" / "arm64-v8a"
    jni_dir.mkdir(parents=True, exist_ok=True)
    for name in ("libffmpeg.so", "libffprobe.so"):
        src = src_dir / name
        if not src.exists():
            fail(f"{src} missing — run scripts/fetch-android-ffmpeg.sh first")
        shutil.copy2(src, jni_dir / name)
        print(f"copied {name} -> {jni_dir}")


def main() -> None:
    if not GEN_ANDROID.exists():
        fail(f"{GEN_ANDROID} not found — run `npm run tauri android init` first")
    patch_manifest()
    patch_main_activity()
    patch_gradle()
    copy_ffmpeg_binaries()
    print("Android project patched successfully")


if __name__ == "__main__":
    main()

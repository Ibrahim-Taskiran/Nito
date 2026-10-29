# Building Nito for Android

## Prerequisites (all free)
- Android SDK at `%LOCALAPPDATA%\Android\Sdk` with platform 34+, build-tools, platform-tools.
- Android command-line tools (`cmdline-tools\latest`) and NDK 27.2 (`sdkmanager "ndk;27.2.12479018"`).
- JDK 17+ (Android Studio's `jbr` works).
- Rust targets: `rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android`

## Environment variables (User scope)
- `ANDROID_HOME` = `%LOCALAPPDATA%\Android\Sdk`
- `NDK_HOME` = `%LOCALAPPDATA%\Android\Sdk\ndk\27.2.12479018`
- `JAVA_HOME` = `C:\Program Files\Android\Android Studio\jbr`

Open a new terminal after setting them.

## Commands
- Debug APK for a phone: `npx tauri android build --apk --debug --target aarch64`
- Debug APK for the x86_64 emulator: `npx tauri android build --apk --debug --target x86_64`
- Run on a device/emulator: `npx tauri android dev`

The project is already generated in `src-tauri/gen/android` (committed). Re-run `npx tauri android init` only if it is missing.

## Output
`src-tauri/gen/android/app/build/outputs/apk/<arch>/debug/app-<arch>-debug.apk`
Install: `adb install -r <apk>`.

## Microphone
`RECORD_AUDIO` and `MODIFY_AUDIO_SETTINGS` are in the manifest. wry asks for the runtime permission when the WebView requests the mic.

## Known limits
- No local Whisper on mobile (desktop-only). The `whisper_*` commands do not exist there; the UI shows transcription as unavailable.
- No local Ollama on mobile (it is localhost-only), so the AI features are unavailable.
- Debug builds are signed with the debug key only. Release signing is not set up.

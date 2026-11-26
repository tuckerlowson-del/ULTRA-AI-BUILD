# ONE BRAIN Android build

The Android edition wraps the shared React interface with Capacitor and is built on GitHub Actions. Android Studio is not required on the developer's laptop.

## Build

Run the **ONE BRAIN Android APK** workflow from the Actions tab, or push a change under `desktop/` to `main`. Download the `ONE-BRAIN-ANDROID-DEV-BUILD-N` artifact from the successful workflow run.

## Android edition scope

- OpenRouter chat using the API key entered in Settings.
- API key is kept in app memory only; it is not written to local storage or included in the APK.
- The Android edition does not expose the Windows Electron computer-control bridge, Windows file access, or Windows LAN discovery.
- Folder selection and native Android device controls are not implemented in this first migration.
- Network access is required for OpenRouter requests.

The APK produced by CI is a debug build for testing, not a signed Play Store release.

# ONE BRAIN

A private multi-model AI workspace. Initial phase: OpenRouter API mode. Long-term phase: an independently hosted model on Oracle Cloud Linux.

## Version 0.3.0 preview
- OpenRouter model catalogue discovery and multi-model requests.
- Windows in-app updater through the Cloudflare Worker at `one-brain-updater.tuckerlowson.workers.dev`.
- Manual Windows mouse and keyboard control with explicit enable/disable and emergency stop.
- Laptop dashboard with CPU, memory, OS, and processor statistics.
- Separate native maximize and fullscreen controls.

## Architecture
- Rust application core with Slint native UI (no Electron).
- Windows desktop and Android build targets.
- OpenRouter-compatible model access.
- GitHub Actions builds Windows EXE and Android APK artifacts/releases.
- Cloudflare website with direct download routes and release update proxy.

## Build
- Windows: `cargo build --release --bin one-brain`
- Android ARM64: `cargo apk2 build --target aarch64-linux-android --lib --release`

## Secrets
Configure `GITHUB_TOKEN` as a Cloudflare Pages/Worker secret with read-only access to this repository's releases. Configure `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as GitHub Actions secrets for website deployment. Never commit tokens or API keys.

The preview stores the OpenRouter key in memory only for the current app session. Use provider spending limits. Computer control is manual and permission-gated. Enable it before sending individual mouse or keyboard events, and use Emergency Stop to disable further input. Avoid automated entry of passwords or payment details.

## UI licensing
The app uses Slint. Review its royalty-free application license and attribution requirements before distribution; see `NOTICE.md`.

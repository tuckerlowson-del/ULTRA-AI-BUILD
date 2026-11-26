# ONE BRAIN

A private multi-model AI workspace. Initial phase: OpenRouter API mode. Long-term phase: an independently hosted model on Oracle Cloud Linux.

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

The preview stores the OpenRouter key in memory only for the current app session. Use provider spending limits. Computer control remains disabled until explicit permissions and confirmations are implemented.

## UI licensing
The app uses Slint. Review its royalty-free application license and attribution requirements before distribution; see `NOTICE.md`.

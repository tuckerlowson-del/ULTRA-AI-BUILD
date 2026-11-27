# ONE BRAIN

ONE BRAIN is a private AI workspace and desktop operator.

## Downloads

Download the latest successful Windows installer (EXE) and Android test APK from the repository's [GitHub Releases](https://github.com/tuckerlowson-del/ULTRA-AI-BUILD/releases). Each successful build on `main` publishes both files together as a development release. Version tags publish a non-development release.

The Android APK is currently a debug/testing build, not a Play Store-signed production release.

## Development builds

The desktop shows **DEV BUILD #N**, where N is the monotonically increasing GitHub Actions workflow run number. Local development displays `DEV BUILD #LOCAL`. These are development build identifiers, not release-version claims.

## Desktop stack

The Windows desktop is built with **Electron + React + JavaScript + CSS**. Rust and Slint are not used by the desktop application.

### AI Operator
- OpenRouter model routing with a configurable model ID.
- Agent task loop with tool calls, progress events, desktop preview and bounded execution.
- Screenshot inspection (select a model with vision support).
- Approval-gated mouse, keyboard, URL-opening and diagnostic actions.
- Workspace-scoped file listing and text reading.
- Fixed allowlist of read-only Windows diagnostic commands.
- Stop control and activity timeline.

### FORD MDT workspace
- Mobile Data Terminal-style radar and local network overview.
- Blue marker for this PC; red markers for devices visible in the local ARP neighbour table.
- Refreshes every three seconds while the MDT page is open.
- Uses passive local neighbour information only; it does not scan external networks or infer physical locations.
- Device labels are generic because a network address does not reliably identify a person or device owner.

### Preview limitations
- This is an active development build, not a finished Grok Bot equivalent.
- Windows CI and runtime testing must pass before an installer can be considered verified.
- The selected OpenRouter model must support image input for screenshot reasoning.
- The agent cannot delete files, install software, change security settings, or execute arbitrary shell commands.
- Android has not yet been migrated to the Electron desktop stack.

## Run locally

From the `desktop` directory:

```bash
npm install
npm start
```

Build a Windows installer:

```bash
npm run dist:win
```

## Chat history and model catalogue

- Conversations are saved locally and restored on the next launch.
- Create, search, pin, delete, copy and export conversations.
- Press **Enter** to send and **Shift+Enter** to add a new line. **Ctrl+N** creates a new chat and **Ctrl+K** focuses chat search.
- The model catalogue reads the selected provider's live `/models` endpoint and follows pagination where the provider exposes it.
- Free/paid labels use provider pricing metadata. If pricing is absent, the app displays **Price not provided** rather than guessing.
- A model appearing in a live catalogue means the provider currently lists it; it does not guarantee uptime or that every endpoint supports every feature.

## Windows installer and versioning

- The Windows build uses a customized NSIS installer welcome page and the ONE BRAIN application icon.
- The release version is assigned from the workflow run number so each published build has a distinct version.
- User data is kept separately from the application installation, so updating the app does not replace chat history or settings.

## OpenRouter

Add an OpenRouter API key inside the app. The Windows desktop stores the API key separately using Electron safeStorage encryption when the user chooses Save. Chat history, provider presets and app settings are saved locally in the app user-data folder. Model requests may incur charges unless the selected model has a confirmed $0 price; free routes can still have rate limits. Never paste API keys into chat or commit them to source control.

## Security

The Electron renderer uses context isolation and a preload bridge. File inspection is limited to the selected workspace. Computer input and external actions require confirmation. Only a fixed list of read-only diagnostic commands is exposed. The MDT view reads the local ARP neighbour table and local IPv4 interface information only.

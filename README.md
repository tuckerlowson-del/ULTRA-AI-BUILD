# ONE BRAIN

ONE BRAIN is a private AI workspace and desktop operator.

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

## OpenRouter

Add an OpenRouter API key inside the app. The desktop preview keeps it in memory for the current session and does not write it to disk. Model requests may incur charges; configure a spending limit with a parent or guardian. Never paste API keys into chat or commit them to source control.

## Security

The Electron renderer uses context isolation and a preload bridge. File inspection is limited to the selected workspace. Computer input and external actions require confirmation. Only a fixed list of read-only diagnostic commands is exposed. The MDT view reads the local ARP neighbour table and local IPv4 interface information only.

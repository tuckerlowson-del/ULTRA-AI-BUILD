# ONE BRAIN

ONE BRAIN is a private AI workspace and desktop operator.

## Desktop preview 0.4.0

The active Windows desktop app is being rebuilt with **Electron + React + JavaScript/TypeScript + CSS**. Rust and Slint are no longer the desktop UI stack.

### Current foundation
- Custom React desktop workspace with a responsive dark interface.
- Electron main/preload separation with context isolation and Node integration disabled in the renderer.
- OpenRouter model routing; the model ID is configurable.
- Agent task loop with tool calls, progress events, a live desktop preview, and a bounded execution loop.
- Computer screenshot, mouse click, typing, and permitted key actions.
- Workspace-scoped file listing and text reading.
- Read-only Windows diagnostic commands from a fixed allowlist.
- User approval prompts before computer input, external URLs, and diagnostic commands.
- Stop control and activity timeline.

### Important preview limitations
- This is an early foundation, not a finished Grok Bot equivalent.
- The computer-input module and packaging still need CI verification on Windows.
- The screenshot is displayed in the UI; the selected OpenRouter model must support image input for visual reasoning.
- The agent cannot delete files, install applications, change security settings, or execute arbitrary shell commands.
- The Android app is not migrated to this stack yet.

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

Add an OpenRouter API key inside the app. The desktop preview keeps it in memory for the current session and does not write it to disk. Model requests can incur charges; set a provider spending limit. Never paste API keys into chat or commit them to source control.

## Security

The Electron renderer uses context isolation and a preload bridge. File inspection is limited to the selected workspace. Computer input and external actions require a confirmation dialog. Only a fixed list of read-only diagnostic commands is exposed.

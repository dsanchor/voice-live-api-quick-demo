# Lambert — History

## Project Context
- **Project:** voice-lice-quick-demo
- **User:** Copilot
- **Stack:** Python backend, HTML/JS frontend, Azure AI Foundry Voice Live API, Azure Container Apps
- **Description:** Voice agent web app connecting to Azure AI Foundry via Voice Live API. Deployed to Azure Container Apps with GH Actions CI/CD. Managed identity with Azure AI User role for Foundry access. Configuration page for agent settings.

## Learnings

### 2026-04-28 — Full Frontend Build
- **Architecture:** Two-page SPA — `static/index.html` (config) → `static/voice.html` (session)
- **State transfer:** Config persisted in localStorage under key `voiceAgentConfig`; voice page reads it on load and redirects back if missing
- **Audio pipeline:** `audio.js` provides `MicCapture` (AudioWorklet w/ ScriptProcessor fallback) and `AudioPlayer` (buffer queue for gapless playback). PCM16 @ 24kHz, base64-encoded over WebSocket
- **WebSocket protocol:** First message is `{type:"config", ...}`, then audio frames as `{type:"audio", data:"<base64>"}`. Server sends: `session_ready`, `audio`, `user_transcript`, `agent_transcript`, `status`, `response_created`, `response_done`, `error`
- **Barge-in:** Audio playback is flushed when user starts speaking (on `status.listening` event or mic toggle)
- **CSS:** Dark theme, CSS variables for theming, no frameworks. Responsive down to 480px.
- **Key files:**
  - `static/css/style.css` — all shared styles
  - `static/js/config.js` — config page logic
  - `static/js/audio.js` — audio capture & playback utilities
  - `static/js/voice.js` — voice page WebSocket + UI orchestration

### 2026-04-28T16:19:15Z — Manifest Complete & Integration Locked
- **Decisions finalized** (see `.squad/decisions.md`)
- **Team sync:** Backend confirmed proxy architecture and WebSocket handler ready, DevOps confirmed deployment readiness
- **Integration bugs fixed by Coordinator:** camelCase→snake_case config mapping, status field name mismatch, AzureStandardVoice type, agent_version default
- **Orchestration log** written at `.squad/orchestration-log/2026-04-28T16:19:15Z-lambert.md`
- **Status:** Ready for Azure Container Apps deployment

### 2026-04-30T15:08:53.243+02:00 — Load Settings from JSON File
- **Feature:** Added "Load Settings" button to config page that opens browser file picker for `.json` files
- **Pattern:** Hidden `<input type="file">` triggered by visible button click — keeps UI clean while using native file dialog
- **Validation:** JSON parse check + mandatory field presence check before populating form. Error/success toasts for feedback.
- **Auto-expand:** If the loaded JSON contains any advanced fields, the collapsible Advanced Settings section opens automatically
- **Sample configs:** Created `config-samples/mandatory-only.json` and `config-samples/all-fields.json` with realistic placeholders
- **Styling:** Used existing `.btn-secondary` class; added `.config-toolbar` flex container above the form
- **Key files modified:** `static/index.html`, `static/js/config.js`, `static/css/style.css`
- **New files:** `config-samples/mandatory-only.json`, `config-samples/all-fields.json`

### 2026-05-02T08:26:49Z — Config Loader Field Reset Fix
- **Issue:** JSON file loading was not resetting fields to defaults when they weren't present in the loaded JSON (due to `!(id in data)` guard preventing assignment)
- **Fix:** Removed the guard; fields now properly reset to application defaults when omitted from JSON
- **Impact:** Users can load partial config JSON files without stale values from previous sessions remaining
- **Testing:** Verified form field reset behavior on partial JSON loads
- **Status:** Completed and committed

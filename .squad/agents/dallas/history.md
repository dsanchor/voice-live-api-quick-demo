# Dallas — History

## Project Context
- **Project:** voice-lice-quick-demo
- **User:** Copilot
- **Stack:** Python backend, HTML/JS frontend, Azure AI Foundry Voice Live API, Azure Container Apps
- **Description:** Voice agent web app connecting to Azure AI Foundry via Voice Live API. Deployed to Azure Container Apps with GH Actions CI/CD. Managed identity with Azure AI User role for Foundry access. Configuration page for agent settings.

## Learnings

### 2026-04-28T18:07:06.559+02:00 — Initial Backend Implementation
- **Architecture:** FastAPI app with WebSocket proxy pattern — browser ↔ `/ws/voice` ↔ Voice Live API
- **Key files:** `app/main.py` (FastAPI app, WS endpoint, static mount), `app/voice_session.py` (SDK session class), `app/requirements.txt`
- **Auth:** `DefaultAzureCredential` from `azure.identity.aio` — supports managed identity in prod, CLI cred locally
- **Protocol:** Browser sends config JSON first, then streams base64 PCM16 24kHz audio; backend proxies events back as typed JSON messages
- **Barge-in:** On `INPUT_AUDIO_BUFFER_SPEECH_STARTED`, we call `connection.response.cancel()` to interrupt current agent speech
- **Greeting:** Optional proactive greeting via `conversation.item.create` + `response.create`
- **Static files:** Mounted at `/` with `html=True` so `index.html` serves at root; mounted last so `/health` and `/ws/voice` take priority
- **SDK API version:** `2026-01-01-preview`

### 2026-04-28T16:19:15Z — Manifest Complete & Integration Locked
- **Decisions finalized** (see `.squad/decisions.md`)
- **Team sync:** Frontend confirmed WebSocket protocol implementation (config→audio→stop), DevOps confirmed deployment readiness
- **Integration bugs fixed by Coordinator:** camelCase→snake_case config mapping, status field name mismatch, AzureStandardVoice type, agent_version default
- **Orchestration log** written at `.squad/orchestration-log/2026-04-28T16:19:15Z-dallas.md`
- **Status:** Ready for Azure Container Apps deployment

### 2026-04-30T14:39:49.781+02:00 — Fixed ModuleNotFoundError for local dev
- **Problem:** Running `uvicorn app.main:app --reload --port 8000` from project root failed with `ModuleNotFoundError: No module named 'voice_session'` because `app/main.py` used a bare `from voice_session import ...` which only resolves when CWD is `app/`.
- **Fix:** Created `app/__init__.py` to make `app` a proper Python package. Changed import to `from app.voice_session import ...`. Updated `__main__` uvicorn target from `"main:app"` to `"app.main:app"`.
- **Verified:** No other bare sibling imports in `app/`. Dockerfile already used `app.main:app` so Docker builds are unaffected.

### 2026-04-30T22:31:38.792+02:00 — Voice Live event handler gaps fixed
- **New event handlers:** `RESPONSE_AUDIO_DONE` → `audio_done`, `RESPONSE_TEXT_DONE` → `agent_text`, `CONVERSATION_ITEM_CREATED` → debug log + browser emit
- **Barge-in state tracking:** Added `_active_response` / `_response_api_done` booleans; cancel only fires when a response is truly active; graceful handling of "no active response" errors
- **Connection refactor:** Separated connection context manager (`_connection_context`) from the connection object for proper cleanup via `__aexit__`
- **Audio features:** Added `noise_reduction_enabled` and `echo_cancellation_enabled` config fields with `AudioNoiseReduction`, `AudioEchoCancellation`, `AzureSemanticVadMultilingual` from SDK
- **New server→client message types:** `audio_done`, `agent_text`, `conversation_item_created` — Lambert should handle these in the frontend
- **Config sample:** Updated `config-samples/all-fields.json` with new fields

### 2026-04-30T23:13:59.190+02:00 — Barge-in (interruption) fix
- **Root cause:** `AudioPlayer.flush()` only stopped `this._currentSource` (the last created node), but `_scheduleNext()` pre-schedules multiple `AudioBufferSourceNode`s into the future via `source.start(startTime)`. Previously scheduled nodes kept playing because we lost references to them.
- **Fix in `static/js/audio.js`:** Replaced `_currentSource` (single ref) with `_activeSources` (a `Set`). Every scheduled source is added to the set; `onended` removes it. `flush()` iterates the set and stops ALL sources, then clears it.
- **Fix in `app/voice_session.py`:** Added `input_audio_buffer.clear()` after `response.cancel()` in the `INPUT_AUDIO_BUFFER_SPEECH_STARTED` handler to discard residual audio from the canceled response.
- **Fix in `static/js/voice.js`:** Added handlers for `audio_done` (resets mic state to idle) and `agent_text` (displays transcript) messages.

### 2026-04-30T23:20:49.627+02:00 — conversation_id capture & exposure
- **Capture:** `VoiceSession` now has `self.conversation_id` field; extracted from `event.response.conversation_id` on the first `RESPONSE_CREATED` event
- **WebSocket push:** Once captured, sends `{"type": "conversation_id", "id": "<cid>"}` to browser
- **REST endpoint:** `GET /session/{session_id}` returns `{ session_id, conversation_id }` for out-of-band lookup
- **Resume support:** `conversation_id` was already accepted in the config message and passed to the SDK `agent_config`; no change needed there
- **Session tracking:** `_active_sessions` dict in `main.py` maps session_id → VoiceSession for REST queries; cleaned up on disconnect

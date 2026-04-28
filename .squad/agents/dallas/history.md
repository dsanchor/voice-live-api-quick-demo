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

# Squad Decisions

## Active Decisions

### Decision: Backend WebSocket Proxy Architecture
**Date:** 2026-04-28T18:07:06.559+02:00  
**Author:** Dallas (Backend Dev)  
**Status:** Implemented

**Context:** Need a backend that connects the browser to Azure AI Voice Live API for real-time voice interaction.

**Decision:** Implemented a WebSocket proxy pattern: one `/ws/voice` endpoint per client connection that maps 1:1 to a Voice Live SDK session. The browser sends a config message first, then streams audio. The backend forwards events back as typed JSON.

**Key Points:**
- **No REST config endpoint** — config is sent as the first WebSocket message, keeping the protocol stateless and simple
- **Barge-in support** — cancels in-flight responses when user starts speaking
- **DefaultAzureCredential** — works with managed identity in Container Apps and Azure CLI locally
- **Static files mounted last** — ensures API routes aren't shadowed

**Impact:** Frontend team needs to follow the WebSocket protocol (config → audio → stop). Infra team needs to ensure the container exposes port 8000 and that managed identity has Azure AI User role on the Foundry resource.

---

### Decision: Frontend WebSocket Protocol & Audio Format
**Date:** 2026-04-28T18:07:06.559+02:00  
**Author:** Lambert (Frontend Dev)  
**Status:** Implemented

**Context:** Needed to define the client-side WebSocket message format and audio encoding for real-time voice streaming between browser and FastAPI backend.

**Decision:**
- **Audio format:** Raw PCM16, mono, 24kHz sample rate
- **Encoding:** Base64 over JSON WebSocket messages
- **Chunk size:** ~50ms (1200 samples) per frame
- **Message types (client → server):** `config`, `audio`, `stop`
- **Message types (server → client):** `session_ready`, `audio`, `user_transcript`, `agent_transcript`, `status`, `response_created`, `response_done`, `error`
- **Config delivery:** First WebSocket message after open carries all config fields as flat JSON

**Rationale:**
- PCM16 @ 24kHz matches Azure Voice Live API expectations
- Base64 in JSON keeps protocol simple (no binary framing needed)
- 50ms chunks balance latency vs. overhead
- Flat config message avoids multi-step handshake

**Impact:** Backend must implement the corresponding server-side WebSocket handler at `/ws/voice` accepting these message types.

---

### Decision: DevOps Pipeline & Infrastructure Strategy
**Date:** 2026-04-28  
**Author:** Parker (DevOps)  
**Status:** Implemented

**Context:** The voice agent app needs CI/CD and Azure infrastructure to go from code to production.

**Decisions:**
1. **GHCR over ACR** — Container images are pushed to GitHub Packages (ghcr.io) rather than Azure Container Registry. This keeps the pipeline simpler (no Azure credentials in GitHub) and uses the built-in `GITHUB_TOKEN`. The Container App pulls from GHCR using a PAT provided at deploy time.
2. **System-assigned managed identity** — The Container App uses a system-assigned identity (not user-assigned) for simplicity. The deploy script assigns `Azure AI User` on the Foundry resource so the app can authenticate without secrets.
3. **No application secrets in env vars** — The app receives its runtime config (endpoint, deployment, voice) from the frontend config page. The only credentials the Container App needs are the GHCR registry pull creds, which are set during `az containerapp create`.
4. **Idempotent deploy script** — `infra/deploy.sh` is safe to re-run. Resource group and environment use create-if-not-exists patterns; role assignment tolerates "already exists" errors.

**Impact:**
- **Frontend**: No changes needed — static assets are copied into the container as-is.
- **Backend**: App must bind to `0.0.0.0:8000` (already does via uvicorn). Managed identity is available via Azure SDK's `DefaultAzureCredential`.
- **Integration**: Voice Live API calls will authenticate via managed identity in production.

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction

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

### Decision: Use absolute package imports in app/
**Date:** 2026-04-30T14:39:49.781+02:00  
**Author:** Dallas (Backend Dev)  
**Status:** Implemented

**Context:** `app/main.py` used bare imports (`from voice_session import ...`) which fail when uvicorn is invoked from the project root as `uvicorn app.main:app`. Python only resolves bare imports relative to CWD or sys.path, not relative to the importing file.

**Decision:** All imports between modules inside `app/` must use absolute package paths (e.g., `from app.voice_session import ...`). Added `app/__init__.py` to make `app` a proper package.

**Impact:** Any new modules added to `app/` must be imported with the `app.` prefix. The `__main__` block and CLI invocation must both reference `app.main:app`.

---

### Decision: Load Settings from JSON File
**Date:** 2026-04-30T15:08:53.243+02:00  
**Author:** Lambert (Frontend Dev)  
**Status:** Implemented

**Context:** Users need a quick way to pre-populate the config form from a saved JSON file rather than typing all fields manually every time, especially when switching between environments or sharing configs.

**Decision:**
- Added a "Load Settings" button (`.btn-secondary` style) above the config form that triggers a hidden `<input type="file" accept=".json">`.
- The file is read client-side via `FileReader`, parsed as JSON, validated for mandatory fields, and used to populate the form using the existing `FIELDS` map.
- Created `config-samples/` directory at project root with two sample JSON files (`mandatory-only.json`, `all-fields.json`) for easy onboarding.

**Rationale:**
- Pure client-side approach — no backend changes needed.
- Reuses existing FIELDS map and form population pattern from `loadConfig()`.
- Sample files serve as documentation of valid config shapes.

**Impact:**
- **Backend:** None — no new endpoints.
- **DevOps:** The `config-samples/` folder ships with the repo but doesn't need to be in the container image (it's a developer convenience).
- **Frontend:** New toolbar area above form; `.config-toolbar` CSS class added.

---

### Decision: Remove GHCR Authentication for Public Repository
**Date:** 2026-04-28T00:00:00.000+02:00  
**Author:** Parker (DevOps)  
**Status:** Implemented

**Context:** The GitHub repository is PUBLIC. Container images pushed to ghcr.io from a public repository are publicly pullable without authentication. Azure Container Apps can pull public images directly without registry credentials.

**Decision:** Removed all GHCR authentication requirements from the deployment workflow:
- **`infra/deploy.sh`**: Removed `GHCR_USERNAME`, `GHCR_TOKEN` variables and `--ghcr-username`, `--ghcr-token` parameters. Removed registry credentials from `az containerapp create`.
- **`README.md`**: Updated deployment example and removed references to GitHub PATs and `read:packages` scope.

**Rationale:** Public images on GHCR are accessible without credentials. Azure Container Apps can pull them directly using the image URI.

**Impact:**
- Deployment simplification — no need to create or manage GitHub PATs with restricted scopes
- Security improvement — fewer secrets to manage in CI/CD pipelines
- Reduced friction — faster onboarding for deployment without credential setup
- No functional change — public images remain publicly accessible

**Backward Compatibility:** Existing deployments will continue to work. If users pass the old parameters to the updated script, it will reject them with "Unknown option."

---

### 2026-05-01T00:34:55+02:00: User directive
**By:** dsanchor (via Copilot)
**What:** Interim responses must NEVER generate audio simultaneously with the agent's main response. If the agent is already speaking, no interim audio should be produced.
**Why:** User request — two overlapping audio streams cause the agent to appear to cut off. Interim is currently disabled by default; if re-enabled in the future, mutual exclusion between interim and main response audio must be enforced.

---

### Decision: Mobile UX Improvement Strategy
**Date:** 2026-05-01T16:40:52.351+02:00  
**Author:** Ripley (Lead)  
**Status:** Recommendation (awaiting team decision)

#### Executive Summary
The current frontend is **vanilla HTML/JS with responsive CSS** — a lightweight, maintainable architecture with working audio/WebSocket integration. Mobile experience can be significantly improved without full framework migration. Recommend **phased approach**: CSS/HTML optimizations first (low risk, immediate gains), then optional progressive enhancements.

#### Recommendation
**Phase 1: CSS/HTML Enhancements (IMMEDIATE)**
- Implement mobile-first CSS rewrite
- Add aggressive hit target sizing (44-48px buttons, form inputs)
- Improve spacing hierarchy for mobile
- Estimated impact: +30-40% mobile UX
- Timeline: 1-2 hours
- Risk: Negligible
- **Action:** Delegate to Lambert (Frontend Dev)

**Phase 2: Progressive Enhancement (IF NEEDED)**
- After Phase 1 deployment, gather user feedback
- If mobile experience still needs work, add touch gestures and state improvements
- **Action:** Delegate to Lambert (Frontend Dev)

**🚫 Do NOT pursue framework migration** — Violates user's "minimize disruption" constraint

#### Impact
- **Frontend team:** Phase 1 styling work on `static/css/style.css`
- **Backend:** No changes needed
- **DevOps:** No changes needed

---

### Decision: Voice Live SDK Validation Findings
**Date:** 2026-04-30T22:26:40.472+02:00  
**Author:** Ripley (Lead)  
**Status:** Review Required

#### Must Address (for Dallas)
1. **Connection lifecycle** — Refactor to use `async with` or proper try/finally wrapper
2. **Missing event types** — Handle `RESPONSE_AUDIO_DONE` to signal browser that audio playback for a turn is complete
3. **Barge-in robustness** — Add `_active_response` state tracking instead of bare `except Exception: pass`
4. **Type the agent config** — Import and use `AgentSessionConfig` typed dict

#### Should Address (nice-to-have)
5. **Expose noise reduction / echo cancellation / VAD** — Expose as optional config fields

#### No Action Needed
6. **Credential** — `DefaultAzureCredential` is optimal; keep as-is
7. **Greeting** — Our configurable greeting text is more flexible; keep as-is

#### Impact
- **Dallas:** Items 1-4 are backend work in `app/voice_session.py`
- **Lambert:** Item 2 may introduce new WebSocket message types (`audio_done`)
- **Kane:** Needs integration tests for barge-in and greeting flows once fixes land

---

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction

# Ripley — History

## Project Context
- **Project:** voice-lice-quick-demo
- **User:** Copilot
- **Stack:** Python backend, HTML/JS frontend, Azure AI Foundry Voice Live API, Azure Container Apps
- **Description:** Voice agent web app connecting to Azure AI Foundry via Voice Live API. Deployed to Azure Container Apps with GH Actions CI/CD. Managed identity with Azure AI User role for Foundry access. Configuration page for agent settings.

## Learnings

### 2026-04-30 — Voice Live SDK Integration Validation
- **Reference API version:** `2026-01-01-preview` — our implementation matches.
- **Key file:** `app/voice_session.py` — single-file Voice Live session manager.
- **AgentSessionConfig import:** Reference uses `from azure.ai.voicelive.aio import AgentSessionConfig` typed dict. Our code builds a plain dict — functionally equivalent but loses type safety.
- **Credential choice:** We use `DefaultAzureCredential` (works with managed identity + CLI). Reference uses `AzureCliCredential`. Our choice is broader and correct for production.
- **Barge-in pattern:** Reference tracks `_active_response` / `_response_api_done` state before cancel. We always attempt cancel and swallow errors — simpler but may log noise.
- **Missing from our impl:** `SESSION_UPDATED` event, `RESPONSE_TEXT_DONE` event, `CONVERSATION_ITEM_CREATED` event, `RESPONSE_AUDIO_DONE` event handling. Also missing: noise reduction, echo cancellation, semantic VAD config options.
- **Connection pattern:** We manually call `__aenter__` / `__aexit__` instead of using `async with`. Works but error handling on connect failure is fragile.
- **Greeting default:** We require `proactive_greeting` text in config; reference hardcodes a prompt. Our approach is more flexible.

### 2026-05-01 — Frontend Architecture & Mobile UX Strategy
- **Frontend Stack:** Vanilla HTML5 + ES6 (no framework, no build step). Three core files: `index.html` (config page), `voice.html` (session page), `css/style.css` (design system). JavaScript split into `config.js`, `voice.js`, `audio.js` — clean separation of concerns.
- **Audio Implementation:** Web Audio API with AudioWorklet processor for PCM16 capture (24kHz, 1200 samples/50ms). Graceful fallback to ScriptProcessor for older browsers. Base64 encoding over WebSocket. Barge-in support via `flush()` method on AudioPlayer.
- **WebSocket Protocol:** Client sends `config` message first (camelCase to snake_case conversion in `voice.js`), then streams `audio` chunks, `stop` message. Server responds with `session_ready`, `audio`, `user_transcript`, `agent_transcript`, `status`, `response_created`, `response_done`, `error` messages. No protocol changes needed for UX improvements.
- **Current Mobile Issues:** Desktop-first CSS (small mobile breakpoint only at 480px); button hit targets insufficient (96px mic reduces to 80px on mobile, still large for thumb reach on small phones); form inputs cramped; transcript bubbles not optimized for 320px screens; no touch-specific affordances or gestures.
- **Recommendation:** Phased approach: (1) CSS/HTML mobile-first rewrite, responsive breakpoints at 320/480/768/1024px, 44-48px minimum touch targets, improved spacing — low disruption, immediate gains. (2) Optional progressive enhancement (touch gestures, keyboard handling, state feedback) if Phase 1 insufficient. (3) Conditional: lightweight component library only if major feature expansion. (4) **NOT:** full framework migration (violates user constraint "minimize disruption"; no ROI for current scope).
- **Risk Preservation:** Python backend, WebSocket protocol, audio capture/playback logic, localStorage persistence — all stay unchanged. Phase 1 is CSS-only (zero risk). Phase 2 is JavaScript enhancements (low risk, device testing needed). Deployment simplicity (static files, no build) maintained across all phases.
- **Decision:** Approved Phase 1 (CSS/HTML enhancements) as immediate next step. Estimate 1-2 hours, negligible deployment risk. Assign to Lambert (Frontend Dev). Post-deployment: measure mobile session time, error rates; reassess Phase 2 based on feedback.

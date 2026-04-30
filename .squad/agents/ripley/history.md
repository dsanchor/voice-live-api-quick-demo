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

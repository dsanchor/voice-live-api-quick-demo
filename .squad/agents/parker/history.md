# Parker — History

## Project Context
- **Project:** voice-lice-quick-demo
- **User:** Copilot
- **Stack:** Python backend, HTML/JS frontend, Azure AI Foundry Voice Live API, Azure Container Apps
- **Description:** Voice agent web app connecting to Azure AI Foundry via Voice Live API. Deployed to Azure Container Apps with GH Actions CI/CD. Managed identity with Azure AI User role for Foundry access. Configuration page for agent settings.

## Learnings

### 2026-04-28 — Initial DevOps artifacts created
- **Dockerfile** (`Dockerfile`): Single-stage python:3.11-slim, non-root user, port 8000. Dependencies installed before code copy for layer caching.
- **CI/CD** (`.github/workflows/build-and-push.yml`): Triggers on push to main (build+push) and PRs (build only). Uses `docker/metadata-action@v5` for automatic `latest` + `sha-<commit>` tagging. Auth via `GITHUB_TOKEN` — no additional secrets needed.
- **Infra script** (`infra/deploy.sh`): Idempotent bash script deploying Azure Container Apps with system-assigned managed identity. Assigns `Azure AI User` role on the Foundry resource. GHCR credentials passed as flags (not stored in repo).
- **README.md**: Full project docs with architecture diagram, local dev, deployment, and structure reference.
- **Key decision**: No app-level secrets/env-vars on the Container App — the frontend config page supplies runtime parameters, and the managed identity handles Foundry auth.

### 2026-04-28T16:19:15Z — Manifest Complete & Integration Locked
- **Decisions finalized** (see `.squad/decisions.md`)
- **Team sync:** Backend confirmed managed identity availability and 0.0.0.0:8000 binding, frontend confirmed static asset delivery
- **Integration bugs fixed by Coordinator:** camelCase→snake_case config mapping, status field name mismatch, AzureStandardVoice type, agent_version default
- **Orchestration log** written at `.squad/orchestration-log/2026-04-28T16:19:15Z-parker.md`
- **Status:** Ready for Azure Container Apps deployment

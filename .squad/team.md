# Squad Team

> voice-lice-quick-demo — Voice agent web app using Azure AI Foundry Voice Live API

## Coordinator

| Name | Role | Notes |
|------|------|-------|
| Squad | Coordinator | Routes work, enforces handoffs and reviewer gates. |

## Members

| Name | Role | Charter | Status |
|------|------|---------|--------|
| Ripley | Lead | .squad/agents/ripley/charter.md | 🏗️ Active |
| Dallas | Backend Dev | .squad/agents/dallas/charter.md | 🔧 Active |
| Lambert | Frontend Dev | .squad/agents/lambert/charter.md | ⚛️ Active |
| Parker | DevOps | .squad/agents/parker/charter.md | ⚙️ Active |
| Kane | Tester | .squad/agents/kane/charter.md | 🧪 Active |
| Scribe | Scribe | .squad/agents/scribe/charter.md | 📋 Active |
| Ralph | Work Monitor | .squad/agents/ralph/charter.md | 🔄 Active |

## Project Context

- **Project:** voice-lice-quick-demo
- **User:** Copilot
- **Created:** 2026-04-28
- **Stack:** Python backend, HTML/JS frontend, Azure AI Foundry Voice Live API, Azure Container Apps
- **Description:** A web application with a frontend that connects to an Azure AI Foundry Agent via voice using the Voice Live API. Deployed to Azure Container Apps with GitHub Actions CI/CD pushing to GitHub Packages registry. Uses managed identity for Foundry resource access (Azure AI User role). Includes a configuration page for agent settings (mandatory and optional parameters).

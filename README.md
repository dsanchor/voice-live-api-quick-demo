# Voice Agent — Azure AI Foundry Voice Live API

A web application that connects users to an AI voice agent powered by Azure AI Foundry's Voice Live API. Built with a Python/FastAPI backend and vanilla HTML/JS frontend, deployed to Azure Container Apps with managed identity.

## Architecture

```
┌─────────────┐        ┌──────────────────────┐        ┌─────────────────────┐
│   Browser    │◄──────►│  Azure Container Apps │◄──────►│  Azure AI Foundry   │
│  (HTML/JS)   │  HTTP  │  FastAPI (uvicorn)    │  Voice │  Voice Live API     │
│              │  + WS  │  Managed Identity     │  Live  │                     │
└─────────────┘        └──────────────────────┘        └─────────────────────┘
```

- **Frontend** — Static HTML/JS served by FastAPI. Configuration page lets users set agent parameters.
- **Backend** — FastAPI app proxies WebSocket connections to Azure AI Foundry.
- **Identity** — System-assigned managed identity with `Azure AI User` role for Foundry access.
- **CI/CD** — GitHub Actions builds and pushes container images to GitHub Packages (GHCR).

## Local Development

```bash
# Create virtual environment
python -m venv .venv
source .venv/bin/activate   # Linux/macOS
# .venv\Scripts\activate    # Windows

# Install dependencies
pip install -r app/requirements.txt

# Run the server
uvicorn app.main:app --reload --port 8000
```

Open [http://localhost:8000](http://localhost:8000) in your browser.

## Deployment

### CI/CD — GitHub Actions

Pushes to `main` automatically build and push a container image to GHCR:

```
ghcr.io/<owner>/<repo>:latest
ghcr.io/<owner>/<repo>:sha-<commit>
```

Pull requests build the image but do **not** push it.

The workflow lives at `.github/workflows/build-and-push.yml`.

### Infrastructure — Azure Container Apps

Deploy the Azure infrastructure with:

```bash
chmod +x infra/deploy.sh

./infra/deploy.sh \
  --resource-group  my-rg \
  --name            voice-agent \
  --image           ghcr.io/<owner>/<repo>:latest \
  --foundry-resource-id "/subscriptions/<sub>/resourceGroups/<rg>/providers/Microsoft.CognitiveServices/accounts/<name>" \
  --ghcr-username   <github-username> \
  --ghcr-token      <PAT-with-read:packages>
```

Optional flags: `--location` (default `eastus2`), `--env-name`.

Run `./infra/deploy.sh --help` for full usage.

### What the script provisions

| Resource | Details |
|---|---|
| Resource Group | Created if not exists |
| Container Apps Environment | Managed environment for the app |
| Container App | 0.5 CPU, 1 Gi RAM, 0–3 replicas, port 8000, external ingress |
| Managed Identity | System-assigned, with `Azure AI User` on the Foundry resource |

## Environment Variables

The application receives configuration from the frontend (config page), not from server-side environment variables. No secrets need to be set on the Container App.

## Project Structure

```
├── app/
│   ├── main.py               # FastAPI application entry point
│   ├── voice_session.py       # Voice Live API session management
│   └── requirements.txt       # Python dependencies
├── static/
│   ├── index.html             # Landing / config page
│   ├── voice.html             # Voice interaction page
│   ├── css/style.css
│   └── js/
│       ├── config.js
│       ├── voice.js
│       └── audio.js
├── infra/
│   └── deploy.sh              # Azure infrastructure deployment
├── Dockerfile
├── .github/workflows/
│   └── build-and-push.yml     # CI/CD pipeline
└── README.md
```

## License

Internal project.

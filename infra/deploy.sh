#!/usr/bin/env bash
# deploy.sh — Deploy the voice agent app to Azure Container Apps
# Idempotent: safe to run multiple times.
set -euo pipefail

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------
RESOURCE_GROUP=""
LOCATION="eastus2"
CONTAINER_APP_NAME=""
CONTAINER_APP_ENV_NAME=""
IMAGE=""
FOUNDRY_RESOURCE_ID=""

# ---------------------------------------------------------------------------
# Usage
# ---------------------------------------------------------------------------
usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Deploy the voice agent container app to Azure Container Apps.

Required:
  --resource-group        Azure resource group name
  --name                  Container App name
  --image                 Container image (e.g. ghcr.io/owner/repo:latest)
  --foundry-resource-id   Azure AI Foundry resource ID (full resource path, not RG or sub)

Optional:
  --location              Azure region (default: eastus2)
  --env-name              Container Apps environment name (default: <name>-env)
  -h, --help              Show this help message
EOF
  exit 1
}

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --resource-group)   RESOURCE_GROUP="$2";        shift 2 ;;
    --location)         LOCATION="$2";              shift 2 ;;
    --name)             CONTAINER_APP_NAME="$2";    shift 2 ;;
    --env-name)         CONTAINER_APP_ENV_NAME="$2"; shift 2 ;;
    --image)            IMAGE="$2";                 shift 2 ;;
    --foundry-resource-id) FOUNDRY_RESOURCE_ID="$2"; shift 2 ;;
    -h|--help)          usage ;;
    *)                  echo "Unknown option: $1"; usage ;;
  esac
done

# Default environment name derives from app name
CONTAINER_APP_ENV_NAME="${CONTAINER_APP_ENV_NAME:-${CONTAINER_APP_NAME}-env}"

# ---------------------------------------------------------------------------
# Validate required parameters
# ---------------------------------------------------------------------------
missing=()
[[ -z "$RESOURCE_GROUP" ]]      && missing+=("--resource-group")
[[ -z "$CONTAINER_APP_NAME" ]]  && missing+=("--name")
[[ -z "$IMAGE" ]]               && missing+=("--image")
[[ -z "$FOUNDRY_RESOURCE_ID" ]] && missing+=("--foundry-resource-id")

if [[ ${#missing[@]} -gt 0 ]]; then
  echo "Error: missing required parameters: ${missing[*]}"
  usage
fi

echo "=== Deploying ${CONTAINER_APP_NAME} to ${LOCATION} ==="

# ---------------------------------------------------------------------------
# Step 1 — Resource group
# ---------------------------------------------------------------------------
echo ">> Ensuring resource group '${RESOURCE_GROUP}' exists..."
az group create \
  --name "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --output none

# ---------------------------------------------------------------------------
# Step 2 — Container Apps environment
# ---------------------------------------------------------------------------
echo ">> Ensuring Container Apps environment '${CONTAINER_APP_ENV_NAME}' exists..."
if ! az containerapp env show \
      --name "$CONTAINER_APP_ENV_NAME" \
      --resource-group "$RESOURCE_GROUP" \
      --output none 2>/dev/null; then
  az containerapp env create \
    --name "$CONTAINER_APP_ENV_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --location "$LOCATION" \
    --output none
fi

# ---------------------------------------------------------------------------
# Step 3 — Container App (with system-assigned managed identity)
# ---------------------------------------------------------------------------
echo ">> Creating / updating Container App '${CONTAINER_APP_NAME}'..."
az containerapp create \
  --name "$CONTAINER_APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --environment "$CONTAINER_APP_ENV_NAME" \
  --image "$IMAGE" \
  --target-port 8000 \
  --ingress external \
  --min-replicas 0 \
  --max-replicas 3 \
  --cpu 0.5 \
  --memory 1Gi \
  --system-assigned \
  --output none

# ---------------------------------------------------------------------------
# Step 4 — Retrieve managed identity principal ID
# ---------------------------------------------------------------------------
echo ">> Retrieving managed identity principal ID..."
PRINCIPAL_ID=$(az containerapp show \
  --name "$CONTAINER_APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query "identity.principalId" \
  -o tsv)

echo "   Principal ID: ${PRINCIPAL_ID}"

# ---------------------------------------------------------------------------
# Step 5 — Assign Azure AI User role scoped to the AI Foundry resource
# NOTE: The scope is the individual Foundry resource (Microsoft.CognitiveServices/accounts),
#       NOT the resource group or subscription. This follows least-privilege: the managed
#       identity can only access this specific Foundry instance.
# ---------------------------------------------------------------------------
echo ">> Assigning 'Azure AI User' role to managed identity (scoped to Foundry resource)..."
az role assignment create \
  --assignee "$PRINCIPAL_ID" \
  --role "Azure AI User" \
  --scope "$FOUNDRY_RESOURCE_ID" \
  --output none 2>/dev/null || true   # idempotent — ignore "already exists"

# ---------------------------------------------------------------------------
# Step 6 — Print results
# ---------------------------------------------------------------------------
APP_FQDN=$(az containerapp show \
  --name "$CONTAINER_APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query "properties.configuration.ingress.fqdn" \
  -o tsv)

echo ""
echo "=== Deployment complete ==="
echo "App URL:       https://${APP_FQDN}"
echo "Principal ID:  ${PRINCIPAL_ID}"
echo "Image:         ${IMAGE}"
echo ""
echo "The managed identity has 'Azure AI User' scoped to:"
echo "  ${FOUNDRY_RESOURCE_ID}"
echo "(Scope: individual Foundry resource, not resource group or subscription)"

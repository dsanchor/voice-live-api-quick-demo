# Decision: Load Settings from JSON File

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

/**
 * Configuration page logic — localStorage persistence, validation, navigation.
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'voiceAgentConfig';

  const FIELDS = {
    voiceLiveEndpoint: { type: 'text' },
    agentName:         { type: 'text' },
    projectName:       { type: 'text' },
    voiceName:         { type: 'text' },
    agentVersion:      { type: 'text' },
    conversationId:    { type: 'text' },
    foundryResourceOverride:  { type: 'text' },
    authIdentityClientId:     { type: 'text' },
    enableInterimResponses:   { type: 'checkbox' },
    interimResponseInstructions: { type: 'textarea' },
    latencyThreshold:  { type: 'number' },
    enableProactiveGreeting:  { type: 'checkbox' },
    proactiveGreetingText:    { type: 'textarea' },
  };

  const REQUIRED = ['voiceLiveEndpoint', 'agentName', 'projectName'];

  // ---- DOM refs ----
  const form = document.getElementById('configForm');
  const advancedToggle = document.getElementById('advancedToggle');
  const advancedSection = document.getElementById('advancedSection');

  // ---- Collapsible toggle ----
  advancedToggle.addEventListener('click', () => {
    const open = advancedSection.classList.toggle('open');
    advancedToggle.classList.toggle('open', open);
    advancedToggle.setAttribute('aria-expanded', open);
  });

  // ---- Load saved config ----
  function loadConfig() {
    let saved = {};
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch { /* ignore */ }

    for (const [id, meta] of Object.entries(FIELDS)) {
      const el = document.getElementById(id);
      if (!el) continue;

      if (meta.type === 'checkbox') {
        el.checked = id in saved ? saved[id] : el.checked;
      } else {
        if (id in saved) el.value = saved[id];
      }
    }
  }

  // ---- Gather current values ----
  function gatherConfig() {
    const config = {};
    for (const [id, meta] of Object.entries(FIELDS)) {
      const el = document.getElementById(id);
      if (!el) continue;
      if (meta.type === 'checkbox') {
        config[id] = el.checked;
      } else if (meta.type === 'number') {
        config[id] = el.value === '' ? null : Number(el.value);
      } else {
        config[id] = el.value.trim();
      }
    }
    return config;
  }

  // ---- Save to localStorage ----
  function saveConfig(config) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }

  // ---- Validate ----
  function validate() {
    let valid = true;
    for (const id of REQUIRED) {
      const group = document.getElementById(id)?.closest('.form-group');
      const el = document.getElementById(id);
      if (!el || !group) continue;

      const empty = el.value.trim() === '';
      group.classList.toggle('error', empty);
      if (empty) valid = false;
    }
    return valid;
  }

  // Clear error on input
  form.addEventListener('input', (e) => {
    const group = e.target.closest('.form-group');
    if (group) group.classList.remove('error');
  });

  // ---- Submit ----
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!validate()) {
      showToast('Please fill in all required fields.', 'error');
      return;
    }
    const config = gatherConfig();
    saveConfig(config);
    window.location.href = 'voice.html';
  });

  // ---- Toast helper ----
  function showToast(message, type) {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }

  // ---- Load settings from JSON file ----
  const loadSettingsBtn = document.getElementById('loadSettingsBtn');
  const loadSettingsFile = document.getElementById('loadSettingsFile');

  loadSettingsBtn.addEventListener('click', () => loadSettingsFile.click());

  loadSettingsFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      let data;
      try {
        data = JSON.parse(evt.target.result);
      } catch {
        showToast('Invalid JSON file.', 'error');
        loadSettingsFile.value = '';
        return;
      }

      // Validate mandatory fields
      const missing = REQUIRED.filter(k => !data[k] || String(data[k]).trim() === '');
      if (missing.length) {
        showToast(`Missing mandatory fields: ${missing.join(', ')}`, 'error');
        loadSettingsFile.value = '';
        return;
      }

      // Populate form fields
      for (const [id, meta] of Object.entries(FIELDS)) {
        const el = document.getElementById(id);
        if (!el || !(id in data)) continue;

        if (meta.type === 'checkbox') {
          el.checked = Boolean(data[id]);
        } else {
          el.value = data[id] ?? '';
        }

        // Clear any validation errors
        const group = el.closest('.form-group');
        if (group) group.classList.remove('error');
      }

      // Expand advanced section if any advanced fields are present
      const advancedKeys = Object.keys(FIELDS).filter(k => !REQUIRED.includes(k));
      if (advancedKeys.some(k => k in data)) {
        advancedSection.classList.add('open');
        advancedToggle.classList.add('open');
        advancedToggle.setAttribute('aria-expanded', 'true');
      }

      showToast('Settings loaded successfully!', 'success');
      loadSettingsFile.value = '';
    };
    reader.readAsText(file);
  });

  // ---- Init ----
  loadConfig();
})();

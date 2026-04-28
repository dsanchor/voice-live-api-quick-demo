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

  // ---- Init ----
  loadConfig();
})();

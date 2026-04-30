/**
 * Configuration page logic — menu, localStorage persistence, validation, navigation.
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'voiceAgentConfig';
  const CONVERSATIONS_KEY = 'voiceAgentConversations';

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
  const menuView = document.getElementById('menuView');
  const settingsView = document.getElementById('settingsView');
  const newConversationBtn = document.getElementById('newConversationBtn');
  const backToMenuBtn = document.getElementById('backToMenuBtn');
  const savedConversationsList = document.getElementById('savedConversationsList');

  // ---- View management ----
  function showMenu() {
    menuView.classList.remove('hidden');
    settingsView.classList.add('hidden');
    renderSavedConversations();
  }

  function showSettings() {
    menuView.classList.add('hidden');
    settingsView.classList.remove('hidden');
  }

  newConversationBtn.addEventListener('click', () => {
    // Clear conversation ID for a fresh session
    const convIdField = document.getElementById('conversationId');
    if (convIdField) convIdField.value = '';
    showSettings();
  });

  backToMenuBtn.addEventListener('click', showMenu);

  // ---- Saved conversations ----
  function getSavedConversations() {
    try {
      return JSON.parse(localStorage.getItem(CONVERSATIONS_KEY)) || [];
    } catch { return []; }
  }

  function deleteConversation(conversationId) {
    const conversations = getSavedConversations().filter(c => c.conversationId !== conversationId);
    localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(conversations));
    renderSavedConversations();
  }

  function renderSavedConversations() {
    const conversations = getSavedConversations();
    if (!conversations.length) {
      savedConversationsList.innerHTML = '<p class="text-muted">No saved conversations.</p>';
      return;
    }

    // Sort by date descending
    conversations.sort((a, b) => new Date(b.date) - new Date(a.date));

    savedConversationsList.innerHTML = conversations.map(conv => {
      const date = new Date(conv.date);
      const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      const timeStr = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
      const label = conv.label || conv.agentName || 'Unknown Agent';
      return `
        <div class="conversation-card" data-id="${conv.conversationId}">
          <div class="conversation-card-info">
            <span class="conversation-card-name">${escapeHtml(label)}</span>
            <span class="conversation-card-date">${dateStr} at ${timeStr}</span>
          </div>
          <div class="conversation-card-actions">
            <button class="btn btn-primary resume-btn" data-id="${conv.conversationId}">Resume</button>
            <button class="btn btn-danger delete-btn" data-id="${conv.conversationId}" title="Delete">✕</button>
          </div>
        </div>`;
    }).join('');

    // Attach resume handlers
    savedConversationsList.querySelectorAll('.resume-btn').forEach(btn => {
      btn.addEventListener('click', () => resumeConversation(btn.dataset.id));
    });

    // Attach delete handlers
    savedConversationsList.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', () => deleteConversation(btn.dataset.id));
    });
  }

  function resumeConversation(conversationId) {
    const conversations = getSavedConversations();
    const conv = conversations.find(c => c.conversationId === conversationId);
    if (!conv) {
      showToast('Conversation not found.', 'error');
      return;
    }

    // Load settings into the config and set the conversation ID
    const config = { ...conv.settings, conversationId: conv.conversationId };
    saveConfig(config);
    window.location.href = 'voice.html';
  }

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

  // ---- Escape HTML ----
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ---- Load settings from JSON file ----
  const loadSettingsFile = document.getElementById('loadSettingsFile');

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
  renderSavedConversations();
})();

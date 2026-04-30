/**
 * Voice interaction page — WebSocket, mic control, transcript, playback.
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'voiceAgentConfig';

  // ---- Load config or redirect ----
  let config;
  try {
    config = JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch { /* ignore */ }

  if (!config || !config.voiceLiveEndpoint || !config.agentName || !config.projectName) {
    window.location.href = 'index.html';
    return;
  }

  // ---- DOM refs ----
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const micButton = document.getElementById('micButton');
  const micLabel = document.getElementById('micLabel');
  const transcript = document.getElementById('transcript');
  const thinkingIndicator = document.getElementById('thinkingIndicator');
  const endSessionBtn = document.getElementById('endSessionBtn');
  const sessionInfo = document.getElementById('sessionInfo');
  const toastContainer = document.getElementById('toastContainer');

  // ---- State ----
  let ws = null;
  let micCapture = null;
  let audioPlayer = null;
  let micActive = false;
  let sessionReady = false;
  let currentState = 'idle'; // idle | listening | processing | speaking

  // ---- Helpers ----

  function setConnectionStatus(state) {
    statusDot.className = `status-dot ${state}`;
    statusText.textContent = state.charAt(0).toUpperCase() + state.slice(1);
  }

  function setMicState(state) {
    currentState = state;
    micButton.className = `mic-button ${state === 'idle' ? '' : state}`;

    const labels = {
      idle: 'Ready',
      listening: 'Listening…',
      processing: 'Processing…',
      speaking: 'Agent speaking…',
    };
    micLabel.textContent = labels[state] || 'Ready';
    micButton.setAttribute('aria-label', `Microphone — ${micLabel.textContent}`);
  }

  function addMessage(role, text) {
    if (!text || !text.trim()) return;
    const div = document.createElement('div');
    div.className = `transcript-msg ${role}`;
    div.innerHTML = `<div class="bubble">${escapeHtml(text)}</div>`;
    // Insert before thinking indicator
    transcript.insertBefore(div, thinkingIndicator);
    transcript.scrollTop = transcript.scrollHeight;
  }

  function setThinking(visible) {
    thinkingIndicator.classList.toggle('visible', visible);
    if (visible) transcript.scrollTop = transcript.scrollHeight;
  }

  function showToast(message, type = 'error') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ---- WebSocket ----

  function connect() {
    setConnectionStatus('connecting');
    micButton.disabled = true;
    micLabel.textContent = 'Connecting…';

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${proto}//${window.location.host}/ws/voice`);

    ws.onopen = () => {
      setConnectionStatus('connected');
      // Send config as first message — convert camelCase to snake_case for backend
      const payload = {
        type: 'config',
        voicelive_endpoint: config.voiceLiveEndpoint,
        agent_name: config.agentName,
        project_name: config.projectName,
        voice_name: config.voiceName || '',
        agent_version: config.agentVersion || '',
        conversation_id: config.conversationId || '',
        foundry_resource_override: config.foundryResourceOverride || '',
        agent_authentication_identity_client_id: config.authIdentityClientId || '',
        interim_response_enabled: config.enableInterimResponses !== false,
        interim_response_instructions: config.interimResponseInstructions || '',
        latency_threshold_ms: config.latencyThreshold || 100,
        greeting_enabled: config.enableProactiveGreeting !== false,
        proactive_greeting: config.proactiveGreetingText || '',
      };
      ws.send(JSON.stringify(payload));
      micLabel.textContent = 'Waiting for session…';
    };

    ws.onmessage = (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      handleMessage(msg);
    };

    ws.onerror = () => {
      showToast('WebSocket error — check your connection.');
    };

    ws.onclose = (e) => {
      setConnectionStatus('disconnected');
      micButton.disabled = true;
      sessionReady = false;
      if (micActive) stopMic();
      micLabel.textContent = e.wasClean ? 'Session ended' : 'Disconnected';
    };
  }

  function handleMessage(msg) {
    switch (msg.type) {
      case 'session_ready':
        sessionReady = true;
        micButton.disabled = false;
        setMicState('idle');
        if (msg.session_id) {
          sessionInfo.textContent = `Session: ${msg.session_id}`;
        }
        showToast('Session ready — click the mic to start.', 'success');
        break;

      case 'audio':
        if (msg.data) {
          if (!audioPlayer) audioPlayer = new AudioUtils.AudioPlayer();
          audioPlayer.enqueue(msg.data);
        }
        break;

      case 'user_transcript':
        addMessage('user', msg.text);
        break;

      case 'agent_transcript':
        addMessage('agent', msg.text);
        setThinking(false);
        break;

      case 'status':
        setMicState(msg.message || 'idle');
        // Barge-in: flush agent audio when user starts speaking
        if (msg.message === 'listening' && audioPlayer) {
          audioPlayer.flush();
        }
        break;

      case 'response_created':
        setThinking(true);
        break;

      case 'response_done':
        setThinking(false);
        break;

      case 'audio_stop':
        // Barge-in: immediately stop all agent audio playback
        if (audioPlayer) audioPlayer.flush();
        break;

      case 'audio_done':
        // Server finished sending audio for this response
        setMicState('idle');
        break;

      case 'agent_text':
        if (msg.text) addMessage('agent', msg.text);
        setThinking(false);
        break;

      case 'error':
        showToast(msg.message || 'An error occurred.', 'error');
        break;

      default:
        break;
    }
  }

  // ---- Microphone ----

  async function startMic() {
    if (micActive || !sessionReady) return;
    try {
      // Barge-in: stop any agent playback
      if (audioPlayer) audioPlayer.flush();

      micCapture = new AudioUtils.MicCapture((base64Chunk) => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'audio', data: base64Chunk }));
        }
      });
      await micCapture.start();
      micActive = true;
      setMicState('listening');
    } catch (err) {
      showToast('Microphone access denied. Please allow microphone permissions.', 'error');
      console.error('Mic error:', err);
    }
  }

  function stopMic() {
    if (!micActive) return;
    if (micCapture) { micCapture.stop(); micCapture = null; }
    micActive = false;
    setMicState('idle');
  }

  // Toggle mic on button click
  micButton.addEventListener('click', () => {
    if (micActive) {
      stopMic();
    } else {
      startMic();
    }
  });

  // ---- End Session ----

  function endSession() {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'stop' }));
      ws.close();
    }
    stopMic();
    if (audioPlayer) { audioPlayer.close(); audioPlayer = null; }
    setConnectionStatus('disconnected');
    micButton.disabled = true;
    micLabel.textContent = 'Session ended';
    sessionReady = false;
  }

  endSessionBtn.addEventListener('click', endSession);

  // ---- Keyboard shortcut: Space to toggle mic ----
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && e.target === document.body) {
      e.preventDefault();
      micButton.click();
    }
  });

  // ---- Init ----
  connect();
})();

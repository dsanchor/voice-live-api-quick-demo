/**
 * Audio capture & playback utilities for PCM16 @ 24kHz.
 */
const AudioUtils = (function () {
  'use strict';

  const SAMPLE_RATE = 24000;
  const CHANNELS = 1;
  const CHUNK_MS = 50;
  const CHUNK_SAMPLES = (SAMPLE_RATE * CHUNK_MS) / 1000; // 1200

  // AudioWorklet processor source (inline)
  const WORKLET_SOURCE = `
    class PcmCaptureProcessor extends AudioWorkletProcessor {
      constructor() {
        super();
        this._buffer = [];
      }
      process(inputs) {
        const input = inputs[0];
        if (!input || !input[0]) return true;
        const samples = input[0];
        for (let i = 0; i < samples.length; i++) {
          this._buffer.push(samples[i]);
        }
        while (this._buffer.length >= ${CHUNK_SAMPLES}) {
          const chunk = this._buffer.splice(0, ${CHUNK_SAMPLES});
          this.port.postMessage({ samples: new Float32Array(chunk) });
        }
        return true;
      }
    }
    registerProcessor('pcm-capture', PcmCaptureProcessor);
  `;

  /** Convert Float32 [-1,1] to Int16 PCM bytes then base64 */
  function float32ToBase64Pcm16(float32) {
    const int16 = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    const bytes = new Uint8Array(int16.buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /** Decode base64 PCM16 to Float32 array */
  function base64Pcm16ToFloat32(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const int16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / (int16[i] < 0 ? 0x8000 : 0x7FFF);
    }
    return float32;
  }

  // ---- Microphone Capture ----

  class MicCapture {
    constructor(onChunk) {
      this._onChunk = onChunk;
      this._stream = null;
      this._context = null;
      this._source = null;
      this._workletNode = null;
      this._scriptNode = null;
      this._active = false;
    }

    async start() {
      if (this._active) return;

      this._stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: SAMPLE_RATE,
          channelCount: CHANNELS,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      this._context = new AudioContext({ sampleRate: SAMPLE_RATE });
      this._source = this._context.createMediaStreamSource(this._stream);

      // Try AudioWorklet, fall back to ScriptProcessor
      try {
        const blob = new Blob([WORKLET_SOURCE], { type: 'application/javascript' });
        const url = URL.createObjectURL(blob);
        await this._context.audioWorklet.addModule(url);
        URL.revokeObjectURL(url);

        this._workletNode = new AudioWorkletNode(this._context, 'pcm-capture');
        this._workletNode.port.onmessage = (e) => {
          if (this._active) {
            this._onChunk(float32ToBase64Pcm16(e.data.samples));
          }
        };
        this._source.connect(this._workletNode);
        this._workletNode.connect(this._context.destination);
      } catch {
        // Fallback: ScriptProcessorNode
        const bufSize = 4096;
        this._scriptNode = this._context.createScriptProcessor(bufSize, 1, 1);
        let buffer = [];

        this._scriptNode.onaudioprocess = (e) => {
          if (!this._active) return;
          const input = e.inputBuffer.getChannelData(0);
          for (let i = 0; i < input.length; i++) buffer.push(input[i]);

          while (buffer.length >= CHUNK_SAMPLES) {
            const chunk = new Float32Array(buffer.splice(0, CHUNK_SAMPLES));
            this._onChunk(float32ToBase64Pcm16(chunk));
          }
        };
        this._source.connect(this._scriptNode);
        this._scriptNode.connect(this._context.destination);
      }

      this._active = true;
    }

    stop() {
      this._active = false;
      if (this._workletNode) { this._workletNode.disconnect(); this._workletNode = null; }
      if (this._scriptNode) { this._scriptNode.disconnect(); this._scriptNode = null; }
      if (this._source) { this._source.disconnect(); this._source = null; }
      if (this._stream) {
        this._stream.getTracks().forEach((t) => t.stop());
        this._stream = null;
      }
      if (this._context) { this._context.close(); this._context = null; }
    }
  }

  // ---- Audio Playback Queue ----

  class AudioPlayer {
    constructor() {
      this._context = null;
      this._queue = [];
      this._playing = false;
      this._activeSources = new Set();
      this._nextTime = 0;
    }

    _ensureContext() {
      if (!this._context || this._context.state === 'closed') {
        this._context = new AudioContext({ sampleRate: SAMPLE_RATE });
      }
      if (this._context.state === 'suspended') {
        this._context.resume();
      }
    }

    /** Enqueue base64-encoded PCM16 audio for playback */
    enqueue(base64Data) {
      this._ensureContext();
      const float32 = base64Pcm16ToFloat32(base64Data);
      const buffer = this._context.createBuffer(1, float32.length, SAMPLE_RATE);
      buffer.getChannelData(0).set(float32);
      this._queue.push(buffer);
      this._scheduleNext();
    }

    _scheduleNext() {
      if (this._queue.length === 0) {
        if (this._activeSources.size === 0) this._playing = false;
        return;
      }
      this._playing = true;
      const buffer = this._queue.shift();
      const source = this._context.createBufferSource();
      source.buffer = buffer;
      source.connect(this._context.destination);

      const startTime = Math.max(this._context.currentTime, this._nextTime);
      source.start(startTime);
      this._nextTime = startTime + buffer.duration;
      this._activeSources.add(source);

      source.onended = () => {
        this._activeSources.delete(source);
        this._scheduleNext();
      };
    }

    /** Stop all playback immediately (barge-in) */
    flush() {
      this._queue = [];
      this._nextTime = 0;
      for (const source of this._activeSources) {
        try { source.stop(); } catch { /* already stopped */ }
      }
      this._activeSources.clear();
      this._playing = false;
    }

    get isPlaying() {
      return this._playing;
    }

    close() {
      this.flush();
      if (this._context) { this._context.close(); this._context = null; }
    }
  }

  // Public API
  return { MicCapture, AudioPlayer, float32ToBase64Pcm16, base64Pcm16ToFloat32, SAMPLE_RATE };
})();

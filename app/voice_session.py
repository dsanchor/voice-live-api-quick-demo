"""Voice Live SDK session management."""

import asyncio
import base64
import logging
import uuid
from dataclasses import dataclass, field
from typing import Optional

from azure.ai.voicelive.aio import connect
from azure.ai.voicelive.models import (
    AudioEchoCancellation,
    AudioNoiseReduction,
    AzureSemanticVadMultilingual,
    AzureStandardVoice,
    InputAudioFormat,
    InputTextContentPart,
    InterimResponseTrigger,
    LlmInterimResponseConfig,
    MessageItem,
    Modality,
    OutputAudioFormat,
    RequestSession,
    ServerEventType,
)
from azure.identity.aio import DefaultAzureCredential

logger = logging.getLogger(__name__)


@dataclass
class VoiceSessionConfig:
    """Configuration for a Voice Live session."""

    voicelive_endpoint: str
    agent_name: str
    project_name: str
    voice_name: str = "en-US-Ava:DragonHDLatestNeural"
    agent_version: Optional[str] = None
    conversation_id: Optional[str] = None
    foundry_resource_override: Optional[str] = None
    agent_authentication_identity_client_id: Optional[str] = None
    interim_response_enabled: bool = True
    interim_response_instructions: str = "Provide a brief acknowledgment while processing."
    latency_threshold_ms: int = 100
    proactive_greeting: Optional[str] = None
    greeting_enabled: bool = True
    noise_reduction_enabled: bool = False
    echo_cancellation_enabled: bool = False

    @classmethod
    def from_dict(cls, data: dict) -> "VoiceSessionConfig":
        return cls(
            voicelive_endpoint=data["voicelive_endpoint"],
            agent_name=data["agent_name"],
            project_name=data["project_name"],
            voice_name=data.get("voice_name", "en-US-Ava:DragonHDLatestNeural"),
            agent_version=data.get("agent_version") or None,
            conversation_id=data.get("conversation_id"),
            foundry_resource_override=data.get("foundry_resource_override"),
            agent_authentication_identity_client_id=data.get(
                "agent_authentication_identity_client_id"
            ),
            interim_response_enabled=data.get("interim_response_enabled", True),
            interim_response_instructions=data.get(
                "interim_response_instructions",
                "Provide a brief acknowledgment while processing.",
            ),
            latency_threshold_ms=data.get("latency_threshold_ms", 100),
            proactive_greeting=data.get("proactive_greeting"),
            greeting_enabled=data.get("greeting_enabled", True),
            noise_reduction_enabled=data.get("noise_reduction_enabled", False),
            echo_cancellation_enabled=data.get("echo_cancellation_enabled", False),
        )


class VoiceSession:
    """Manages a single Voice Live API session."""

    def __init__(self, config: VoiceSessionConfig, send_to_browser):
        self.config = config
        self.send_to_browser = send_to_browser
        self.session_id = str(uuid.uuid4())
        self.conversation_id: Optional[str] = None
        self._connection = None
        self._credential = None
        self._connection_context = None
        self._receive_task: Optional[asyncio.Task] = None
        self._stopped = False
        self._active_response = False
        self._response_api_done = False

    async def start(self):
        """Connect to Voice Live API and start receiving events."""
        self._credential = DefaultAzureCredential()

        agent_config = {
            "agent_name": self.config.agent_name,
            "agent_version": self.config.agent_version,
            "project_name": self.config.project_name,
        }
        if self.config.conversation_id:
            agent_config["conversation_id"] = self.config.conversation_id
        if self.config.foundry_resource_override:
            agent_config["foundry_resource_override"] = self.config.foundry_resource_override
        if self.config.agent_authentication_identity_client_id:
            agent_config["authentication_identity_client_id"] = (
                self.config.agent_authentication_identity_client_id
            )

        logger.info(
            "Connecting to Voice Live: endpoint=%s, agent=%s, project=%s",
            self.config.voicelive_endpoint,
            self.config.agent_name,
            self.config.project_name,
        )

        self._connection_context = connect(
            endpoint=self.config.voicelive_endpoint,
            credential=self._credential,
            api_version="2026-01-01-preview",
            agent_config=agent_config,
        )
        self._connection = await self._connection_context.__aenter__()

        # Configure session
        session_kwargs = {
            "modalities": [Modality.TEXT, Modality.AUDIO],
            "input_audio_format": InputAudioFormat.PCM16,
            "output_audio_format": OutputAudioFormat.PCM16,
        }

        if self.config.interim_response_enabled:
            session_kwargs["interim_response"] = LlmInterimResponseConfig(
                triggers=[InterimResponseTrigger.TOOL, InterimResponseTrigger.LATENCY],
                latency_threshold_ms=self.config.latency_threshold_ms,
                instructions=self.config.interim_response_instructions,
            )

        if self.config.voice_name:
            session_kwargs["voice"] = AzureStandardVoice(name=self.config.voice_name)

        session_kwargs["turn_detection"] = AzureSemanticVadMultilingual()

        if self.config.noise_reduction_enabled:
            session_kwargs["input_audio_noise_reduction"] = AudioNoiseReduction(
                type="azure_deep_noise_suppression"
            )

        if self.config.echo_cancellation_enabled:
            session_kwargs["input_audio_echo_cancellation"] = AudioEchoCancellation()

        session_config = RequestSession(**session_kwargs)
        await self._connection.session.update(session=session_config)

        logger.info("Voice Live session configured: %s", self.session_id)

        # Start receiving events in background
        self._receive_task = asyncio.create_task(self._receive_loop())

        await self.send_to_browser({"type": "session_ready", "session_id": self.session_id})

        # Send proactive greeting if configured
        if self.config.greeting_enabled and self.config.proactive_greeting:
            await self._send_greeting()

    async def _send_greeting(self):
        """Send a proactive greeting to trigger agent speech."""
        try:
            await self._connection.conversation.item.create(
                item=MessageItem(
                    role="system",
                    content=[InputTextContentPart(text=self.config.proactive_greeting)],
                )
            )
            await self._connection.response.create()
            logger.info("Proactive greeting sent")
        except Exception as e:
            logger.error("Failed to send greeting: %s", e)

    async def send_audio(self, audio_base64: str):
        """Forward audio from browser to Voice Live."""
        if self._stopped or not self._connection:
            return
        try:
            await self._connection.input_audio_buffer.append(audio=audio_base64)
        except Exception as e:
            logger.error("Error sending audio to Voice Live: %s", e)
            await self.send_to_browser({"type": "error", "message": str(e)})

    async def _receive_loop(self):
        """Receive events from Voice Live and forward to browser."""
        try:
            async for event in self._connection:
                if self._stopped:
                    break
                await self._handle_event(event)
        except asyncio.CancelledError:
            logger.info("Receive loop cancelled for session %s", self.session_id)
        except Exception as e:
            if not self._stopped:
                logger.error("Error in receive loop: %s", e)
                await self.send_to_browser({"type": "error", "message": str(e)})

    async def _handle_event(self, event):
        """Handle a single Voice Live event."""
        try:
            event_type = event.type

            if event_type == ServerEventType.RESPONSE_AUDIO_DELTA:
                audio_data = event.delta if hasattr(event, "delta") else None
                if audio_data:
                    if isinstance(audio_data, bytes):
                        audio_data = base64.b64encode(audio_data).decode("utf-8")
                    await self.send_to_browser({"type": "audio", "data": audio_data})

            elif event_type == ServerEventType.CONVERSATION_ITEM_INPUT_AUDIO_TRANSCRIPTION_COMPLETED:
                transcript = getattr(event, "transcript", "") or event.get("transcript", "")
                if transcript:
                    await self.send_to_browser({"type": "user_transcript", "text": transcript})

            elif event_type == ServerEventType.RESPONSE_AUDIO_TRANSCRIPT_DONE:
                transcript = getattr(event, "transcript", "") or event.get("transcript", "")
                if transcript:
                    await self.send_to_browser({"type": "agent_transcript", "text": transcript})

            elif event_type == ServerEventType.RESPONSE_CREATED:
                self._active_response = True
                self._response_api_done = False
                # Capture conversation_id from the first response
                if not self.conversation_id:
                    response_obj = getattr(event, "response", None)
                    cid = getattr(response_obj, "conversation_id", None) if response_obj else None
                    if cid:
                        self.conversation_id = cid
                        logger.info("Captured conversation_id: %s", cid)
                        await self.send_to_browser({"type": "conversation_id", "id": cid})
                await self.send_to_browser({"type": "response_created"})
                await self.send_to_browser({"type": "status", "message": "processing"})

            elif event_type == ServerEventType.RESPONSE_DONE:
                self._active_response = False
                self._response_api_done = True
                await self.send_to_browser({"type": "response_done"})
                await self.send_to_browser({"type": "status", "message": "listening"})

            elif event_type == ServerEventType.RESPONSE_AUDIO_DONE:
                await self.send_to_browser({"type": "audio_done"})

            elif event_type == ServerEventType.RESPONSE_TEXT_DONE:
                transcript = getattr(event, "text", "") or ""
                if transcript:
                    await self.send_to_browser({"type": "agent_text", "text": transcript})

            elif event_type == ServerEventType.CONVERSATION_ITEM_CREATED:
                item = getattr(event, "item", None)
                item_id = getattr(item, "id", None) if item else None
                logger.debug("Conversation item created: %s", item_id)
                await self.send_to_browser({
                    "type": "conversation_item_created",
                    "item_id": item_id,
                })

            elif event_type == ServerEventType.INPUT_AUDIO_BUFFER_SPEECH_STARTED:
                await self.send_to_browser({"type": "status", "message": "listening"})
                # Barge-in: cancel current response only if one is active
                if self._active_response and not self._response_api_done:
                    try:
                        await self._connection.response.cancel()
                    except Exception as e:
                        if "no active response" in str(e).lower():
                            logger.debug("Cancel ignored - response already completed")
                        else:
                            logger.warning("Cancel failed: %s", e)
                # Clear input buffer to discard residual audio from canceled response
                try:
                    await self._connection.input_audio_buffer.clear()
                except Exception as e:
                    logger.debug("input_audio_buffer.clear failed: %s", e)

            elif event_type == ServerEventType.INPUT_AUDIO_BUFFER_SPEECH_STOPPED:
                await self.send_to_browser({"type": "status", "message": "processing"})

            elif event_type == ServerEventType.SESSION_CREATED:
                await self.send_to_browser({"type": "status", "message": "ready"})

            elif event_type == ServerEventType.ERROR:
                error_msg = getattr(event, "message", str(event))
                logger.error("Voice Live error: %s", error_msg)
                await self.send_to_browser({"type": "error", "message": error_msg})

        except Exception as e:
            logger.warning("Error handling event %s: %s", getattr(event, "type", "unknown"), e)

    async def stop(self):
        """Clean up the Voice Live session."""
        if self._stopped:
            return
        self._stopped = True
        logger.info("Stopping voice session: %s", self.session_id)

        if self._receive_task and not self._receive_task.done():
            self._receive_task.cancel()
            try:
                await self._receive_task
            except asyncio.CancelledError:
                pass

        if self._connection_context:
            try:
                await self._connection_context.__aexit__(None, None, None)
            except Exception as e:
                logger.warning("Error closing Voice Live connection: %s", e)
            self._connection_context = None
            self._connection = None

        if self._credential:
            try:
                await self._credential.close()
            except Exception:
                pass
            self._credential = None

        logger.info("Voice session stopped: %s", self.session_id)

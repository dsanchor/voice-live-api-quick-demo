"""FastAPI backend for Azure AI Voice Live web agent."""

import json
import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles

from voice_session import VoiceSession, VoiceSessionConfig

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(title="Voice Live Agent", version="1.0.0")


@app.get("/health")
async def health():
    """Health check endpoint for Container Apps probes."""
    return {"status": "healthy"}


@app.websocket("/ws/voice")
async def websocket_voice(websocket: WebSocket):
    """WebSocket endpoint for voice communication.

    Protocol:
    1. Browser sends a 'config' message with Voice Live parameters
    2. Backend connects to Voice Live API
    3. Browser sends 'audio' messages with base64 PCM16 24kHz data
    4. Backend forwards audio events and transcripts back
    5. Browser sends 'stop' or disconnects to end session
    """
    await websocket.accept()
    session: VoiceSession | None = None

    async def send_to_browser(msg: dict):
        """Send a JSON message to the browser WebSocket."""
        try:
            await websocket.send_json(msg)
        except Exception:
            pass

    try:
        # Wait for config message
        raw = await websocket.receive_text()
        msg = json.loads(raw)

        if msg.get("type") != "config":
            await send_to_browser({"type": "error", "message": "First message must be type 'config'"})
            await websocket.close(code=1008)
            return

        # Validate required fields
        missing = [f for f in ("voicelive_endpoint", "agent_name", "project_name") if not msg.get(f)]
        if missing:
            await send_to_browser({
                "type": "error",
                "message": f"Missing required config fields: {', '.join(missing)}",
            })
            await websocket.close(code=1008)
            return

        config = VoiceSessionConfig.from_dict(msg)
        session = VoiceSession(config, send_to_browser)

        await send_to_browser({"type": "status", "message": "connecting"})
        await session.start()

        # Main message loop
        while True:
            raw = await websocket.receive_text()
            msg = json.loads(raw)
            msg_type = msg.get("type")

            if msg_type == "audio":
                audio_data = msg.get("data", "")
                if audio_data:
                    await session.send_audio(audio_data)

            elif msg_type == "stop":
                logger.info("Client requested stop")
                break

            else:
                logger.warning("Unknown message type: %s", msg_type)

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected")
    except json.JSONDecodeError as e:
        logger.error("Invalid JSON from client: %s", e)
        await send_to_browser({"type": "error", "message": "Invalid JSON"})
    except Exception as e:
        logger.error("WebSocket error: %s", e, exc_info=True)
        await send_to_browser({"type": "error", "message": f"Server error: {e}"})
    finally:
        if session:
            await session.stop()
        try:
            await websocket.close()
        except Exception:
            pass


# Mount static files last so API routes take priority
# Check both local-dev path (sibling of app/) and Docker path
static_dir = Path(__file__).parent.parent / "static"
if not static_dir.exists():
    static_dir = Path(__file__).parent / "static"
if static_dir.exists():
    app.mount("/", StaticFiles(directory=str(static_dir), html=True), name="static")
else:
    logger.warning("Static directory not found — no frontend will be served")


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)

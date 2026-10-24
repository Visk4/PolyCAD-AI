"""
CAD API router — all endpoints for the PolyCAD AI pipeline.

Endpoints:
  POST /api/generate        — prompt → LLM → compile (with auto-heal) → STL + params
  POST /api/recompile       — substitute params → recompile → new STL (no LLM call)
  POST /api/describe-image  — image → LLM (multimodal) → text description
  GET  /api/stl/{id}        — serve a compiled STL file
  GET  /api/scad/{id}       — serve the OpenSCAD source
  POST /api/chat/session    — create a new chat session
  GET  /api/chat/{session_id}/history — get chat history for a session
"""

import uuid
import logging
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import Response
from pydantic import BaseModel

from app.config import settings
from app.services.llm import create_provider
from app.services.openscad import compile_scad
from app.services.params import parse_params, substitute_params
from app.services.pipeline import generate_with_heal_loop
from app.services.chat_memory import get_chat_memory

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["cad"])

# ── Ensure output directory exists ──────────────────────────────
_output_dir = Path(settings.output_dir)
_output_dir.mkdir(parents=True, exist_ok=True)


# ── Request / Response models ──────────────────────────────────

class GenerateRequest(BaseModel):
    prompt: str
    session_id: str | None = None  # chat session for history


class RecompileRequest(BaseModel):
    id: str
    params: dict[str, float]


class AttemptResponse(BaseModel):
    attempt: int
    code: str
    error: str | None
    success: bool


class GenerateResponse(BaseModel):
    id: str
    status: str  # "success" | "failed"
    code: str
    params: list[dict]
    stl_url: str | None
    scad_url: str | None
    attempts: list[AttemptResponse]
    session_id: str  # returned so frontend can track


class RecompileResponse(BaseModel):
    id: str
    status: str
    code: str
    stl_url: str | None
    error: str | None


class SessionResponse(BaseModel):
    session_id: str


class HistoryResponse(BaseModel):
    session_id: str
    messages: list[dict]


# ────────────────────────────────────────────────────────────────
# POST /api/describe-image — image → text description via multimodal LLM
# ────────────────────────────────────────────────────────────────
class DescribeImageResponse(BaseModel):
    description: str
    session_id: str | None


@router.post("/describe-image", response_model=DescribeImageResponse)
async def describe_image(
    image: UploadFile = File(...),
    session_id: str | None = None,
):
    """
    Accept an image upload, send it to Gemini (multimodal), and return
    a text description of the 3D object suitable for the generate endpoint.
    """
    # Validate file type
    allowed = {"image/jpeg", "image/png", "image/webp", "image/gif"}
    if image.content_type not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported image type: {image.content_type}. Use JPEG, PNG, WebP, or GIF.",
        )

    # Read image bytes
    image_bytes = await image.read()
    if len(image_bytes) > 10 * 1024 * 1024:  # 10MB limit
        raise HTTPException(status_code=400, detail="Image too large (max 10MB)")

    # Create LLM provider
    try:
        llm = create_provider()
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))

    # Describe the image
    try:
        description = llm.describe_image(image_bytes, image.content_type)
    except NotImplementedError:
        raise HTTPException(
            status_code=400,
            detail=f"Image input not supported by {settings.llm_provider} provider. Use Gemini.",
        )
    except Exception as e:
        logger.error(f"Image description failed: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to describe image: {str(e)}")

    # Store in chat memory if session provided
    memory = get_chat_memory()
    session = memory.get_or_create_session(session_id)
    memory.add_user_message(session.session_id, f"[Uploaded image for description]")
    memory.add_assistant_message(session.session_id, f"Image description: {description}")

    return DescribeImageResponse(
        description=description,
        session_id=session.session_id,
    )


# ────────────────────────────────────────────────────────────────
# POST /api/chat/session — create new session
# ────────────────────────────────────────────────────────────────
@router.post("/chat/session", response_model=SessionResponse)
async def create_session():
    """Create a new chat session and return its ID."""
    memory = get_chat_memory()
    session = memory.get_or_create_session()
    return SessionResponse(session_id=session.session_id)


# ────────────────────────────────────────────────────────────────
# GET /api/chat/{session_id}/history — get chat history
# ────────────────────────────────────────────────────────────────
@router.get("/chat/{session_id}/history", response_model=HistoryResponse)
async def get_history(session_id: str):
    """Get all messages for a chat session."""
    memory = get_chat_memory()
    messages = memory.get_history(session_id)
    return HistoryResponse(session_id=session_id, messages=messages)


# ────────────────────────────────────────────────────────────────
# POST /api/generate
# ────────────────────────────────────────────────────────────────
@router.post("/generate", response_model=GenerateResponse)
async def generate(req: GenerateRequest):
    """
    Full pipeline: prompt → LLM → compile → auto-heal → STL + params.
    Now with chat memory: stores messages and uses FAISS for context.
    """
    logger.info(f"Generate request: {req.prompt[:100]}")

    # Get or create chat session
    memory = get_chat_memory()
    session = memory.get_or_create_session(req.session_id)
    session_id = session.session_id

    # Store user message in chat history
    memory.add_user_message(session_id, req.prompt)

    # Build enriched prompt with conversation history + similar past designs
    enriched_prompt = memory.build_context_from_history(session_id, req.prompt)

    # Create LLM provider (reads config from .env)
    try:
        llm = create_provider()
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))

    # Run the pipeline with enriched context
    result = generate_with_heal_loop(enriched_prompt, llm)

    # Generate a file ID and save outputs
    file_id = str(uuid.uuid4())[:8]

    stl_url = None
    scad_url = None

    if result.success and result.stl_bytes:
        # Save STL
        stl_path = _output_dir / f"{file_id}.stl"
        stl_path.write_bytes(result.stl_bytes)
        stl_url = f"/api/stl/{file_id}"

    # Always save the SCAD (even on failure, for debugging)
    scad_path = _output_dir / f"{file_id}.scad"
    scad_path.write_text(result.code, encoding="utf-8")
    scad_url = f"/api/scad/{file_id}"

    # Store assistant response in chat history
    summary = f"Generated model: {req.prompt[:100]}"
    if result.success:
        summary += f" ✓ (compiled on attempt {len(result.attempts)})"
    else:
        summary += " ✗ (compilation failed)"
    memory.add_assistant_message(session_id, summary, model_id=file_id)

    # Index successful prompts in FAISS for future similarity search
    if result.success:
        memory.index_prompt(
            session_id=session_id,
            prompt=req.prompt,
            code_snippet=result.code,
            model_id=file_id,
        )

    return GenerateResponse(
        id=file_id,
        status="success" if result.success else "failed",
        code=result.code,
        params=result.params,
        stl_url=stl_url,
        scad_url=scad_url,
        session_id=session_id,
        attempts=[
            AttemptResponse(
                attempt=a.attempt,
                code=a.code,
                error=a.error,
                success=a.success,
            )
            for a in result.attempts
        ],
    )


# ────────────────────────────────────────────────────────────────
# POST /api/recompile
# ────────────────────────────────────────────────────────────────
@router.post("/recompile", response_model=RecompileResponse)
async def recompile(req: RecompileRequest):
    """
    Substitute parameter values and recompile. No LLM call.
    """
    # Load the existing SCAD source
    scad_path = _output_dir / f"{req.id}.scad"
    if not scad_path.exists():
        raise HTTPException(status_code=404, detail="SCAD source not found for this ID")

    original_code = scad_path.read_text(encoding="utf-8")

    # Substitute new parameter values
    updated_code = substitute_params(original_code, req.params)

    # Recompile
    result = compile_scad(updated_code)

    if result.success and result.stl_bytes:
        # Overwrite the STL and SCAD files
        stl_path = _output_dir / f"{req.id}.stl"
        stl_path.write_bytes(result.stl_bytes)
        scad_path.write_text(updated_code, encoding="utf-8")

        return RecompileResponse(
            id=req.id,
            status="success",
            code=updated_code,
            stl_url=f"/api/stl/{req.id}",
            error=None,
        )
    else:
        return RecompileResponse(
            id=req.id,
            status="failed",
            code=updated_code,
            stl_url=None,
            error=result.stderr,
        )


# ────────────────────────────────────────────────────────────────
# GET /api/stl/{file_id}
# ────────────────────────────────────────────────────────────────
@router.get("/stl/{file_id}")
async def get_stl(file_id: str):
    """Serve a compiled STL file by its ID."""
    stl_path = _output_dir / f"{file_id}.stl"
    if not stl_path.exists():
        raise HTTPException(status_code=404, detail="STL file not found")
    return Response(
        content=stl_path.read_bytes(),
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{file_id}.stl"'},
    )


# ────────────────────────────────────────────────────────────────
# GET /api/scad/{file_id}
# ────────────────────────────────────────────────────────────────
@router.get("/scad/{file_id}")
async def get_scad(file_id: str):
    """Serve the OpenSCAD source file by its ID."""
    scad_path = _output_dir / f"{file_id}.scad"
    if not scad_path.exists():
        raise HTTPException(status_code=404, detail="SCAD file not found")
    return Response(
        content=scad_path.read_bytes(),
        media_type="text/plain",
        headers={"Content-Disposition": f'attachment; filename="{file_id}.scad"'},
    )

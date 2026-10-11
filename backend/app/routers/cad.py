"""
CAD API router — all endpoints for the PolyCAD AI pipeline.

Endpoints:
  POST /api/generate   — prompt → LLM → compile (with auto-heal) → STL + params
  POST /api/recompile  — substitute params → recompile → new STL (no LLM call)
  GET  /api/stl/{id}   — serve a compiled STL file
  GET  /api/scad/{id}  — serve the OpenSCAD source
"""

import uuid
import logging
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from app.config import settings
from app.services.llm import create_provider
from app.services.openscad import compile_scad
from app.services.params import parse_params, substitute_params
from app.services.pipeline import generate_with_heal_loop

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["cad"])

# ── Ensure output directory exists ──────────────────────────────
_output_dir = Path(settings.output_dir)
_output_dir.mkdir(parents=True, exist_ok=True)


# ── Request / Response models ──────────────────────────────────

class GenerateRequest(BaseModel):
    prompt: str
    history: list[dict] | None = None  # reserved for future multi-turn


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


class RecompileResponse(BaseModel):
    id: str
    status: str
    code: str
    stl_url: str | None
    error: str | None


# ────────────────────────────────────────────────────────────────
# POST /api/generate
# ────────────────────────────────────────────────────────────────
@router.post("/generate", response_model=GenerateResponse)
async def generate(req: GenerateRequest):
    """
    Full pipeline: prompt → LLM → compile → auto-heal → STL + params.
    """
    logger.info(f"Generate request: {req.prompt[:100]}")

    # Create LLM provider (reads config from .env)
    try:
        llm = create_provider()
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))

    # Run the pipeline
    result = generate_with_heal_loop(req.prompt, llm)

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

    return GenerateResponse(
        id=file_id,
        status="success" if result.success else "failed",
        code=result.code,
        params=result.params,
        stl_url=stl_url,
        scad_url=scad_url,
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

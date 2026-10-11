"""
PolyCAD AI — FastAPI application entry point.

Run with:  uvicorn app.main:app --reload --port 8000
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers.cad import router as cad_router

app = FastAPI(
    title="PolyCAD AI",
    description="Text → Parametric 3D CAD via OpenSCAD",
    version="0.1.0",
)

# ── CORS — allow the Vite dev server ────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Register routers ───────────────────────────────────────────
app.include_router(cad_router)


@app.get("/health")
async def health():
    """Quick health check — also confirms OpenSCAD path is configured."""
    return {
        "status": "ok",
        "openscad_path": settings.openscad_path,
        "llm_provider": settings.llm_provider,
        "llm_model": settings.llm_model,
    }

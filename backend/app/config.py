"""
Configuration module — loads settings from .env file using Pydantic Settings.
All paths, API keys, and LLM options live here as typed, validated fields.
"""

from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables / .env file."""

    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parent.parent / ".env",  # backend/.env
        env_file_encoding="utf-8",
        extra="ignore",  # ignore env vars we don't define
    )

    # ── OpenSCAD ────────────────────────────────────────────────
    openscad_path: str = "D:/OpenSCAD (Nightly)/openscad.com"
    openscad_timeout: int = 30  # seconds

    # ── LLM ─────────────────────────────────────────────────────
    llm_provider: str = "gemini"        # "gemini" | "groq"
    llm_model: str = "gemini-2.0-flash"
    gemini_api_key: str = ""
    groq_api_key: str = ""

    # ── Output directory for generated STL/SCAD files ───────────
    output_dir: str = str(Path(__file__).resolve().parent.parent / "output")


# Singleton instance — import this everywhere
settings = Settings()

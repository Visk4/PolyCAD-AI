"""
OpenSCAD compile service.

Responsibilities:
  - Validate code safety (reject include/use/import)
  - Write code to a temp .scad file
  - Invoke OpenSCAD CLI to compile → STL
  - Return (success, stl_bytes | None, stderr)
"""

import re
import subprocess
import tempfile
from pathlib import Path
from dataclasses import dataclass

from app.config import settings


# Regex that catches include<...>, use<...>, or import("...")
# These are forbidden because they could read arbitrary files.
_UNSAFE_PATTERN = re.compile(
    r'\b(include|use)\s*<[^>]*>|\bimport\s*\(', re.IGNORECASE
)


@dataclass
class CompileResult:
    """Result of an OpenSCAD compilation attempt."""
    success: bool
    stl_bytes: bytes | None  # raw STL binary, None on failure
    stderr: str              # compiler output (errors / warnings)


def validate_code(code: str) -> str | None:
    """
    Check code for unsafe constructs.
    Returns an error message if unsafe, None if OK.
    """
    match = _UNSAFE_PATTERN.search(code)
    if match:
        return f"Forbidden construct detected: '{match.group()}'. Code must be self-contained."
    return None


def compile_scad(code: str) -> CompileResult:
    """
    Compile OpenSCAD source code to an STL file.

    Steps:
      1. Validate code safety.
      2. Write code to a temp .scad file.
      3. Run OpenSCAD CLI with --backend=Manifold.
      4. Read the resulting STL or capture errors.

    Returns a CompileResult with success flag, STL bytes, and stderr.
    """
    # ── Safety check ────────────────────────────────────────────
    safety_error = validate_code(code)
    if safety_error:
        return CompileResult(success=False, stl_bytes=None, stderr=safety_error)

    # ── Write to temp dir ───────────────────────────────────────
    tmp_dir = tempfile.mkdtemp(prefix="polycad_")
    scad_path = Path(tmp_dir) / "model.scad"
    stl_path = Path(tmp_dir) / "model.stl"

    scad_path.write_text(code, encoding="utf-8")

    # ── Build command ───────────────────────────────────────────
    cmd = [
        settings.openscad_path,
        "--backend=Manifold",
        "-o", str(stl_path),
        str(scad_path),
    ]

    # ── Run OpenSCAD ────────────────────────────────────────────
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=settings.openscad_timeout,
        )
    except FileNotFoundError:
        return CompileResult(
            success=False,
            stl_bytes=None,
            stderr=f"OpenSCAD not found at: {settings.openscad_path}",
        )
    except subprocess.TimeoutExpired:
        return CompileResult(
            success=False,
            stl_bytes=None,
            stderr=f"OpenSCAD timed out after {settings.openscad_timeout}s. "
                   "Try reducing $fn or simplifying the model.",
        )

    # ── Check result ────────────────────────────────────────────
    stderr = result.stderr.strip()

    if stl_path.exists() and stl_path.stat().st_size > 0:
        stl_bytes = stl_path.read_bytes()
        return CompileResult(success=True, stl_bytes=stl_bytes, stderr=stderr)
    else:
        return CompileResult(success=False, stl_bytes=None, stderr=stderr)

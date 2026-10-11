"""
Generate pipeline — orchestrates the full LLM → compile → auto-heal loop.

Flow:
  1. Send user prompt to LLM with system prompt.
  2. Validate + compile the returned OpenSCAD code.
  3. On failure, send code + error back to LLM (fix prompt). Retry up to 3x.
  4. Return final code, params, STL bytes, and the full attempt log.
"""

import logging
from dataclasses import dataclass, field
from typing import Any

from app.prompts import SYSTEM_PROMPT, FIX_PROMPT
from app.services.llm import LLMProvider
from app.services.openscad import compile_scad
from app.services.params import parse_params

logger = logging.getLogger(__name__)

MAX_HEAL_ATTEMPTS = 3


@dataclass
class Attempt:
    """Record of a single generation/fix attempt."""
    attempt: int
    code: str
    error: str | None
    success: bool


@dataclass
class PipelineResult:
    """Full result of the generate pipeline."""
    success: bool
    code: str              # final code (last attempt)
    stl_bytes: bytes | None
    params: list[dict[str, Any]]
    attempts: list[Attempt] = field(default_factory=list)


def generate_with_heal_loop(prompt: str, llm: LLMProvider) -> PipelineResult:
    """
    Run the full generate + auto-heal pipeline.

    Args:
        prompt: User's natural language description.
        llm: An initialized LLMProvider instance.

    Returns:
        PipelineResult with the final code, STL bytes, params, and attempt log.
    """
    attempts: list[Attempt] = []
    code = ""
    last_error = ""

    for i in range(1, MAX_HEAL_ATTEMPTS + 1):
        logger.info(f"Pipeline attempt {i}/{MAX_HEAL_ATTEMPTS}")

        # ── Step 1: Generate or fix code ────────────────────────
        try:
            if i == 1:
                # First attempt: generate from user prompt
                code = llm.generate(SYSTEM_PROMPT, prompt)
            else:
                # Heal attempt: send code + error back to LLM
                fix_message = FIX_PROMPT.format(code=code, stderr=last_error)
                code = llm.generate(SYSTEM_PROMPT, fix_message)
        except Exception as e:
            logger.error(f"LLM call failed on attempt {i}: {e}")
            attempts.append(Attempt(
                attempt=i, code=code, error=f"LLM error: {str(e)}", success=False
            ))
            continue

        # ── Step 2: Compile ─────────────────────────────────────
        result = compile_scad(code)

        if result.success:
            logger.info(f"Compile succeeded on attempt {i}")
            attempts.append(Attempt(
                attempt=i, code=code, error=None, success=True
            ))
            return PipelineResult(
                success=True,
                code=code,
                stl_bytes=result.stl_bytes,
                params=parse_params(code),
                attempts=attempts,
            )
        else:
            logger.warning(f"Compile failed on attempt {i}: {result.stderr[:200]}")
            last_error = result.stderr
            attempts.append(Attempt(
                attempt=i, code=code, error=result.stderr, success=False
            ))

    # All attempts exhausted
    return PipelineResult(
        success=False,
        code=code,
        stl_bytes=None,
        params=parse_params(code),
        attempts=attempts,
    )

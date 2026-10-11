/**
 * API client — thin fetch wrappers for all backend endpoints.
 * 
 * Base URL defaults to localhost:8000 (FastAPI dev server).
 */

import type { GenerateResponse, RecompileResponse } from "../types";

const API_BASE = "http://localhost:8000";

/**
 * POST /api/generate — send a prompt, get code + STL + params.
 */
export async function apiGenerate(prompt: string): Promise<GenerateResponse> {
  const res = await fetch(`${API_BASE}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Generate failed (${res.status}): ${detail}`);
  }
  return res.json();
}

/**
 * POST /api/recompile — substitute params and recompile (no LLM call).
 */
export async function apiRecompile(
  id: string,
  params: Record<string, number>
): Promise<RecompileResponse> {
  const res = await fetch(`${API_BASE}/api/recompile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, params }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Recompile failed (${res.status}): ${detail}`);
  }
  return res.json();
}

/**
 * Build the full URL for an STL file served by the backend.
 */
export function stlUrl(path: string): string {
  return `${API_BASE}${path}`;
}

/**
 * Build the full URL for a SCAD file download.
 */
export function scadUrl(path: string): string {
  return `${API_BASE}${path}`;
}

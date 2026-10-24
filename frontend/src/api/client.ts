/**
 * API client — thin fetch wrappers for all backend endpoints.
 * 
 * Base URL defaults to localhost:8000 (FastAPI dev server).
 */

import type {
  GenerateResponse,
  RecompileResponse,
  SessionResponse,
  HistoryResponse,
  DescribeImageResponse,
} from "../types";

const API_BASE = "http://localhost:8000";

/**
 * POST /api/generate — send a prompt, get code + STL + params.
 */
export async function apiGenerate(
  prompt: string,
  sessionId?: string | null
): Promise<GenerateResponse> {
  const res = await fetch(`${API_BASE}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, session_id: sessionId }),
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
 * POST /api/chat/session — create a new chat session.
 */
export async function apiCreateSession(): Promise<SessionResponse> {
  const res = await fetch(`${API_BASE}/api/chat/session`, {
    method: "POST",
  });
  if (!res.ok) {
    throw new Error("Failed to create session");
  }
  return res.json();
}

/**
 * GET /api/chat/{session_id}/history — get chat history.
 */
export async function apiGetHistory(
  sessionId: string
): Promise<HistoryResponse> {
  const res = await fetch(`${API_BASE}/api/chat/${sessionId}/history`);
  if (!res.ok) {
    throw new Error("Failed to fetch history");
  }
  return res.json();
}

/**
 * POST /api/describe-image — upload image, get text description.
 */
export async function apiDescribeImage(
  file: File,
  sessionId?: string | null
): Promise<DescribeImageResponse> {
  const form = new FormData();
  form.append("image", file);
  if (sessionId) {
    form.append("session_id", sessionId);
  }

  const res = await fetch(`${API_BASE}/api/describe-image`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Image description failed (${res.status}): ${detail}`);
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

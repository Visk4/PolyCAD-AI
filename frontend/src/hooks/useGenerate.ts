/**
 * useGenerate hook — state machine for the generate/recompile/image flow.
 *
 * States: idle → loading → success/error
 * Manages: prompt submission, auto-heal attempts log, param changes (debounced),
 *          current STL URL, code, params, chat history, and session list.
 *
 * Sessions are stored in localStorage for the sidebar listing.
 * Messages are fetched from the backend when switching sessions.
 */

import { useState, useRef, useCallback } from "react";
import type { Param, Attempt, GenerateResponse, ChatMessage, SessionMeta } from "../types";
import { apiGenerate, apiRecompile, apiDescribeImage, apiGetHistory } from "../api/client";

const LS_KEY = "polycad_sessions";

// ── LocalStorage helpers ─────────────────────────────────────────

function loadSessions(): SessionMeta[] {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveSessions(sessions: SessionMeta[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(sessions));
}

function upsertSession(sessions: SessionMeta[], meta: SessionMeta): SessionMeta[] {
  const idx = sessions.findIndex((s) => s.id === meta.id);
  if (idx >= 0) {
    const updated = [...sessions];
    updated[idx] = meta;
    return updated;
  }
  return [meta, ...sessions]; // newest first
}

// ── State shape ──────────────────────────────────────────────────

export interface GenerateState {
  status: "idle" | "loading" | "success" | "error";
  fileId: string | null;
  code: string;
  params: Param[];
  stlUrl: string | null;
  scadUrl: string | null;
  attempts: Attempt[];
  errorMsg: string | null;
  recompiling: boolean;
  stlRevision: number;
  sessionId: string | null;
  chatMessages: ChatMessage[];
  sessionList: SessionMeta[];
}

const INITIAL_STATE: GenerateState = {
  status: "idle",
  fileId: null,
  code: "",
  params: [],
  stlUrl: null,
  scadUrl: null,
  attempts: [],
  errorMsg: null,
  recompiling: false,
  stlRevision: 0,
  sessionId: null,
  chatMessages: [],
  sessionList: loadSessions(),
};

// ── Hook ─────────────────────────────────────────────────────────

export function useGenerate() {
  const [state, setState] = useState<GenerateState>(INITIAL_STATE);

  // Refs for stale-closure-safe access inside async callbacks
  const fileIdRef = useRef<string | null>(null);
  const paramsRef = useRef<Param[]>([]);
  const sessionIdRef = useRef<string | null>(null);
  const sessionListRef = useRef<SessionMeta[]>(loadSessions());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep refs in sync with state on each render
  fileIdRef.current = state.fileId;
  paramsRef.current = state.params;
  sessionIdRef.current = state.sessionId;
  sessionListRef.current = state.sessionList;

  // ── persistSession helper ────────────────────────────────────

  const persistSession = useCallback(
    (sessionId: string, firstPrompt: string, msgCount: number) => {
      const meta: SessionMeta = {
        id: sessionId,
        title: firstPrompt.slice(0, 50) + (firstPrompt.length > 50 ? "…" : ""),
        timestamp: Date.now(),
        messageCount: msgCount,
      };
      const updated = upsertSession(sessionListRef.current, meta);
      saveSessions(updated);
      setState((s) => ({ ...s, sessionList: updated }));
    },
    []
  );

  // ── generate ─────────────────────────────────────────────────

  const generate = useCallback(
    async (prompt: string) => {
      // Snapshot session before async operation
      const currentSessionId = sessionIdRef.current;

      setState((s) => ({
        ...s,
        status: "loading",
        errorMsg: null,
        attempts: [],
        stlUrl: null,
        chatMessages: [...s.chatMessages, { role: "user" as const, content: prompt }],
      }));

      try {
        const res: GenerateResponse = await apiGenerate(prompt, currentSessionId);

        const assistantMsg: ChatMessage = {
          role: "assistant",
          content:
            res.status === "success"
              ? `✓ Model generated (${res.attempts.length} attempt${res.attempts.length > 1 ? "s" : ""})`
              : `✗ Generation failed after ${res.attempts.length} attempt${res.attempts.length > 1 ? "s" : ""}`,
          model_id: res.id,
        };

        setState((s) => ({
          ...s,
          status: res.status === "success" ? "success" : "error",
          fileId: res.id,
          code: res.code,
          params: res.params,
          stlUrl: res.stl_url,
          scadUrl: res.scad_url,
          attempts: res.attempts,
          errorMsg: res.status === "failed" ? "All compile attempts failed." : null,
          stlRevision: s.stlRevision + 1,
          sessionId: res.session_id,
          chatMessages: [...s.chatMessages, assistantMsg],
        }));

        // Save session to sidebar list
        persistSession(res.session_id, prompt, 2);
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        setState((s) => ({
          ...s,
          status: "error",
          errorMsg,
          chatMessages: [
            ...s.chatMessages,
            { role: "assistant" as const, content: `✗ Error: ${errorMsg}` },
          ],
        }));
      }
    },
    [persistSession]
  );

  // ── describeAndGenerate (image → text → CAD) ─────────────────

  const describeAndGenerate = useCallback(
    async (file: File) => {
      const currentSessionId = sessionIdRef.current;
      const previewUrl = URL.createObjectURL(file);

      setState((s) => ({
        ...s,
        status: "loading",
        errorMsg: null,
        attempts: [],
        chatMessages: [
          ...s.chatMessages,
          { role: "user" as const, content: `📷 ${file.name}`, imagePreview: previewUrl },
        ],
      }));

      try {
        // Step 1: describe image
        const descRes = await apiDescribeImage(file, currentSessionId);
        const newSessionId = descRes.session_id ?? currentSessionId;

        setState((s) => ({
          ...s,
          sessionId: newSessionId,
          chatMessages: [
            ...s.chatMessages,
            { role: "assistant" as const, content: `🔍 ${descRes.description}` },
          ],
        }));

        // Update ref immediately so apiGenerate gets the right session ID
        sessionIdRef.current = newSessionId;

        // Step 2: generate CAD from description
        const genRes = await apiGenerate(descRes.description, newSessionId);

        const assistantMsg: ChatMessage = {
          role: "assistant",
          content:
            genRes.status === "success"
              ? `✓ Model generated from image (${genRes.attempts.length} attempt${genRes.attempts.length > 1 ? "s" : ""})`
              : `✗ Generation failed after ${genRes.attempts.length} attempt${genRes.attempts.length > 1 ? "s" : ""}`,
          model_id: genRes.id,
        };

        setState((s) => ({
          ...s,
          status: genRes.status === "success" ? "success" : "error",
          fileId: genRes.id,
          code: genRes.code,
          params: genRes.params,
          stlUrl: genRes.stl_url,
          scadUrl: genRes.scad_url,
          attempts: genRes.attempts,
          errorMsg: genRes.status === "failed" ? "All compile attempts failed." : null,
          stlRevision: s.stlRevision + 1,
          sessionId: genRes.session_id,
          chatMessages: [...s.chatMessages, assistantMsg],
        }));

        persistSession(genRes.session_id, `[Image] ${file.name}`, 3);
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        setState((s) => ({
          ...s,
          status: "error",
          errorMsg,
          chatMessages: [
            ...s.chatMessages,
            { role: "assistant" as const, content: `✗ Error: ${errorMsg}` },
          ],
        }));
      }
    },
    [persistSession]
  );

  // ── switchSession ────────────────────────────────────────────

  const switchSession = useCallback(async (sessionId: string) => {
    setState((s) => ({
      ...s,
      status: "idle",
      fileId: null,
      code: "",
      params: [],
      stlUrl: null,
      scadUrl: null,
      attempts: [],
      errorMsg: null,
      recompiling: false,
      sessionId,
      chatMessages: [{ role: "assistant" as const, content: "⏳ Loading history…" }],
    }));

    try {
      const histRes = await apiGetHistory(sessionId);
      setState((s) => ({
        ...s,
        sessionId,
        chatMessages: histRes.messages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
          model_id: m.model_id ?? undefined,
        })),
      }));
    } catch {
      setState((s) => ({
        ...s,
        chatMessages: [{ role: "assistant" as const, content: "⚠ Could not load history." }],
      }));
    }
  }, []);

  // ── newSession ───────────────────────────────────────────────

  const newSession = useCallback(() => {
    setState((s) => ({
      ...s,
      sessionId: null,
      chatMessages: [],
      status: "idle",
      fileId: null,
      code: "",
      params: [],
      stlUrl: null,
      scadUrl: null,
      attempts: [],
      errorMsg: null,
      stlRevision: 0,
    }));
  }, []);

  // ── deleteSession ────────────────────────────────────────────

  const deleteSession = useCallback((id: string) => {
    setState((s) => {
      const updated = s.sessionList.filter((x) => x.id !== id);
      saveSessions(updated);
      if (s.sessionId === id) {
        // Was active — reset to blank
        return {
          ...s,
          sessionList: updated,
          sessionId: null,
          chatMessages: [],
          status: "idle" as const,
          fileId: null,
          code: "",
          params: [],
          stlUrl: null,
          scadUrl: null,
          attempts: [],
          errorMsg: null,
          stlRevision: 0,
        };
      }
      return { ...s, sessionList: updated };
    });
  }, []);

  // ── updateParam (debounced recompile) ────────────────────────

  const updateParam = useCallback((name: string, value: number) => {
    setState((prev) => ({
      ...prev,
      params: prev.params.map((p) => (p.name === name ? { ...p, value } : p)),
    }));

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      const currentFileId = fileIdRef.current;
      const currentParams = paramsRef.current;
      if (!currentFileId) return;

      setState((prev) => ({ ...prev, recompiling: true }));

      try {
        const paramDict: Record<string, number> = {};
        for (const p of currentParams) {
          paramDict[p.name] = p.name === name ? value : p.value;
        }
        const res = await apiRecompile(currentFileId, paramDict);
        setState((prev) => ({
          ...prev,
          recompiling: false,
          code: res.code,
          stlUrl: res.stl_url ?? prev.stlUrl,
          errorMsg: res.status === "failed" ? res.error : null,
          stlRevision: prev.stlRevision + 1,
        }));
      } catch (err: unknown) {
        setState((prev) => ({
          ...prev,
          recompiling: false,
          errorMsg: err instanceof Error ? err.message : "Recompile failed",
        }));
      }
    }, 400);
  }, []);

  return {
    state,
    generate,
    updateParam,
    newSession,
    deleteSession,
    switchSession,
    describeAndGenerate,
  };
}

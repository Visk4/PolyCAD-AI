/**
 * useGenerate hook — state machine for the generate/recompile flow.
 *
 * States: idle → loading → success/error
 * Manages: prompt submission, auto-heal attempts log, param changes (debounced),
 *          current STL URL, code, params, and chat history with session tracking.
 */

import { useState, useRef, useCallback } from "react";
import type { Param, Attempt, GenerateResponse, ChatMessage } from "../types";
import { apiGenerate, apiRecompile, apiDescribeImage } from "../api/client";

export interface GenerateState {
  /** Current phase */
  status: "idle" | "loading" | "success" | "error";
  /** File ID from the backend */
  fileId: string | null;
  /** Current OpenSCAD code */
  code: string;
  /** Extracted parameters with current values */
  params: Param[];
  /** STL URL path (e.g. "/api/stl/abc123") */
  stlUrl: string | null;
  /** SCAD URL path */
  scadUrl: string | null;
  /** Auto-heal attempt log */
  attempts: Attempt[];
  /** Error message if status === "error" */
  errorMsg: string | null;
  /** Whether a recompile is in progress */
  recompiling: boolean;
  /** Revision counter — incremented on every successful compile/recompile
   *  so the Viewport knows to reload the STL even when the URL path is the same */
  stlRevision: number;
  /** Chat session ID for conversation continuity */
  sessionId: string | null;
  /** Chat messages for display */
  chatMessages: ChatMessage[];
}

export function useGenerate() {
  const [state, setState] = useState<GenerateState>({
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
  });

  // Refs to avoid stale closures inside the debounced setTimeout
  const fileIdRef = useRef<string | null>(null);
  const paramsRef = useRef<Param[]>([]);

  // Keep refs in sync with state
  fileIdRef.current = state.fileId;
  paramsRef.current = state.params;

  // Debounce timer ref for slider changes
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Submit a prompt to the LLM pipeline.
   */
  const generate = useCallback(async (prompt: string) => {
    // Add user message to chat immediately for responsive UI
    setState((s) => ({
      ...s,
      status: "loading",
      errorMsg: null,
      attempts: [],
      stlUrl: null,
      chatMessages: [
        ...s.chatMessages,
        { role: "user" as const, content: prompt },
      ],
    }));

    try {
      // Read session ID from latest state via callback
      let currentSessionId: string | null = null;
      setState((s) => {
        currentSessionId = s.sessionId;
        return s; // no-op update to read state
      });

      const res: GenerateResponse = await apiGenerate(prompt, currentSessionId);

      // Build assistant message
      const assistantMsg: ChatMessage = {
        role: "assistant",
        content:
          res.status === "success"
            ? `✓ Model generated successfully (${res.attempts.length} attempt${res.attempts.length > 1 ? "s" : ""})`
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
        errorMsg:
          res.status === "failed"
            ? "All compile attempts failed. Check the heal log."
            : null,
        stlRevision: s.stlRevision + 1,
        sessionId: res.session_id,
        chatMessages: [...s.chatMessages, assistantMsg],
      }));
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
  }, []);

  /**
   * Upload an image, describe it via Gemini vision, then auto-generate the CAD model.
   * Two-step flow: image → description (shown in chat) → generate.
   */
  const describeAndGenerate = useCallback(async (file: File) => {
    // Show upload message in chat
    setState((s) => ({
      ...s,
      status: "loading",
      errorMsg: null,
      attempts: [],
      chatMessages: [
        ...s.chatMessages,
        { role: "user" as const, content: `📷 Uploaded image: ${file.name}` },
      ],
    }));

    try {
      // Step 1: Describe the image
      let currentSessionId: string | null = null;
      setState((s) => { currentSessionId = s.sessionId; return s; });

      const descRes = await apiDescribeImage(file, currentSessionId);

      // Show the description in chat
      setState((s) => ({
        ...s,
        sessionId: descRes.session_id ?? s.sessionId,
        chatMessages: [
          ...s.chatMessages,
          {
            role: "assistant" as const,
            content: `🔍 Detected: ${descRes.description}`,
          },
        ],
      }));

      // Step 2: Generate CAD from the description
      // Read updated session ID
      setState((s) => { currentSessionId = s.sessionId; return s; });

      const genRes = await apiGenerate(descRes.description, currentSessionId);

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
        errorMsg:
          genRes.status === "failed"
            ? "All compile attempts failed. Check the heal log."
            : null,
        stlRevision: s.stlRevision + 1,
        sessionId: genRes.session_id,
        chatMessages: [...s.chatMessages, assistantMsg],
      }));
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
  }, []);

  /**
   * Start a new chat session (clears history).
   */
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

  /**
   * Update a single parameter and trigger a debounced recompile.
   */
  const updateParam = useCallback(
    (name: string, value: number) => {
      // Update the param value in state immediately (for responsive sliders)
      setState((prev) => ({
        ...prev,
        params: prev.params.map((p) =>
          p.name === name ? { ...p, value } : p
        ),
      }));

      // Debounce the actual recompile call (400ms)
      if (debounceRef.current) clearTimeout(debounceRef.current);

      debounceRef.current = setTimeout(async () => {
        // Read latest values from refs (avoids stale closures)
        const currentFileId = fileIdRef.current;
        const currentParams = paramsRef.current;

        if (!currentFileId) return;

        setState((prev) => ({ ...prev, recompiling: true }));

        try {
          // Build the params dict from the ref (always fresh)
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
            stlRevision: prev.stlRevision + 1, // force viewport reload
          }));
        } catch (err: unknown) {
          setState((prev) => ({
            ...prev,
            recompiling: false,
            errorMsg:
              err instanceof Error ? err.message : "Recompile failed",
          }));
        }
      }, 400);
    },
    [] // no deps needed — we read from refs
  );

  return { state, generate, updateParam, newSession, describeAndGenerate };
}

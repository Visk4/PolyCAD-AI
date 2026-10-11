/**
 * useGenerate hook — state machine for the generate/recompile flow.
 *
 * States: idle → loading → success/error
 * Manages: prompt submission, auto-heal attempts log, param changes (debounced),
 *          current STL URL, code, and params.
 */

import { useState, useRef, useCallback } from "react";
import type { Param, Attempt, GenerateResponse } from "../types";
import { apiGenerate, apiRecompile } from "../api/client";

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
    setState((s) => ({
      ...s,
      status: "loading",
      errorMsg: null,
      attempts: [],
      stlUrl: null,
    }));

    try {
      const res: GenerateResponse = await apiGenerate(prompt);
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
      }));
    } catch (err: unknown) {
      setState((s) => ({
        ...s,
        status: "error",
        errorMsg: err instanceof Error ? err.message : "Unknown error",
      }));
    }
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

  return { state, generate, updateParam };
}

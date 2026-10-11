/**
 * Shared TypeScript types matching the backend API responses.
 */

/** A single parameter extracted from OpenSCAD code */
export interface Param {
  name: string;
  value: number;
  min: number;
  max: number;
  step: number;
}

/** A single attempt in the auto-heal loop */
export interface Attempt {
  attempt: number;
  code: string;
  error: string | null;
  success: boolean;
}

/** Response from POST /api/generate */
export interface GenerateResponse {
  id: string;
  status: "success" | "failed";
  code: string;
  params: Param[];
  stl_url: string | null;
  scad_url: string | null;
  attempts: Attempt[];
}

/** Response from POST /api/recompile */
export interface RecompileResponse {
  id: string;
  status: "success" | "failed";
  code: string;
  stl_url: string | null;
  error: string | null;
}

import { invoke as coreInvoke } from "@tauri-apps/api/core";
import { getSessionToken } from "./session";

/**
 * Invoke wrapper that automatically attaches the current session token to every
 * IPC call. The Rust backend validates this token centrally before dispatching
 * to the requested command, so the frontend never decides authorization itself.
 */
export function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  return coreInvoke<T>(cmd, {
    sessionToken: getSessionToken() ?? "",
    ...(args ?? {}),
  });
}

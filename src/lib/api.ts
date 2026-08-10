import { invoke as coreInvoke } from "@tauri-apps/api/core";
import { getSessionToken, clearSessionStorage } from "./session";

/**
 * Invoke wrapper that automatically attaches the current session token to every
 * IPC call. The Rust backend validates this token centrally before dispatching
 * to the requested command, so the frontend never decides authorization itself.
 */
export function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  return coreInvoke<T>(cmd, {
    sessionToken: getSessionToken() ?? "",
    ...(args ?? {}),
  }).catch((err: unknown) => {
    if (isSessionInvalidError(err) && cmd !== "login") {
      // The backend refused an expired/invalid token. Drop all local session
      // state and let the auth provider redirect to the login screen instead of
      // leaving the UI stuck on a dead session.
      clearSessionStorage();
      window.dispatchEvent(new Event("session-expired"));
    }
    throw err;
  });
}

function isSessionInvalidError(err: unknown): boolean {
  const msg = typeof err === "string" ? err : err instanceof Error ? err.message : "";
  return (
    msg.includes("Session expired. Please log in again.") ||
    msg.includes("Not authenticated. Please log in.")
  );
}

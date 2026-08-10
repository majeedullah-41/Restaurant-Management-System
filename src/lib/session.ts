const TOKEN_KEY = "rms_session_token";

// Stale identity mirrors written by Login.tsx and auth.tsx. Cleared together
// with the token so a previous user's name/role can never leak across logins.
const IDENTITY_KEYS = [
  "rms_session_user",
  "rms_session_role",
  "userRole",
  "userName",
  "username",
  "displayName",
];

export function getSessionToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setSessionToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export function clearSessionStorage(): void {
  localStorage.removeItem(TOKEN_KEY);
  for (const key of IDENTITY_KEYS) {
    localStorage.removeItem(key);
  }
}

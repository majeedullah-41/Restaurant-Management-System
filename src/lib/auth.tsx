import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { invoke } from "./api";
import { getSessionToken, setSessionToken } from "./session";

export interface CurrentUser {
  username: string;
  role: string;
  display_name: string | null;
  must_change_password: boolean;
}

interface LoginResult {
  success: boolean;
  message?: string;
  must_change_password?: boolean;
  role?: string;
}

interface AuthState {
  user: CurrentUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const current = await invoke<CurrentUser | null>("get_current_session", {
        sessionToken: getSessionToken() ?? "",
      });
      if (current) {
        setUser(current);
        localStorage.setItem("userRole", current.role);
        localStorage.setItem("userName", current.username);
        localStorage.setItem("username", current.username);
        localStorage.setItem("displayName", current.display_name || "");
      } else {
        setUser(null);
        setSessionToken(null);
      }
    } catch {
      setUser(null);
      setSessionToken(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Centralized session-expiry handling: any IPC call that gets rejected with
  // an expired/invalid token clears the local session and returns the user to
  // the login screen (see lib/api.ts).
  useEffect(() => {
    const onSessionExpired = () => {
      setUser(null);
      setLoading(false);
      if (window.location.hash !== "#/login") {
        window.location.hash = "#/login";
      }
    };
    window.addEventListener("session-expired", onSessionExpired);
    return () => window.removeEventListener("session-expired", onSessionExpired);
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    const res = await invoke<{
      success: boolean;
      role?: string | null;
      username?: string | null;
      display_name?: string | null;
      session_token?: string | null;
      must_change_password?: boolean;
      message?: string;
    }>("login", { email, password });

    if (!res.success || !res.session_token) {
      return { success: false, message: res.message || "Invalid email or password" };
    }

    setSessionToken(res.session_token);
    localStorage.setItem("userRole", res.role || "Cashier");
    localStorage.setItem("userName", res.username || "");
    localStorage.setItem("username", res.username || "");
    localStorage.setItem("displayName", res.display_name || "");

    const mustChange = Boolean(res.must_change_password);
    setUser({
      username: res.username || "",
      role: res.role || "Cashier",
      display_name: res.display_name || null,
      must_change_password: mustChange,
    });

    return { success: true, must_change_password: mustChange, role: res.role || "Cashier" };
  }, []);

  const logout = useCallback(async () => {
    const token = getSessionToken();
    setSessionToken(null);
    setUser(null);
    if (token) {
      try {
        await invoke("logout", { sessionToken: token });
      } catch {
        // ignore errors while clearing the session
      }
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}

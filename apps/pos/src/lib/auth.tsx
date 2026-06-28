import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { apiFetch } from "./api";

interface PosUser {
  id: string;
  nombre: string;
  email: string;
  role: string;
  tenantId: string;
  tenantNombre: string;
  planSlug: string;
}

interface AuthCtx {
  user: PosUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthCtx>({ user: null, loading: true, login: async () => {}, logout: () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PosUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Si viene desde el ERP con ?token=xxx en la URL, lo guardamos y limpiamos la URL
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get("token");
    if (urlToken) {
      localStorage.setItem("pos_token", urlToken);
      window.history.replaceState({}, "", window.location.pathname);
    }

    const token = localStorage.getItem("pos_token");
    if (!token) { setLoading(false); return; }
    apiFetch<PosUser>("/api/auth/me")
      .then(setUser)
      .catch(() => localStorage.removeItem("pos_token"))
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const data = await apiFetch<{ accessToken: string; user: PosUser }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    localStorage.setItem("pos_token", data.accessToken);
    setUser(data.user);
  }

  function logout() {
    localStorage.removeItem("pos_token");
    setUser(null);
  }

  return <Ctx.Provider value={{ user, loading, login, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() { return useContext(Ctx); }

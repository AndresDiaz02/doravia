import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { apiFetch } from "./api";

export interface PosConfig {
  cartera_visible?: boolean;
  citas_visible?: boolean;
}

export interface PosUser {
  id: string;
  nombre: string;
  email: string;
  role: string;
  tenantId: string;
  tenantNombre: string;
  planSlug: string;
  posConfig: PosConfig;
}

interface AuthCtx {
  user: PosUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

interface MeResponse {
  user: { id: string; nombre: string; email: string; role: string };
  tenant: { id: string; nombre: string; nit: string; pos_config?: PosConfig };
  plan: { slug: string };
}

function mapMe(raw: MeResponse): PosUser {
  return {
    id: raw.user.id,
    nombre: raw.user.nombre,
    email: raw.user.email,
    role: raw.user.role,
    tenantId: raw.tenant.id,
    tenantNombre: raw.tenant.nombre,
    planSlug: raw.plan.slug,
    posConfig: raw.tenant.pos_config ?? {},
  };
}

const Ctx = createContext<AuthCtx>({ user: null, loading: true, login: async () => {}, logout: () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PosUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    const hashParams = new URLSearchParams(hash);
    const urlToken = hashParams.get("token");
    if (urlToken) {
      localStorage.setItem("pos_token", urlToken);
      window.history.replaceState({}, "", window.location.pathname);
    }

    const token = localStorage.getItem("pos_token");
    if (!token) { setLoading(false); return; }
    apiFetch<MeResponse>("/api/auth/me")
      .then((raw) => setUser(mapMe(raw)))
      .catch(() => localStorage.removeItem("pos_token"))
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const data = await apiFetch<{ accessToken: string } & MeResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    localStorage.setItem("pos_token", data.accessToken);
    setUser(mapMe(data));
  }

  function logout() {
    localStorage.removeItem("pos_token");
    setUser(null);
  }

  return <Ctx.Provider value={{ user, loading, login, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() { return useContext(Ctx); }

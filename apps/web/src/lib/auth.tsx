import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { apiFetch } from "./api";

export interface AuthUser {
  id: string;
  email: string;
  nombre: string;
  role: string;
}

export interface PlanInfo {
  slug: string;
  nombre: string;
  features: Record<string, boolean>;
  max_usuarios: number | null;
  max_bodegas: number | null;
  max_facturas_mes: number | null;
  accounting_level: number;
}

export interface TenantInfo {
  id: string;
  nombre: string;
  nit: string;
  plan_ends_at: string;
  onboarding_completado: boolean;
}

interface MeResponse {
  user: AuthUser;
  plan: PlanInfo;
  tenant: TenantInfo;
}

interface AuthCtx {
  user: AuthUser | null;
  plan: PlanInfo | null;
  tenant: TenantInfo | null;
  isLoading: boolean;
  login: (accessToken: string, refreshToken: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [plan, setPlan] = useState<PlanInfo | null>(null);
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadMe = useCallback(async () => {
    try {
      const data = await apiFetch<MeResponse>("/api/auth/me");
      setUser(data.user);
      setPlan(data.plan);
      setTenant(data.tenant);
    } catch {
      setUser(null);
      setPlan(null);
      setTenant(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Token desde URL (landing page post-registro plan Origen)
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get("token");
    const urlRefresh = params.get("refresh");
    if (urlToken) {
      localStorage.setItem("access_token", urlToken);
      if (urlRefresh) localStorage.setItem("refresh_token", urlRefresh);
      window.history.replaceState({}, "", window.location.pathname);
    }

    if (localStorage.getItem("access_token")) {
      void loadMe();
    } else {
      setIsLoading(false);
    }
  }, [loadMe]);

  const login = useCallback(
    async (accessToken: string, refreshToken: string) => {
      localStorage.setItem("access_token", accessToken);
      localStorage.setItem("refresh_token", refreshToken);
      await loadMe();
    },
    [loadMe],
  );

  const logout = useCallback(async () => {
    const rt = localStorage.getItem("refresh_token");
    if (rt) {
      await apiFetch("/api/auth/logout", {
        method: "POST",
        body: JSON.stringify({ refresh_token: rt }),
      }).catch(() => {});
    }
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    setUser(null);
    setPlan(null);
    setTenant(null);
  }, []);

  return (
    <Ctx.Provider value={{ user, plan, tenant, isLoading, login, logout }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}

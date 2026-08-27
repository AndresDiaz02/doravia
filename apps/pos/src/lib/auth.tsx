import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { ApiError, apiFetch } from "./api";

export interface PosConfig {
  cartera_visible?: boolean;
  citas_visible?: boolean;
  fidelizacion_activa?: boolean;
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
  completeLogin: (session: AuthSessionResponse) => void;
  logout: () => void;
}

const POS_USER_CACHE_KEY = "doravia-pos-user-cache";

interface MeResponse {
  user: { id: string; nombre: string; email: string; role: string };
  tenant: { id: string; nombre: string; nit: string; pos_config?: PosConfig };
  // /api/auth/me incluye el plan, pero /api/auth/login devuelve la sesión sin
  // ese objeto. El POS no necesita el slug para operar, así que aceptamos
  // ambas respuestas para que el inicio de sesión no falle tras autenticar.
  plan?: { slug: string };
}

export interface AuthSessionResponse extends MeResponse {
  accessToken: string;
  refreshToken?: string;
}

function mapMe(raw: MeResponse): PosUser {
  return {
    id: raw.user.id,
    nombre: raw.user.nombre,
    email: raw.user.email,
    role: raw.user.role,
    tenantId: raw.tenant.id,
    tenantNombre: raw.tenant.nombre,
    planSlug: raw.plan?.slug ?? "",
    posConfig: raw.tenant.pos_config ?? {},
  };
}

function guardarUsuarioLocal(usuario: PosUser) {
  localStorage.setItem(POS_USER_CACHE_KEY, JSON.stringify(usuario));
}

function leerUsuarioLocal(): PosUser | null {
  try {
    const raw = localStorage.getItem(POS_USER_CACHE_KEY);
    if (!raw) return null;
    const usuario = JSON.parse(raw) as Partial<PosUser>;
    if (!usuario.id || !usuario.tenantId || !usuario.nombre || !usuario.email) return null;
    return usuario as PosUser;
  } catch {
    return null;
  }
}

const Ctx = createContext<AuthCtx>({ user: null, loading: true, login: async () => {}, completeLogin: () => {}, logout: () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PosUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    const hashParams = new URLSearchParams(hash);
    const urlToken = hashParams.get("token");
    const urlRefresh = hashParams.get("refresh");
    if (urlToken) {
      localStorage.setItem("pos_token", urlToken);
      if (urlRefresh) localStorage.setItem("pos_refresh_token", urlRefresh);
      window.history.replaceState({}, "", window.location.pathname);
    }

    const token = localStorage.getItem("pos_token");
    if (!token) { setLoading(false); return; }
    apiFetch<MeResponse>("/api/auth/me")
      .then((raw) => {
        const usuario = mapMe(raw);
        guardarUsuarioLocal(usuario);
        setUser(usuario);
      })
      .catch((error) => {
        // Sin red se conserva la sesión local únicamente para consultar el
        // catálogo y preparar el carrito. El cobro permanece bloqueado hasta
        // recuperar conexión, por lo que no se generan ventas duplicadas.
        if (error instanceof ApiError && (error.status === 0 || error.status === 408)) {
          setUser(leerUsuarioLocal());
          return;
        }
        localStorage.removeItem("pos_token");
        localStorage.removeItem("pos_refresh_token");
        localStorage.removeItem(POS_USER_CACHE_KEY);
      })
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const data = await apiFetch<{ accessToken: string; refreshToken?: string } & MeResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    localStorage.setItem("pos_token", data.accessToken);
    if (data.refreshToken) localStorage.setItem("pos_refresh_token", data.refreshToken);
    const usuario = mapMe(data);
    guardarUsuarioLocal(usuario);
    setUser(usuario);
  }

  function completeLogin(session: AuthSessionResponse) {
    localStorage.setItem("pos_token", session.accessToken);
    if (session.refreshToken) localStorage.setItem("pos_refresh_token", session.refreshToken);
    const usuario = mapMe(session);
    guardarUsuarioLocal(usuario);
    setUser(usuario);
    setLoading(false);
  }

  function logout() {
    localStorage.removeItem("pos_token");
    localStorage.removeItem("pos_refresh_token");
    localStorage.removeItem(POS_USER_CACHE_KEY);
    setUser(null);
  }

  return <Ctx.Provider value={{ user, loading, login, completeLogin, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() { return useContext(Ctx); }

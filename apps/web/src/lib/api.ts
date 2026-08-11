export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// En Pages no existe un proxy /api: usar Render como destino por defecto.
// VITE_API_URL permite sustituirlo en previews o entornos posteriores.
const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "https://doravia-api.onrender.com";

// Promesa compartida: evita múltiples refresh simultáneos en la misma pestaña
let refreshPromise: Promise<boolean> | null = null;

const API_TIMEOUT_MS = 30_000;

async function fetchApi(url: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  const abortFromCaller = () => controller.abort();
  options.signal?.addEventListener("abort", abortFromCaller, { once: true });

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new ApiError(408, "La conexión está tardando más de lo esperado. Intenta de nuevo en unos segundos.");
    }
    throw new ApiError(0, "No se pudo conectar con Doravia. Revisa tu conexión e intenta de nuevo.");
  } finally {
    window.clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abortFromCaller);
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  _isRetry = false,
): Promise<T> {
  const token = localStorage.getItem("access_token");

  const res = await fetchApi(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers as Record<string, string> | undefined),
    },
  });

  // No intentar refrescar para endpoints públicos de auth (login, register, etc.)
  // /api/auth/me requiere sesión: allí sí se debe intentar renovar el token.
  const esEndpointPublico = [
    "/api/auth/login",
    "/api/auth/register",
    "/api/auth/register-trial",
    "/api/auth/refresh",
    "/api/auth/logout",
    "/api/auth/forgot-password",
    "/api/auth/reset-password",
  ].some((endpoint) => path.startsWith(endpoint)) || path.startsWith("/api/fundador/");

  if (res.status === 401 && !_isRetry && !esEndpointPublico) {
    const rt = localStorage.getItem("refresh_token");
    if (rt) {
      // Si ya hay un refresh en curso en esta misma pestaña, esperar ese resultado
      if (!refreshPromise) {
        refreshPromise = tryRefresh(rt).finally(() => {
          refreshPromise = null;
        });
      }
      const ok = await refreshPromise;
      if (ok) return apiFetch<T>(path, options, true);
    }
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    window.location.href = "/login?expired=1";
    throw new ApiError(401, "Sesión expirada.");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string; code?: string };
    if (res.status === 403 && body.code === "SETUP_REQUIRED") {
      window.location.href = "/onboarding";
      throw new ApiError(403, body.error ?? "Configuración requerida.");
    }
    throw new ApiError(res.status, body.error ?? "Error del servidor.");
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

async function tryRefresh(oldRefreshToken: string): Promise<boolean> {
  // Capturamos el access_token ANTES del intento para detectar si otra pestaña ya refrescó
  const atAntes = localStorage.getItem("access_token");

  try {
    const res = await fetchApi(`${BASE}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: oldRefreshToken }),
    });

    if (!res.ok) {
      // Si el refresh falló, puede ser porque otra pestaña ya lo hizo y rotó el token.
      // Si localStorage tiene un access_token diferente al que había, lo usamos.
      const atAhora = localStorage.getItem("access_token");
      return !!(atAhora && atAhora !== atAntes);
    }

    const data = await res.json() as { accessToken: string; refreshToken: string };
    localStorage.setItem("access_token", data.accessToken);
    localStorage.setItem("refresh_token", data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

// Wrapper para endpoints paginados { data, page, limit }
export async function apiFetchPaged<T>(
  path: string,
  page = 1,
  limit = 50,
): Promise<{ data: T[]; page: number; limit: number }> {
  const sep = path.includes("?") ? "&" : "?";
  return apiFetch<{ data: T[]; page: number; limit: number }>(
    `${path}${sep}page=${page}&limit=${limit}`,
  );
}

export function cop(value: string | number | null | undefined): string {
  const num = Number(value ?? 0);
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0 }).format(num);
}

export function fecha(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
}

export async function descargarExcel(path: string, nombreArchivo: string) {
  const token = localStorage.getItem("access_token");
  const destino = /^https?:\/\//.test(path) ? path : `${BASE}${path}`;
  const resp = await fetch(destino, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!resp.ok) throw new Error("Error al generar el archivo.");
  const blob = await resp.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivo;
  a.click();
  URL.revokeObjectURL(url);
}

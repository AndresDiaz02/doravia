export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

// El POS se publica en un subdominio independiente. Si no se configura la
// variable durante el despliegue, "/api" apuntaría al propio POS en vez de al
// backend, por lo que las ventas y los turnos fallarían silenciosamente.
const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.trim() || "https://doravia-api.onrender.com";
const API_TIMEOUT_MS = 30_000;
let refreshPromise: Promise<boolean> | null = null;

export async function apiFetch<T>(path: string, options: RequestInit = {}, isRetry = false): Promise<T> {
  const token = localStorage.getItem("pos_token");
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  const abortFromCaller = () => controller.abort();
  options.signal?.addEventListener("abort", abortFromCaller, { once: true });

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers as Record<string, string> | undefined),
      },
    });
  } catch {
    throw new ApiError(
      controller.signal.aborted ? 408 : 0,
      controller.signal.aborted
        ? "La conexión está tardando más de lo esperado. Intenta de nuevo en unos segundos."
        : "No se pudo conectar con Doravia. Revisa tu conexión e intenta de nuevo.",
    );
  } finally {
    window.clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abortFromCaller);
  }

  const esEndpointPublico = [
    "/api/auth/login",
    "/api/auth/register",
    "/api/auth/register-trial",
    "/api/auth/refresh",
    "/api/auth/logout",
  ].some((endpoint) => path.startsWith(endpoint));
  if (res.status === 401 && !isRetry && !esEndpointPublico) {
    if (!refreshPromise) {
      refreshPromise = tryRefresh().finally(() => { refreshPromise = null; });
    }
    if (await refreshPromise) return apiFetch<T>(path, options, true);
    localStorage.removeItem("pos_token");
    localStorage.removeItem("pos_refresh_token");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new ApiError(res.status, body.error ?? `Error ${res.status}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

async function tryRefresh(): Promise<boolean> {
  const refreshToken = localStorage.getItem("pos_refresh_token");
  if (!refreshToken) return false;

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}/api/auth/refresh`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) return false;
    const data = await res.json() as { accessToken: string; refreshToken: string };
    localStorage.setItem("pos_token", data.accessToken);
    localStorage.setItem("pos_refresh_token", data.refreshToken);
    return true;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeout);
  }
}

export function cop(v: string | number | null | undefined) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency", currency: "COP", minimumFractionDigits: 0,
  }).format(Number(v ?? 0));
}

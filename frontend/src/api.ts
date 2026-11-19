// Cliente da API BELMONTE MOBI com renovação automática de token.
import { uploadForm } from "@/src/utils/upload";
import { storage } from "@/src/utils/storage";

export const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? "";
export const API = `${BACKEND_URL}/api`;

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let accessToken: string | null = null;

export const setAccessToken = (t: string | null) => {
  accessToken = t;
};

export const getAccessToken = () => accessToken;

export async function saveTokens(t: { access_token: string; refresh_token: string }) {
  accessToken = t.access_token;
  await storage.secureSet("auth_token", t.access_token);
  await storage.secureSet("refresh_token", t.refresh_token);
}

export async function clearTokens() {
  accessToken = null;
  await storage.secureRemove("auth_token");
  await storage.secureRemove("refresh_token");
}

async function refreshTokens(): Promise<boolean> {
  const rt = await storage.secureGet("refresh_token", "");
  if (!rt) return false;
  try {
    const res = await fetch(`${API}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: rt }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    await saveTokens(data);
    return true;
  } catch {
    return false;
  }
}

async function request<T>(path: string, method: string, body?: unknown, retry = true): Promise<T> {
  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Sem conexão com o servidor. Verifique sua internet.");
  }
  if (res.status === 401 && retry) {
    const ok = await refreshTokens();
    if (ok) return request<T>(path, method, body, false);
    await clearTokens();
  }
  if (!res.ok) {
    let msg = "Algo deu errado. Tente novamente.";
    try {
      const j = await res.json();
      msg = typeof j.detail === "string" ? j.detail : (Array.isArray(j.detail) ? (j.detail[0]?.msg ?? msg) : msg);
    } catch {
      /* resposta sem JSON */
    }
    throw new ApiError(res.status, msg);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T,>(p: string) => request<T>(p, "GET"),
  post: <T,>(p: string, b?: unknown) => request<T>(p, "POST", b ?? {}),
  put: <T,>(p: string, b?: unknown) => request<T>(p, "PUT", b ?? {}),

  async uploadFile(file: { uri: string; name?: string; mimeType?: string }): Promise<{ url: string; path: string }> {
    const res = await uploadForm(`${API}/upload`, {
      files: { file },
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    });
    if (!res.ok) throw new ApiError(res.status, "Falha ao enviar o arquivo");
    return res.json();
  },
};

// URL para exibir arquivo salvo no Object Storage (funciona web e nativo).
export function fileUrl(path: string): { uri: string; headers?: Record<string, string> } {
  const uri = `${API}/files/${path}?token=${encodeURIComponent(getAccessToken() ?? "")}`;
  return Platform_source(uri);
}

function Platform_source(uri: string): { uri: string; headers?: Record<string, string> } {
  // headers no nativo; token na query já resolve web e nativo.
  return { uri, headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined };
}

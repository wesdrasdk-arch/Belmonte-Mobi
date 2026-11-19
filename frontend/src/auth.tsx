// Contexto de autenticação global (cliente, motorista e admin).
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, clearTokens, getAccessToken, saveTokens, setAccessToken } from "@/src/api";
import { storage } from "@/src/utils/storage";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: "client" | "driver" | "admin";
  blocked: boolean;
  created_at?: string | null;
};

export type SessionDriver = {
  id: string;
  user_id: string;
  name: string;
  phone: string;
  status: "pending" | "approved" | "rejected" | "blocked";
  online: boolean;
  rating_avg: number;
  rating_count: number;
  photo_url?: string;
  cnh_category?: string;
  vehicle?: {
    id?: string;
    plate: string;
    model: string;
    year: string;
    color: string;
    capacity: number;
    photo_url: string;
  } | null;
} | null;

type MeResponse = { user: SessionUser; driver: SessionDriver };

type AuthContextValue = {
  user: SessionUser | null;
  driver: SessionDriver;
  booted: boolean;
  signIn: (email: string, password: string) => Promise<SessionUser>;
  signUp: (data: { name: string; email: string; phone: string; password: string }) => Promise<SessionUser>;
  signOut: () => Promise<void>;
  reload: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [driver, setDriver] = useState<SessionDriver>(null);
  const [booted, setBooted] = useState(false);

  async function loadMe() {
    const me = await api.get<MeResponse>("/auth/me");
    setUser(me.user);
    setDriver(me.driver ?? null);
  }

  useEffect(() => {
    (async () => {
      try {
        const token = await storage.secureGet("auth_token", "");
        if (token) {
          setAccessToken(token);
          await loadMe();
        }
      } catch {
        await clearTokens();
        setAccessToken(null);
      } finally {
        setBooted(true);
      }
    })();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      driver,
      booted,
      async signIn(email: string, password: string) {
        const res = await api.post<MeResponse & { access_token: string; refresh_token: string }>("/auth/login", {
          email,
          password,
        });
        await saveTokens(res);
        setUser(res.user);
        setDriver(res.driver ?? null);
        return res.user;
      },
      async signUp(data) {
        const res = await api.post<MeResponse & { access_token: string; refresh_token: string }>("/auth/register", data);
        await saveTokens(res);
        setUser(res.user);
        setDriver(null);
        return res.user;
      },
      async signOut() {
        const rt = await storage.secureGet("refresh_token", "");
        if (rt) {
          try {
            await api.post("/auth/logout", { refresh_token: rt });
          } catch {
            /* melhor esforço */
          }
        }
        await clearTokens();
        setUser(null);
        setDriver(null);
      },
      async reload() {
        if (!getAccessToken()) return;
        try {
          await loadMe();
        } catch {
          /* mantém estado atual */
        }
      },
    }),
    [user, driver, booted],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de AuthProvider");
  return ctx;
}

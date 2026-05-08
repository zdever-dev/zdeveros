// frontend/src/context/AuthContext.tsx
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export interface AuthUser {
  id: number;
  username: string;
  name: string;
  role_name: string;
  allowed_tabs: string[];
  can_delete: boolean;
  is_admin: boolean;
  is_super: boolean;
}

interface AuthCtx {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  hasTab: (tab: string) => boolean;
}

const Ctx = createContext<AuthCtx>({
  user: null, token: null, loading: true,
  login: async () => {}, logout: () => {},
  hasTab: () => false,
});

// sessionStorage: přežije F5 refresh ALE vymaže se po zavření tabu/prohlížeče
const TOKEN_KEY = 'zdever-auth-token';
const USER_KEY  = 'zdever-auth-user';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]   = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedToken = sessionStorage.getItem(TOKEN_KEY);
    const savedUser  = sessionStorage.getItem(USER_KEY);
    if (savedToken && savedUser) {
      try {
        setToken(savedToken);
        setUser(JSON.parse(savedUser));
      } catch {
        // Poškozená data — vymaž
        sessionStorage.removeItem(TOKEN_KEY);
        sessionStorage.removeItem(USER_KEY);
      }
    }
    setLoading(false);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Přihlášení selhalo');

    setToken(data.token);
    setUser(data.user);
    // sessionStorage — maže se při zavření tabu
    sessionStorage.setItem(TOKEN_KEY, data.token);
    sessionStorage.setItem(USER_KEY, JSON.stringify(data.user));
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
  }, []);

  const hasTab = useCallback((tab: string) => {
    if (!user) return false;
    if (user.is_super) return true;
    return user.allowed_tabs.includes(tab);
  }, [user]);

  return (
    <Ctx.Provider value={{ user, token, loading, login, logout, hasTab }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
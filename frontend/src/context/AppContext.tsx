import React, { createContext, useContext, useEffect, useState } from 'react';
import { settingsApi } from '../api';

interface AppCtx {
  settings: Record<string, string>;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  saveSettings: (s: Record<string, string>) => Promise<void>;
  refreshSettings: () => Promise<void>;
}

const Ctx = createContext<AppCtx>({
  settings: {},
  theme: 'light',
  toggleTheme: () => {},
  saveSettings: async () => {},
  refreshSettings: async () => {},
});

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('zdever-theme') as 'light' | 'dark') || 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('zdever-theme', theme);
  }, [theme]);

  const loadSettings = async () => {
    const token = sessionStorage.getItem('zdever-auth-token');
    if (!token) return;
    try {
      const s = await settingsApi.get();
      setSettings(s);
      if (s.theme && s.theme !== theme) setTheme(s.theme as 'light' | 'dark');
    } catch {
      // tiché selhání — 401 je ošetřeno v api/index.ts
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    const token = sessionStorage.getItem('zdever-auth-token');
    if (token) settingsApi.save({ theme: next }).catch(() => {});
  };

  const saveSettings = async (s: Record<string, string>) => {
    const saved = await settingsApi.save(s);
    setSettings(saved);
    if (s.theme) setTheme(s.theme as 'light' | 'dark');
  };

  return (
    <Ctx.Provider value={{ settings, theme, toggleTheme, saveSettings, refreshSettings: loadSettings }}>
      {children}
    </Ctx.Provider>
  );
}

export const useApp = () => useContext(Ctx);
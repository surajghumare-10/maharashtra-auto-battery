import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { translations } from '../utils/i18n';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('mab_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const [token, setToken] = useState(() => localStorage.getItem('mab_token'));
  const [lang, setLang] = useState(() => localStorage.getItem('mab_lang') || 'en');
  const [shopSettings, setShopSettings] = useState({});
  const [inactivityNotice, setInactivityNotice] = useState(false);

  const t = translations[lang] || translations.en;

  const changeLanguage = (newLang) => {
    setLang(newLang);
    localStorage.setItem('mab_lang', newLang);
  };

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('mab_token');
    localStorage.removeItem('mab_user');
  }, []);

  const login = async (username, password, rememberMe) => {
    const res = await api.login(username, password, rememberMe);
    setUser(res.user);
    setToken(res.token);
    localStorage.setItem('mab_token', res.token);
    localStorage.setItem('mab_user', JSON.stringify(res.user));
    localStorage.setItem('mab_remember', rememberMe ? 'true' : 'false');
    await fetchSettings();
    return res.user;
  };

  const fetchSettings = async () => {
    try {
      const res = await api.getSettings();
      if (res.settings) {
        setShopSettings(res.settings);
      }
    } catch (err) {
      console.error('Failed to load shop settings:', err);
    }
  };

  // Listen for auth_expired custom event from api.js
  useEffect(() => {
    const handleAuthExpired = () => {
      logout();
    };
    window.addEventListener('auth_expired', handleAuthExpired);
    return () => window.removeEventListener('auth_expired', handleAuthExpired);
  }, [logout]);

  // Initial settings load if logged in
  useEffect(() => {
    if (token) {
      fetchSettings();
    }
  }, [token]);

  // Inactivity auto-logout (30 minutes) if "remember me" was NOT checked
  useEffect(() => {
    const isRemembered = localStorage.getItem('mab_remember') === 'true';
    if (!token || isRemembered) return;

    const INACTIVITY_LIMIT_MS = 30 * 60 * 1000; // 30 minutes
    let timeoutId;

    const resetTimer = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setInactivityNotice(true);
        logout();
      }, INACTIVITY_LIMIT_MS);
    };

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    events.forEach(evt => window.addEventListener(evt, resetTimer, { passive: true }));

    resetTimer();

    return () => {
      clearTimeout(timeoutId);
      events.forEach(evt => window.removeEventListener(evt, resetTimer));
    };
  }, [token, logout]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        lang,
        t,
        changeLanguage,
        login,
        logout,
        shopSettings,
        fetchSettings,
        inactivityNotice,
        setInactivityNotice,
        isOwner: user?.role === 'owner',
        isManager: user?.role === 'manager',
        isWorker: user?.role === 'worker',
        canViewDues: user?.role === 'owner' || (user?.role === 'manager' && user?.can_view_dues === 1),
        canViewInventory: user?.role === 'owner' || (user?.role === 'manager' && user?.can_view_inventory === 1)
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

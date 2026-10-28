import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { KeyRound } from 'lucide-react';

export default function Login() {
  const { login, t, inactivityNotice, setInactivityNotice } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Please enter both username and password');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await login(username.trim(), password, rememberMe);
    } catch (err) {
      setError(err.message || 'Login failed. Please check credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center px-4 py-8 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        {/* Brand Banner */}
        <div className="text-center">
          <div className="inline-flex w-14 h-14 rounded-lg bg-accent-700 text-white items-center justify-center font-black text-2xl tracking-wider shadow-sm mb-3">
            MAB
          </div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">
            Maharashtra Auto Battery
          </h2>
          <p className="mt-1 text-sm text-slate-600 font-medium">
            Counter Billing & Inventory System
          </p>
        </div>

        {inactivityNotice && (
          <div className="mt-4 p-3 bg-amber-50 border border-amber-300 rounded text-amber-900 text-xs flex items-center justify-between">
            <span>You have been automatically logged out due to inactivity.</span>
            <button
              type="button"
              onClick={() => setInactivityNotice(false)}
              className="font-bold underline ml-2"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Login Card */}
        <div className="mt-6 bg-white py-6 px-5 sm:px-8 shadow-sm border border-slate-300 rounded-lg">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border-l-4 border-red-600 text-red-800 text-sm font-semibold rounded-r">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-slate-800 mb-1">
                {t.username}
              </label>
              <input
                type="text"
                autoCapitalize="none"
                autoCorrect="off"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                className="w-full h-12 px-3 border-2 border-slate-300 rounded text-base font-medium focus:border-accent-700 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-800 mb-1">
                {t.password}
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="w-full h-12 px-3 border-2 border-slate-300 rounded text-base font-medium focus:border-accent-700 focus:outline-none"
              />
            </div>

            <div className="flex items-center pt-1">
              <input
                id="remember_me"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-5 h-5 text-accent-700 border-2 border-slate-300 rounded focus:ring-0 cursor-pointer"
              />
              <label htmlFor="remember_me" className="ml-2.5 block text-xs font-semibold text-slate-700 cursor-pointer select-none">
                {t.remember_me}
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 bg-accent-700 hover:bg-accent-800 active:bg-accent-900 text-white font-bold rounded text-base shadow-sm transition-colors disabled:opacity-50 flex items-center justify-center space-x-2"
            >
              {loading ? (
                <span>Signing in...</span>
              ) : (
                <>
                  <KeyRound className="w-5 h-5" />
                  <span>{t.sign_in}</span>
                </>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-500 mt-4">
          Maharashtra Auto Battery &copy; 2026. Fast Counter POS.
        </p>
      </div>
    </div>
  );
}

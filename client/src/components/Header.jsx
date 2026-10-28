import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { LogOut, User, KeyRound, X, Save, AlertCircle } from 'lucide-react';

export default function Header() {
  const { user, logout, lang, changeLanguage, t, shopSettings } = useAuth();
  const [showPasswordModal, setShowPasswordModal] = useState(!!user?.must_change_password);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdError, setPwdError] = useState('');
  const [pwdSuccess, setPwdSuccess] = useState('');
  const [savingPwd, setSavingPwd] = useState(false);

  useEffect(() => {
    if (user?.must_change_password) setShowPasswordModal(true);
  }, [user?.must_change_password]);

  const roleBadgeColor = {
    owner: 'bg-blue-100 text-blue-900 border-blue-300',
    manager: 'bg-emerald-100 text-emerald-900 border-emerald-300',
    worker: 'bg-slate-100 text-slate-900 border-slate-300'
  }[user?.role || 'worker'];

  const roleLabel = {
    owner: t.owner,
    manager: t.manager,
    worker: t.worker
  }[user?.role || 'worker'];

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwdError('');
    setPwdSuccess('');

    if (newPassword.length < 6) {
      setPwdError('New password must be at least 6 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwdError('New password and confirmation do not match.');
      return;
    }

    setSavingPwd(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      setPwdSuccess('Password updated successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      if (user) {
        const updated = { ...user, must_change_password: false };
        localStorage.setItem('mab_user', JSON.stringify(updated));
      }
      setTimeout(() => setShowPasswordModal(false), 900);
    } catch (err) {
      setPwdError(err.message || 'Failed to update password');
    } finally {
      setSavingPwd(false);
    }
  };

  return (
    <>
      <header className="bg-white border-b-2 border-slate-200 sticky top-0 z-30 shadow-sm print:hidden">
        <div className="max-w-7xl mx-auto px-3 py-2.5 flex items-center justify-between">
          <div className="flex items-center space-x-2 min-w-0">
            <div className="w-9 h-9 rounded bg-accent-700 text-white flex items-center justify-center font-black text-lg tracking-wider flex-shrink-0 overflow-hidden">
              {shopSettings.shop_logo ? (
                <img src={shopSettings.shop_logo} alt="Logo" className="w-full h-full object-contain bg-white" />
              ) : 'MAB'}
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-bold text-slate-900 leading-tight truncate">
                {shopSettings.shop_name || t.shop_title}
              </h1>
              <p className="text-xs text-slate-600 hidden sm:block truncate">
                {shopSettings.address ? shopSettings.address.split(',')[0] : 'Shop Counter'}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-1.5 sm:space-x-3 flex-shrink-0">
            <div className="flex items-center bg-slate-100 rounded border border-slate-300 p-0.5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => changeLanguage('en')}
                className={`px-1.5 sm:px-2 py-1 rounded transition-colors ${lang === 'en' ? 'bg-white text-accent-700 shadow-sm font-bold' : 'text-slate-600'}`}
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => changeLanguage('mr')}
                className={`px-1.5 sm:px-2 py-1 rounded transition-colors ${lang === 'mr' ? 'bg-white text-accent-700 shadow-sm font-bold' : 'text-slate-600'}`}
              >
                मराठी
              </button>
              <button
                type="button"
                onClick={() => changeLanguage('hi')}
                className={`px-1.5 sm:px-2 py-1 rounded transition-colors ${lang === 'hi' ? 'bg-white text-accent-700 shadow-sm font-bold' : 'text-slate-600'}`}
              >
                हिंदी
              </button>
            </div>

            <div className={`hidden md:flex items-center space-x-1.5 px-2.5 py-1 rounded border text-xs font-medium ${roleBadgeColor}`}>
              <User className="w-3.5 h-3.5" />
              <span className="font-bold">{user?.name?.split(' ')[0]}</span>
              <span>({roleLabel})</span>
            </div>

            <button
              type="button"
              onClick={() => setShowPasswordModal(true)}
              title="Change my password"
              className="p-2 rounded bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-accent-700 border border-slate-300"
            >
              <KeyRound className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={logout}
              title={t.logout}
              className="flex items-center space-x-1 px-2 sm:px-3 py-1.5 rounded bg-slate-100 hover:bg-red-50 text-slate-700 hover:text-red-700 border border-slate-300 text-xs font-semibold active:bg-red-100 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t.logout}</span>
            </button>
          </div>
        </div>
      </header>

      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-3 print:hidden">
          <div className="bg-white rounded-xl max-w-sm w-full p-5 border-2 border-slate-800 shadow-2xl">
            <div className="flex items-start justify-between border-b pb-2 mb-3">
              <div>
                <h3 className="text-base font-black text-slate-900">Change My Password</h3>
                <p className="text-[11px] text-slate-500 font-semibold">
                  {user?.must_change_password
                    ? 'You are using a default password. Please set a private password now.'
                    : `Logged in as @${user?.username}`}
                </p>
              </div>
              <button type="button" onClick={() => setShowPasswordModal(false)} className="p-1 text-slate-500 hover:text-slate-900">
                <X className="w-5 h-5" />
              </button>
            </div>

            {pwdError && (
              <div className="mb-3 p-2 bg-red-50 border border-red-300 rounded text-red-800 text-xs font-bold flex items-center space-x-1.5">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{pwdError}</span>
              </div>
            )}
            {pwdSuccess && (
              <div className="mb-3 p-2 bg-emerald-50 border border-emerald-300 rounded text-emerald-800 text-xs font-bold">
                {pwdSuccess}
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Current Password *</label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full h-10 px-2.5 border border-slate-300 rounded font-semibold"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">New Password * (min 6 characters)</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full h-10 px-2.5 border border-slate-300 rounded font-semibold"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Confirm New Password *</label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full h-10 px-2.5 border border-slate-300 rounded font-semibold"
                />
              </div>
              <div className="flex justify-end space-x-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(false)}
                  className="px-3 py-2 bg-slate-100 rounded text-slate-700 font-bold border"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingPwd}
                  className="px-4 py-2 bg-accent-700 text-white rounded font-black shadow flex items-center space-x-1.5 disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{savingPwd ? 'Saving...' : 'Update Password'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

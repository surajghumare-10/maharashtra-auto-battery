import React from 'react';
import { useAuth } from '../context/AuthContext';
import { LogOut, Globe, User } from 'lucide-react';

export default function Header() {
  const { user, logout, lang, changeLanguage, t, shopSettings } = useAuth();

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

  return (
    <header className="bg-white border-b-2 border-slate-200 sticky top-0 z-30 shadow-sm print:hidden">
      <div className="max-w-7xl mx-auto px-3 py-2.5 flex items-center justify-between">
        {/* Shop Name */}
        <div className="flex items-center space-x-2">
          <div className="w-9 h-9 rounded bg-accent-700 text-white flex items-center justify-center font-black text-lg tracking-wider">
            MAB
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">
              {shopSettings.shop_name || t.shop_title}
            </h1>
            <p className="text-xs text-slate-600 hidden sm:block">
              {shopSettings.address ? shopSettings.address.split(',')[0] : 'Shop Counter'}
            </p>
          </div>
        </div>

        {/* Right Actions: Language, User Role, Logout */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          {/* Language selector */}
          <div className="flex items-center bg-slate-100 rounded border border-slate-300 p-0.5 text-xs font-semibold">
            <button
              type="button"
              onClick={() => changeLanguage('en')}
              className={`px-2 py-1 rounded transition-colors ${lang === 'en' ? 'bg-white text-accent-700 shadow-sm font-bold' : 'text-slate-600'}`}
            >
              EN
            </button>
            <button
              type="button"
              onClick={() => changeLanguage('mr')}
              className={`px-2 py-1 rounded transition-colors ${lang === 'mr' ? 'bg-white text-accent-700 shadow-sm font-bold' : 'text-slate-600'}`}
            >
              मराठी
            </button>
            <button
              type="button"
              onClick={() => changeLanguage('hi')}
              className={`px-2 py-1 rounded transition-colors ${lang === 'hi' ? 'bg-white text-accent-700 shadow-sm font-bold' : 'text-slate-600'}`}
            >
              हिंदी
            </button>
          </div>

          {/* User Badge */}
          <div className={`hidden md:flex items-center space-x-1.5 px-2.5 py-1 rounded border text-xs font-medium ${roleBadgeColor}`}>
            <User className="w-3.5 h-3.5" />
            <span className="font-bold">{user?.name?.split(' ')[0]}</span>
            <span>({roleLabel})</span>
          </div>

          {/* Logout Button */}
          <button
            type="button"
            onClick={logout}
            title={t.logout}
            className="flex items-center space-x-1 px-3 py-1.5 rounded bg-slate-100 hover:bg-red-50 text-slate-700 hover:text-red-700 border border-slate-300 text-xs font-semibold active:bg-red-100 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t.logout}</span>
          </button>
        </div>
      </div>
    </header>
  );
}

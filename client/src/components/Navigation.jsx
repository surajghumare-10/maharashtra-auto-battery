import React from 'react';
import { useAuth } from '../context/AuthContext';
import { FilePlus2, ReceiptText, Tag, AlertCircle, Boxes, LayoutDashboard, Settings } from 'lucide-react';

export default function Navigation({ activeTab, setActiveTab }) {
  const { isOwner, isManager, canViewDues, canViewInventory, t } = useAuth();

  const navItems = [
    { id: 'new_bill', label: t.new_bill, icon: FilePlus2, primary: true },
    { id: 'bills', label: t.bills, icon: ReceiptText },
    { id: 'price_list', label: t.price_list, icon: Tag },
  ];

  if (canViewDues) {
    navItems.push({ id: 'dues', label: t.dues, icon: AlertCircle });
  }

  if (canViewInventory) {
    navItems.push({ id: 'inventory', label: t.inventory, icon: Boxes });
  }

  if (isOwner || isManager) {
    navItems.push({ id: 'dashboard', label: t.dashboard, icon: LayoutDashboard });
  }

  if (isOwner) {
    navItems.push({ id: 'settings', label: t.settings, icon: Settings });
  }

  return (
    <>
      {/* Desktop / Tablet Sub-header Navigation */}
      <nav className="hidden md:block bg-white border-b border-slate-200 print:hidden">
        <div className="max-w-7xl mx-auto px-3 flex space-x-1 overflow-x-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center space-x-2 px-4 py-3 border-b-2 text-sm font-bold whitespace-nowrap transition-colors ${
                  isActive
                    ? 'border-accent-700 text-accent-700 bg-blue-50/50'
                    : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-accent-700' : 'text-slate-500'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Mobile Sticky Bottom Bar (Thumb-friendly for counter phone use) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t-2 border-slate-300 z-40 shadow-lg print:hidden">
        <div className="grid grid-flow-col auto-cols-fr h-16 px-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`flex flex-col items-center justify-center py-1 transition-colors active:scale-95 ${
                  isActive
                    ? 'text-accent-700 font-bold bg-blue-50/70 border-t-2 border-accent-700 -mt-[2px]'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Icon className={`w-5 h-5 mb-0.5 ${isActive ? 'text-accent-700 stroke-[2.5]' : 'text-slate-500'}`} />
                <span className="text-[10px] leading-tight text-center truncate max-w-[64px]">
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}

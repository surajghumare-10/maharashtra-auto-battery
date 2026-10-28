import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { formatCurrency, formatDate, exportToCSV } from '../utils/formatters';
import {
  LayoutDashboard,
  Calendar,
  CreditCard,
  AlertCircle,
  FileSpreadsheet,
  TrendingUp,
  Receipt,
  Layers,
  Clock
} from 'lucide-react';

export default function Dashboard({ onOpenBillDetail }) {
  const { t } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const res = await api.getDashboard();
      setData(res);
    } catch (err) {
      console.error('Error loading dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleExportCSV = () => {
    if (!data) return;
    const weeklyData = data.last7Days.map(d => ({
      'Date': d.sale_date,
      'Bills Count': d.bills_count,
      'Daily Total (₹)': d.daily_total
    }));
    exportToCSV(`sales_summary_${new Date().toISOString().split('T')[0]}.csv`, weeklyData);
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8 text-center text-slate-500 font-bold">
        Loading dashboard metrics...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8 text-center text-red-500 font-bold">
        Failed to load dashboard data.
      </div>
    );
  }

  const { today = {}, overall = {}, last7Days = [], monthlySales = [], recentBills = [] } = data;

  return (
    <div className="max-w-7xl mx-auto px-3 py-3 sm:py-6 pb-28">
      {/* Title & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b-2 border-slate-200 pb-3 mb-4">
        <div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center space-x-2">
            <span>{t.dashboard}</span>
            <span className="text-xs bg-slate-200 text-slate-800 font-bold px-2 py-0.5 rounded">
              Today: {formatDate(new Date())}
            </span>
          </h2>
          <p className="text-xs text-slate-500 font-semibold mt-0.5">
            Today's revenue, collections, credit split, and sales summaries
          </p>
        </div>

        <button
          type="button"
          onClick={handleExportCSV}
          className="px-3.5 py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs border border-slate-300 flex items-center space-x-1.5 active:bg-slate-300 self-start sm:self-auto"
        >
          <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
          <span>{t.export_csv}</span>
        </button>
      </div>

      {/* TODAY'S METRICS STRIP */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {/* Today's Sales */}
        <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-3 shadow-sm">
          <div className="text-[11px] font-black text-blue-800 uppercase tracking-wider">
            Today's Sales Total
          </div>
          <div className="text-2xl font-black text-blue-900 mt-1">
            {formatCurrency(today.totalSales || 0)}
          </div>
          <div className="text-[11px] font-bold text-blue-700 mt-0.5">
            {today.billCount || 0} bills generated today
          </div>
        </div>

        {/* Total Cash / Money Collected Today */}
        <div className="bg-emerald-50 border-2 border-emerald-300 rounded-lg p-3 shadow-sm">
          <div className="text-[11px] font-black text-emerald-800 uppercase tracking-wider">
            Today's Total Cash In
          </div>
          <div className="text-2xl font-black text-emerald-700 mt-1">
            {formatCurrency(today.totalCollected || 0)}
          </div>
          <div className="text-[11px] font-bold text-emerald-800 mt-0.5">
            Bills paid + {formatCurrency(today.duesCollected || 0)} dues recovered
          </div>
        </div>

        {/* Credit Given Today */}
        <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-3 shadow-sm">
          <div className="text-[11px] font-black text-amber-800 uppercase tracking-wider">
            Today's Credit Given
          </div>
          <div className="text-2xl font-black text-amber-900 mt-1">
            {formatCurrency(today.totalCreditGiven || 0)}
          </div>
          <div className="text-[11px] font-bold text-amber-800 mt-0.5">
            Billed on pay-later credit today
          </div>
        </div>

        {/* All Time Outstanding Dues */}
        <div className="bg-red-50 border-2 border-red-300 rounded-lg p-3 shadow-sm">
          <div className="text-[11px] font-black text-red-800 uppercase tracking-wider">
            All-Time Pending Dues
          </div>
          <div className="text-2xl font-black text-red-600 mt-1">
            {formatCurrency(overall.totalPendingDues || 0)}
          </div>
          <div className="text-[11px] font-bold text-red-700 mt-0.5">
            Total uncollected customer balance
          </div>
        </div>
      </div>

      {/* TODAY'S PAYMENT MODE SPLIT */}
      <div className="bg-white border-2 border-slate-300 rounded-lg p-4 shadow-sm mb-5">
        <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider mb-3">
          Today's Collections Split by Payment Mode
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {['UPI', 'Cash', 'Card', 'Credit'].map(mode => {
            const split = today.modeSplits?.find(s => s.payment_mode === mode);
            const amount = split ? split.amount : 0;
            const count = split ? split.count : 0;

            return (
              <div key={mode} className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <span className="text-xs font-bold text-slate-600 block">{mode}</span>
                <span className="text-lg font-black text-slate-900 block mt-0.5">
                  {formatCurrency(amount)}
                </span>
                <span className="text-[11px] font-semibold text-slate-500">
                  {count} {count === 1 ? 'bill' : 'bills'}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* SALES CHARTS & RECENT BILLS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Weekly Trend (Last 7 Days) */}
        <div className="bg-white border-2 border-slate-300 rounded-lg p-4 shadow-sm">
          <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider mb-3 flex items-center space-x-1.5">
            <Calendar className="w-4 h-4 text-accent-700" />
            <span>Daily Sales Trend (Last 7 Days)</span>
          </h3>

          <div className="space-y-2">
            {last7Days.map(d => {
              const maxVal = Math.max(...last7Days.map(x => x.daily_total), 1);
              const percentage = Math.round((d.daily_total / maxVal) * 100);

              return (
                <div key={d.sale_date} className="text-xs">
                  <div className="flex justify-between font-bold text-slate-800 mb-0.5">
                    <span>{formatDate(d.sale_date)}</span>
                    <span>{formatCurrency(d.daily_total)} ({d.bills_count} bills)</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                    <div
                      className="bg-accent-700 h-2.5 rounded-full"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent Bills */}
        <div className="bg-white border-2 border-slate-300 rounded-lg p-4 shadow-sm">
          <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider mb-3 flex items-center space-x-1.5">
            <Receipt className="w-4 h-4 text-accent-700" />
            <span>Recent Counter Bills</span>
          </h3>

          <div className="divide-y divide-slate-200">
            {recentBills.map(b => (
              <div
                key={b.id}
                onClick={() => onOpenBillDetail && onOpenBillDetail(b.id)}
                className="py-2.5 flex justify-between items-center text-xs hover:bg-slate-50 cursor-pointer rounded px-1"
              >
                <div>
                  <div className="font-bold text-slate-900">
                    <span className="text-accent-700">{b.bill_no}</span> • {b.customer_name}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {(b.items && b.items.length > 0)
                      ? b.items.map(i => `${i.brand} ${i.model_name} x${i.quantity}`).join(' + ')
                      : `${b.battery_brand} ${b.battery_model}`}
                    {' • '}{b.payment_mode} • By {b.created_by_name?.split(' ')[0]}
                  </div>
                </div>
                <div className="text-right font-black text-slate-900 text-sm">
                  {formatCurrency(b.grand_total)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import { api } from '../services/api';
import { formatCurrency, formatDate } from '../utils/formatters';
import { ShieldCheck, ShieldAlert, Search, AlertCircle, CheckCircle, XCircle, CalendarDays } from 'lucide-react';

export default function WarrantyCheck() {
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleCheck = async (e) => {
    e?.preventDefault();
    if (!search.trim()) {
      setError('Enter a battery serial number, customer mobile, or bill number.');
      return;
    }
    setError('');
    setLoading(true);
    setResult(null);
    try {
      const res = await api.checkWarranty(search.trim());
      setResult(res);
    } catch (err) {
      setError(err.message || 'Warranty lookup failed');
    } finally {
      setLoading(false);
    }
  };

  const isValid = result?.status === 'valid';
  const isExpired = result?.status === 'expired';

  return (
    <div className="max-w-3xl mx-auto px-3 py-3 sm:py-6 pb-28">
      <div className="border-b-2 border-slate-200 pb-3 mb-4">
        <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center space-x-2">
          <ShieldCheck className="w-5 h-5 text-accent-700" />
          <span>Warranty Check</span>
        </h2>
        <p className="text-xs text-slate-500 font-semibold mt-0.5">
          Check whether a battery is still under warranty. Expired batteries must clearly show a NOT COVERED error.
        </p>
      </div>

      <form onSubmit={handleCheck} className="bg-white border-2 border-slate-300 rounded-lg p-3 sm:p-4 shadow-sm mb-4">
        <label className="block text-xs font-black text-slate-700 uppercase mb-1">
          Serial No / Customer Mobile / Bill No
        </label>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="e.g. EX-88910, 9876543210, or MAB-0001"
              className="w-full h-11 pl-9 pr-3 border-2 border-slate-300 rounded text-sm font-bold focus:border-accent-700 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="h-11 px-5 bg-accent-700 hover:bg-accent-800 text-white font-black rounded-lg text-sm disabled:opacity-50"
          >
            {loading ? 'Checking...' : 'Check Warranty'}
          </button>
        </div>
      </form>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-300 rounded text-red-800 text-xs font-bold flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {result && result.found === false && (
        <div className="p-4 bg-slate-100 border-2 border-slate-300 rounded-lg text-center">
          <XCircle className="w-8 h-8 text-slate-500 mx-auto mb-1" />
          <div className="font-black text-slate-800">No Matching Bill Found</div>
          <p className="text-xs text-slate-600 font-semibold mt-1">{result.message}</p>
        </div>
      )}

      {result && result.found && (
        <div className={`border-2 rounded-xl overflow-hidden shadow-sm ${isValid ? 'border-emerald-500' : 'border-red-500'}`}>
          <div className={`p-4 ${isValid ? 'bg-emerald-600' : 'bg-red-600'} text-white`}>
            <div className="flex items-start space-x-3">
              {isValid ? (
                <ShieldCheck className="w-9 h-9 flex-shrink-0" />
              ) : (
                <ShieldAlert className="w-9 h-9 flex-shrink-0" />
              )}
              <div>
                <div className="text-xl font-black uppercase tracking-wide">
                  {isValid ? 'Warranty Valid' : 'Warranty Expired — Not Covered'}
                </div>
                <p className="text-xs sm:text-sm font-semibold mt-0.5 text-white/90">{result.message}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs mb-3">
              <div className="space-y-1">
                <div className="font-black text-slate-900 text-sm">{result.bill.battery_brand} {result.bill.battery_model}</div>
                <div className="text-slate-600">{result.bill.battery_type} • {result.bill.capacity_ah}Ah • Qty {result.bill.quantity}</div>
                <div className="text-slate-600">Serial No: <strong className="font-mono text-slate-900">{result.bill.serial_number || 'N/A'}</strong></div>
              </div>
              <div className="space-y-1 sm:text-right">
                <div className="text-slate-500 font-semibold">Bill No: <strong className="text-slate-900">{result.bill.bill_no}</strong></div>
                <div className="text-slate-500 font-semibold">Customer: <strong className="text-slate-900">{result.bill.customer_name}</strong></div>
                <div className="text-slate-500 font-semibold">+91 {result.bill.customer_mobile}</div>
                {result.bill.vehicle_number && <div className="text-slate-500 font-semibold">Vehicle: {result.bill.vehicle_number}</div>}
                {result.bill.village_name && <div className="text-slate-500 font-semibold">Village: {result.bill.village_name}</div>}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 border-t pt-3">
              <div className="p-2 bg-slate-50 rounded border">
                <div className="text-[10px] font-black uppercase text-slate-500">Purchase Date</div>
                <div className="text-xs font-bold text-slate-900 flex items-center space-x-1">
                  <CalendarDays className="w-3 h-3" />
                  <span>{formatDate(result.purchaseDate)}</span>
                </div>
              </div>
              <div className="p-2 bg-slate-50 rounded border">
                <div className="text-[10px] font-black uppercase text-slate-500">Warranty</div>
                <div className="text-xs font-bold text-slate-900">{result.warrantyMonths} months</div>
              </div>
              <div className={`p-2 rounded border ${isValid ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                <div className="text-[10px] font-black uppercase text-slate-500">{isValid ? 'Expires On' : 'Expired On'}</div>
                <div className={`text-xs font-bold ${isValid ? 'text-emerald-800' : 'text-red-700'}`}>{formatDate(result.expiryDate)}</div>
              </div>
            </div>

            <div className={`mt-3 p-3 rounded-lg border text-xs font-bold flex items-start space-x-2 ${isValid ? 'bg-emerald-50 border-emerald-300 text-emerald-900' : 'bg-red-50 border-red-300 text-red-800'}`}>
              {isValid ? <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> : <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
              <span>
                {isValid
                  ? `${Math.max(0, Math.ceil(result.daysRemaining))} days (${result.monthsRemaining} months) of warranty remaining. Battery is eligible for warranty service as per manufacturer policy.`
                  : `This battery's warranty ended ${result.daysExpired} days ago. Free replacement is NOT allowed. Do not accept this battery as a warranty claim.`}
              </span>
            </div>

            {result.bill.grand_total > 0 && (
              <div className="mt-2 text-[11px] text-slate-500 font-semibold">
                Original bill amount: {formatCurrency(result.bill.grand_total)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

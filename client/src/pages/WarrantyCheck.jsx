import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { formatCurrency, formatDate } from '../utils/formatters';
import {
  ShieldCheck, ShieldAlert, Search, AlertCircle, CheckCircle, XCircle, CalendarDays,
  ScanLine, Wrench, Truck, PackageCheck, History
} from 'lucide-react';

const BarcodeScanner = React.lazy(() => import('../components/BarcodeScanner'));

export default function WarrantyCheck() {
  const { isOwner, isManager } = useAuth();
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [scanTarget, setScanTarget] = useState('search');

  const [newSerial, setNewSerial] = useState('');
  const [dealerName, setDealerName] = useState('');
  const [replacementNotes, setReplacementNotes] = useState('');
  const [dealers, setDealers] = useState([]);
  const [savingReplacement, setSavingReplacement] = useState(false);
  const [replacementError, setReplacementError] = useState('');
  const [replacementSuccess, setReplacementSuccess] = useState('');
  const [recentReplacements, setRecentReplacements] = useState([]);
  const [replacementStats, setReplacementStats] = useState({ pending: 0, received: 0, total: 0 });
  const [replacementsLoading, setReplacementsLoading] = useState(false);
  const [markingId, setMarkingId] = useState(null);

  const loadReplacements = async () => {
    setReplacementsLoading(true);
    try {
      const res = await api.getWarrantyReplacements();
      setRecentReplacements(res.replacements || []);
      setReplacementStats(res.stats || { pending: 0, received: 0, total: 0 });
    } catch (err) {
      console.error('Failed to load warranty replacements:', err);
    } finally {
      setReplacementsLoading(false);
    }
  };

  useEffect(() => {
    loadReplacements();
    api.getSupplierOptions()
      .then((res) => setDealers(res.suppliers || []))
      .catch(() => setDealers([]));
  }, []);

  const resetReplacementForm = () => {
    setNewSerial('');
    setDealerName('');
    setReplacementNotes('');
    setReplacementError('');
    setReplacementSuccess('');
  };

  const checkValue = async (rawValue) => {
    const value = String(rawValue || '').trim();
    if (!value) {
      setError('Enter a battery serial number, customer name, mobile, or bill number.');
      return;
    }
    setError('');
    setLoading(true);
    setResult(null);
    resetReplacementForm();
    try {
      const res = await api.checkWarranty(value);
      setResult(res);
    } catch (err) {
      setError(err.message || 'Warranty lookup failed');
    } finally {
      setLoading(false);
    }
  };

  const handleCheck = (e) => {
    e?.preventDefault();
    checkValue(search);
  };

  const handleSaveReplacement = async (e) => {
    e.preventDefault();
    if (!result?.bill?.serial_number) return;
    if (!newSerial.trim()) {
      setReplacementError('Scan or enter the new battery serial number.');
      return;
    }

    setSavingReplacement(true);
    setReplacementError('');
    setReplacementSuccess('');
    try {
      const res = await api.createWarrantyReplacement({
        old_serial_number: result.bill.serial_number,
        new_serial_number: newSerial.trim(),
        supplier_name: dealerName.trim(),
        notes: replacementNotes.trim()
      });
      setResult((previous) => ({ ...previous, replacement: res.replacement }));
      setReplacementSuccess('Replacement recorded. Stock reduced by 1 and the old battery is marked as sent to the dealer.');
      setNewSerial('');
      setReplacementNotes('');
      await loadReplacements();
    } catch (err) {
      setReplacementError(err.message || 'Could not record warranty replacement');
    } finally {
      setSavingReplacement(false);
    }
  };

  const handleReceiveReplacement = async (id) => {
    setMarkingId(id);
    setReplacementError('');
    setReplacementSuccess('');
    try {
      const res = await api.receiveWarrantyReplacement(id);
      setResult((previous) => (
        previous?.replacement?.id === id
          ? { ...previous, replacement: res.replacement }
          : previous
      ));
      setReplacementSuccess('Dealer replacement received. Stock increased by 1.');
      await loadReplacements();
    } catch (err) {
      setReplacementError(err.message || 'Could not mark dealer replacement received');
    } finally {
      setMarkingId(null);
    }
  };

  const isValid = result?.status === 'valid';
  const isExpired = result?.status === 'expired';
  const canReceive = isOwner || isManager;

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
          Serial No / Customer Name / Mobile / Bill No
        </label>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="e.g. EX-88910, Suraj, 9876543210, or MAB-0001"
              className="w-full h-11 pl-9 pr-3 border-2 border-slate-300 rounded text-sm font-bold focus:border-accent-700 focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={() => { setScanTarget('search'); setShowScanner(true); }}
            className="h-11 px-3 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-lg text-sm border-2 border-slate-300 flex items-center justify-center space-x-1.5"
            title="Scan battery barcode"
          >
            <ScanLine className="w-4 h-4" />
            <span>Scan</span>
          </button>
          <button
            type="submit"
            disabled={loading}
            className="h-11 px-5 bg-accent-700 hover:bg-accent-800 text-white font-black rounded-lg text-sm disabled:opacity-50"
          >
            {loading ? 'Checking...' : 'Check Warranty'}
          </button>
        </div>
      </form>

      <React.Suspense fallback={null}>
        <BarcodeScanner
          open={showScanner}
          onClose={() => setShowScanner(false)}
          onDetected={(value) => {
            const code = String(value || '').trim();
            if (scanTarget === 'new_serial') {
              setNewSerial(code);
              setShowScanner(false);
            } else {
              setSearch(code);
              checkValue(code);
            }
          }}
          title="Scan Serial Barcode / QR"
        />
      </React.Suspense>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-300 rounded text-red-800 text-xs font-bold flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {replacementSuccess && (
        <div className="mb-4 p-3 bg-emerald-50 border border-emerald-300 rounded text-emerald-900 text-xs font-bold flex items-start space-x-2">
          <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{replacementSuccess}</span>
        </div>
      )}
      {replacementError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-300 rounded text-red-800 text-xs font-bold flex items-start space-x-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{replacementError}</span>
        </div>
      )}

      {result && result.found === false && (
        <div className="p-4 bg-slate-100 border-2 border-slate-300 rounded-lg text-center">
          <XCircle className="w-8 h-8 text-slate-500 mx-auto mb-1" />
          <div className="font-black text-slate-800">No Matching Bill Found</div>
          <p className="text-xs text-slate-600 font-semibold mt-1">{result.message}</p>
        </div>
      )}

      {result && result.found && result.multiple && (
        <div className="bg-white border-2 border-slate-300 rounded-lg shadow-sm overflow-hidden">
          <div className="px-3 py-2 bg-slate-100 border-b border-slate-300">
            <div className="text-sm font-black text-slate-900">{result.count} Bills Found</div>
            <p className="text-[11px] text-slate-600 font-semibold">{result.message}</p>
          </div>
          <div className="divide-y divide-slate-200">
            {result.matches.map((m) => (
              <button
                key={m.bill_no}
                type="button"
                onClick={() => { setSearch(m.bill_no); checkValue(m.bill_no); }}
                className="w-full text-left px-3 py-2.5 hover:bg-slate-50"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-black text-slate-900">{m.bill_no} · {m.customer_name}</span>
                  <span className={`text-[10px] font-black uppercase px-1.5 py-0.5 rounded ${m.isUnderWarranty ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'}`}>
                    {m.isUnderWarranty ? 'Valid' : 'Expired'}
                  </span>
                </div>
                <div className="text-[11px] text-slate-600 font-semibold mt-0.5 truncate">{m.battery_desc}</div>
                <div className="text-[11px] text-slate-500 font-semibold mt-0.5">
                  {m.customer_mobile} · Purchase {formatDate(m.purchaseDate)} · Warranty {m.warrantyMonths} months · Expires {formatDate(m.expiryDate)}
                </div>
                {m.serial_number && (
                  <div className="text-[11px] text-slate-500 font-semibold mt-0.5">Serial: <span className="font-mono">{m.serial_number}</span></div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {result && result.found && !result.multiple && (
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
                <div className="text-slate-600">
                  {result.bill.battery_type}
                  {result.bill.capacity_ah ? ` • ${result.bill.capacity_ah}Ah` : ''}
                  {result.bill.quantity ? ` • Qty ${result.bill.quantity}` : ''}
                </div>
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

      {result && result.found && !result.multiple && isValid && (
        <div className="mt-3">
          {result.replacement ? (
            <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center space-x-2">
                  <Truck className="w-5 h-5 text-amber-800" />
                  <div>
                    <div className="text-sm font-black text-slate-900">Warranty Replacement Recorded</div>
                    <div className="text-[11px] text-slate-600 font-semibold">
                      This old battery has already been sent to the dealer.
                    </div>
                  </div>
                </div>
                <span className={`text-[10px] font-black uppercase px-2 py-1 rounded ${
                  result.replacement.status === 'replacement_received'
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-200 text-amber-900'
                }`}>
                  {result.replacement.status === 'replacement_received' ? 'Stock Restored' : 'Pending Dealer'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 text-xs">
                <div className="p-2 bg-white rounded border">
                  <div className="text-[10px] font-black uppercase text-slate-500">Old Serial</div>
                  <div className="font-mono font-bold text-slate-900 break-all">{result.replacement.old_serial_number}</div>
                </div>
                <div className="p-2 bg-white rounded border">
                  <div className="text-[10px] font-black uppercase text-slate-500">New Serial Given</div>
                  <div className="font-mono font-bold text-slate-900 break-all">{result.replacement.new_serial_number}</div>
                </div>
              </div>

              <div className="mt-2 text-[11px] text-slate-600 font-semibold">
                {result.replacement.supplier_name ? `Dealer: ${result.replacement.supplier_name} · ` : ''}
                Recorded {formatDate(result.replacement.replacement_date)}
                {result.replacement.dealer_received_at ? ` · Dealer received ${formatDate(result.replacement.dealer_received_at)}` : ''}
              </div>

              {result.replacement.status === 'pending_dealer' && canReceive && (
                <button
                  type="button"
                  onClick={() => handleReceiveReplacement(result.replacement.id)}
                  disabled={markingId === result.replacement.id}
                  className="mt-3 w-full h-10 bg-emerald-700 hover:bg-emerald-800 text-white font-black rounded-lg text-xs disabled:opacity-50 flex items-center justify-center space-x-2"
                >
                  <PackageCheck className="w-4 h-4" />
                  <span>{markingId === result.replacement.id ? 'Saving...' : 'Mark Dealer Replacement Received'}</span>
                </button>
              )}
            </div>
          ) : (
            <form onSubmit={handleSaveReplacement} className="bg-white border-2 border-amber-300 rounded-xl p-4 shadow-sm">
              <div className="flex items-start space-x-2 mb-3">
                <Wrench className="w-5 h-5 text-amber-800 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-black text-slate-900">Record Warranty Replacement</div>
                  <p className="text-[11px] text-slate-600 font-semibold">
                    Give the new battery from stock, record its serial, and send the old battery to the dealer.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-600 mb-1">Old Serial Number</label>
                  <input
                    type="text"
                    value={result.bill.serial_number || ''}
                    readOnly
                    className="w-full h-10 px-2 border-2 border-slate-300 rounded bg-slate-100 text-xs font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-600 mb-1">Replacement Battery</label>
                  <input
                    type="text"
                    value={`${result.bill.battery_brand || ''} ${result.bill.battery_model || ''}`.trim()}
                    readOnly
                    className="w-full h-10 px-2 border-2 border-slate-300 rounded bg-slate-100 text-xs font-bold"
                  />
                </div>
              </div>

              <div className="mt-2">
                <label className="block text-[10px] font-black uppercase text-slate-600 mb-1">New Battery Serial Number</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newSerial}
                    onChange={(e) => setNewSerial(e.target.value)}
                    placeholder="Scan or type new battery serial"
                    className="flex-1 h-10 px-2 border-2 border-slate-300 rounded text-xs font-mono font-bold focus:border-amber-600 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => { setScanTarget('new_serial'); setShowScanner(true); }}
                    className="h-10 px-3 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded border-2 border-slate-300 flex items-center space-x-1"
                  >
                    <ScanLine className="w-4 h-4" />
                    <span className="text-xs">Scan</span>
                  </button>
                </div>
              </div>

              <div className="mt-2">
                <label className="block text-[10px] font-black uppercase text-slate-600 mb-1">Dealer / Supplier (optional)</label>
                <input
                  type="text"
                  list="warranty-dealer-options"
                  value={dealerName}
                  onChange={(e) => setDealerName(e.target.value)}
                  placeholder="Dealer name"
                  className="w-full h-10 px-2 border-2 border-slate-300 rounded text-xs font-bold focus:border-amber-600 focus:outline-none"
                />
                <datalist id="warranty-dealer-options">
                  {dealers.map((dealer) => (
                    <option key={dealer.id} value={dealer.name} />
                  ))}
                </datalist>
              </div>

              <div className="mt-2">
                <label className="block text-[10px] font-black uppercase text-slate-600 mb-1">Notes (optional)</label>
                <textarea
                  value={replacementNotes}
                  onChange={(e) => setReplacementNotes(e.target.value)}
                  rows={2}
                  placeholder="Old battery condition, dealer reference, etc."
                  className="w-full px-2 py-2 border-2 border-slate-300 rounded text-xs font-semibold focus:border-amber-600 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={savingReplacement || !newSerial.trim()}
                className="mt-3 w-full h-10 bg-amber-700 hover:bg-amber-800 text-white font-black rounded-lg text-xs disabled:opacity-50"
              >
                {savingReplacement ? 'Saving...' : 'Save Replacement & Reduce Stock'}
              </button>
            </form>
          )}
        </div>
      )}

      <div className="mt-4 bg-white border-2 border-slate-300 rounded-xl overflow-hidden shadow-sm">
        <div className="px-3 py-2 bg-slate-100 border-b border-slate-300 flex items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <History className="w-4 h-4 text-slate-700" />
            <div className="text-sm font-black text-slate-900">Recent Warranty Replacements</div>
          </div>
          <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-amber-100 text-amber-900">
            {replacementStats.pending || 0} pending dealer
          </span>
        </div>

        {replacementsLoading && (
          <div className="p-4 text-center text-xs font-bold text-slate-500">Loading...</div>
        )}

        {!replacementsLoading && recentReplacements.length === 0 && (
          <div className="p-4 text-center text-xs font-semibold text-slate-500">
            No warranty replacements recorded yet.
          </div>
        )}

        <div className="divide-y divide-slate-200">
          {recentReplacements.map((replacement) => (
            <div key={replacement.id} className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-black text-slate-900 font-mono break-all">
                    {replacement.old_serial_number} → {replacement.new_serial_number}
                  </div>
                  <div className="text-[11px] text-slate-600 font-semibold mt-0.5">
                    {replacement.customer_name || 'Unknown customer'} · {replacement.battery_brand} {replacement.battery_model}
                  </div>
                  <div className="text-[11px] text-slate-500 font-semibold">
                    {replacement.supplier_name ? `Dealer: ${replacement.supplier_name} · ` : ''}
                    {formatDate(replacement.replacement_date)}
                  </div>
                </div>
                <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded whitespace-nowrap ${
                  replacement.status === 'replacement_received'
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-900'
                }`}>
                  {replacement.status === 'replacement_received' ? 'Received' : 'Pending'}
                </span>
              </div>

              {replacement.status === 'pending_dealer' && canReceive && (
                <button
                  type="button"
                  onClick={() => handleReceiveReplacement(replacement.id)}
                  disabled={markingId === replacement.id}
                  className="mt-2 h-8 px-3 bg-emerald-700 hover:bg-emerald-800 text-white font-black rounded text-[10px] disabled:opacity-50"
                >
                  {markingId === replacement.id ? 'Saving...' : 'Mark Dealer Replacement Received'}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

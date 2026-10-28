import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { formatCurrency, formatDate } from '../utils/formatters';
import {
  Store, Plus, Search, IndianRupee, X, Save, AlertCircle, Phone, MapPin, FileText, Wallet
} from 'lucide-react';

export default function DealerKhata() {
  const [data, setData] = useState({ suppliers: [], summary: {} });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [pendingOnly, setPendingOnly] = useState(false);
  const [error, setError] = useState('');

  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', contact_person: '', mobile: '', city: '', notes: '' });

  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [payForm, setPayForm] = useState({ amount: '', payment_mode: 'Cash', reference_no: '', notes: '' });

  const loadSuppliers = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await api.getSuppliers({ search, pendingOnly: pendingOnly ? 'true' : 'false' });
      setData({ suppliers: res.suppliers || [], summary: res.summary || {} });
    } catch (err) {
      setError(err.message || 'Failed to load dealer khata');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(loadSuppliers, 250);
    return () => clearTimeout(timer);
  }, [search, pendingOnly]);

  const openDetail = async (id) => {
    setSelectedId(id);
    setDetailLoading(true);
    setDetail(null);
    try {
      const res = await api.getSupplierDetail(id);
      setDetail(res);
    } catch (err) {
      setError(err.message || 'Failed to load dealer ledger');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleAddDealer = async (e) => {
    e.preventDefault();
    try {
      await api.createSupplier(addForm);
      setShowAddModal(false);
      setAddForm({ name: '', contact_person: '', mobile: '', city: '', notes: '' });
      loadSuppliers();
    } catch (err) {
      alert(err.message || 'Failed to add dealer');
    }
  };

  const handlePayDealer = async (e) => {
    e.preventDefault();
    try {
      await api.paySupplier(selectedId, payForm);
      setShowPayModal(false);
      setPayForm({ amount: '', payment_mode: 'Cash', reference_no: '', notes: '' });
      await openDetail(selectedId);
      loadSuppliers();
    } catch (err) {
      alert(err.message || 'Failed to record dealer payment');
    }
  };

  const summary = data.summary || {};

  return (
    <div className="max-w-6xl mx-auto px-3 py-3 sm:py-6 pb-28">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b-2 border-slate-200 pb-3 mb-4">
        <div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center space-x-2">
            <Store className="w-5 h-5 text-accent-700" />
            <span>Dealer / Supplier Khata</span>
          </h2>
          <p className="text-xs text-slate-500 font-semibold mt-0.5">
            Track stock purchase cost, payments made, and how much is still owed to each dealer.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="h-10 px-4 bg-accent-700 hover:bg-accent-800 text-white font-bold rounded-lg text-xs flex items-center justify-center space-x-1.5 shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>Add Dealer</span>
        </button>
      </div>

      {error && (
        <div className="mb-3 p-3 bg-red-50 border border-red-300 rounded text-red-800 text-xs font-bold flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
        <div className="bg-white border-2 border-slate-300 rounded-lg p-3">
          <div className="text-[10px] font-black uppercase text-slate-500">Total Payable</div>
          <div className="text-lg sm:text-xl font-black text-red-600">{formatCurrency(summary.totalPayable)}</div>
        </div>
        <div className="bg-white border-2 border-slate-300 rounded-lg p-3">
          <div className="text-[10px] font-black uppercase text-slate-500">Dealers With Dues</div>
          <div className="text-lg sm:text-xl font-black text-amber-700">{summary.dealersWithDues || 0}</div>
        </div>
        <div className="bg-white border-2 border-slate-300 rounded-lg p-3">
          <div className="text-[10px] font-black uppercase text-slate-500">Total Purchased</div>
          <div className="text-lg sm:text-xl font-black text-slate-900">{formatCurrency(summary.totalPurchased)}</div>
        </div>
        <div className="bg-white border-2 border-slate-300 rounded-lg p-3">
          <div className="text-[10px] font-black uppercase text-slate-500">Total Paid</div>
          <div className="text-lg sm:text-xl font-black text-emerald-700">{formatCurrency(summary.totalPaid)}</div>
        </div>
      </div>

      <div className="bg-white border-2 border-slate-300 rounded-lg overflow-hidden">
        <div className="p-3 border-b border-slate-200 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search dealer by name, city, or mobile..."
              className="w-full h-10 pl-9 pr-3 border border-slate-300 rounded text-xs font-semibold focus:border-accent-700 focus:outline-none"
            />
          </div>
          <label className="flex items-center space-x-2 text-xs font-bold text-slate-700 cursor-pointer">
            <input type="checkbox" checked={pendingOnly} onChange={(e) => setPendingOnly(e.target.checked)} className="w-4 h-4" />
            <span>Only dealers with pending payment</span>
          </label>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm font-bold text-slate-500">Loading dealer khata...</div>
        ) : data.suppliers.length === 0 ? (
          <div className="p-8 text-center text-sm font-bold text-slate-500">No dealers found. Add a dealer to start tracking payables.</div>
        ) : (
          <div className="divide-y divide-slate-200">
            {data.suppliers.map(d => (
              <button
                key={d.id}
                type="button"
                onClick={() => openDetail(d.id)}
                className="w-full text-left p-3 hover:bg-blue-50/50 active:bg-blue-50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="font-black text-sm text-slate-900">{d.name}</div>
                  <div className="text-[11px] text-slate-500 font-semibold flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                    {d.city && <span className="inline-flex items-center space-x-1"><MapPin className="w-3 h-3" /><span>{d.city}</span></span>}
                    {d.mobile && <span className="inline-flex items-center space-x-1"><Phone className="w-3 h-3" /><span>{d.mobile}</span></span>}
                    {d.last_purchase_date && <span>Last purchase: {formatDate(d.last_purchase_date)}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-4 sm:text-right">
                  <div>
                    <div className="text-[10px] font-bold uppercase text-slate-400">Purchased</div>
                    <div className="text-xs font-bold text-slate-700">{formatCurrency(d.total_purchased)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase text-slate-400">Paid</div>
                    <div className="text-xs font-bold text-emerald-700">{formatCurrency(d.total_paid)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase text-slate-400">Balance</div>
                    <div className={`text-sm font-black ${d.balance_due > 0 ? 'text-red-600' : 'text-slate-700'}`}>
                      {formatCurrency(d.balance_due)}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ADD DEALER MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-3 overflow-y-auto">
          <div className="bg-white rounded-xl max-w-md w-full p-5 border-2 border-accent-700 shadow-2xl my-auto">
            <div className="flex justify-between items-center border-b pb-2 mb-3">
              <h3 className="text-base font-black text-slate-900">Add Dealer / Supplier</h3>
              <button type="button" onClick={() => setShowAddModal(false)}><X className="w-5 h-5 text-slate-500" /></button>
            </div>
            <form onSubmit={handleAddDealer} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Dealer Name *</label>
                <input required value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })} className="w-full h-10 px-2.5 border rounded font-semibold" placeholder="e.g. Exide Depot Chinchwad" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Contact Person</label>
                  <input value={addForm.contact_person} onChange={(e) => setAddForm({ ...addForm, contact_person: e.target.value })} className="w-full h-10 px-2.5 border rounded" />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Mobile</label>
                  <input value={addForm.mobile} onChange={(e) => setAddForm({ ...addForm, mobile: e.target.value })} className="w-full h-10 px-2.5 border rounded" />
                </div>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">City</label>
                <input value={addForm.city} onChange={(e) => setAddForm({ ...addForm, city: e.target.value })} className="w-full h-10 px-2.5 border rounded" />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Notes</label>
                <textarea rows={2} value={addForm.notes} onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })} className="w-full p-2 border rounded" />
              </div>
              <div className="flex justify-end space-x-2 pt-2 border-t">
                <button type="button" onClick={() => setShowAddModal(false)} className="px-3 py-2 bg-slate-100 rounded text-slate-700 font-bold border">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-accent-700 text-white rounded font-black shadow flex items-center space-x-1"><Save className="w-3.5 h-3.5" /><span>Save Dealer</span></button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DEALER LEDGER MODAL */}
      {selectedId && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-start sm:items-center justify-center p-2 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-xl max-w-2xl w-full p-4 sm:p-5 border-2 border-slate-800 shadow-2xl my-4 sm:my-auto">
            <div className="flex justify-between items-start border-b pb-2 mb-3">
              <div>
                <h3 className="text-base font-black text-slate-900">{detail?.supplier?.name || 'Dealer Ledger'}</h3>
                {detail?.supplier && (
                  <p className="text-[11px] text-slate-500 font-semibold">
                    {[detail.supplier.contact_person, detail.supplier.mobile, detail.supplier.city].filter(Boolean).join(' • ')}
                  </p>
                )}
              </div>
              <button type="button" onClick={() => { setSelectedId(null); setDetail(null); }}><X className="w-5 h-5 text-slate-500" /></button>
            </div>

            {detailLoading ? (
              <div className="p-8 text-center text-sm font-bold text-slate-500">Loading ledger...</div>
            ) : detail ? (
              <>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className="p-2.5 bg-slate-50 border rounded-lg">
                    <div className="text-[10px] font-black uppercase text-slate-500">Purchased</div>
                    <div className="text-sm font-black text-slate-900">{formatCurrency(detail.summary.total_purchased)}</div>
                  </div>
                  <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg">
                    <div className="text-[10px] font-black uppercase text-emerald-700">Paid</div>
                    <div className="text-sm font-black text-emerald-800">{formatCurrency(detail.summary.total_paid)}</div>
                  </div>
                  <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg">
                    <div className="text-[10px] font-black uppercase text-red-700">Balance Payable</div>
                    <div className="text-sm font-black text-red-700">{formatCurrency(detail.summary.balance_due)}</div>
                  </div>
                </div>

                <div className="flex justify-end mb-3">
                  <button
                    type="button"
                    disabled={detail.summary.balance_due <= 0}
                    onClick={() => setShowPayModal(true)}
                    className="h-10 px-4 bg-accent-700 hover:bg-accent-800 text-white font-black rounded-lg text-xs flex items-center space-x-1.5 disabled:opacity-40"
                  >
                    <IndianRupee className="w-4 h-4" />
                    <span>Record Payment to Dealer</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[50vh] overflow-y-auto">
                  <div>
                    <h4 className="text-xs font-black uppercase text-slate-600 mb-1 flex items-center space-x-1"><FileText className="w-3.5 h-3.5" /><span>Stock Purchases</span></h4>
                    <div className="divide-y divide-slate-100 border rounded">
                      {detail.purchases.length === 0 ? (
                        <div className="p-3 text-xs text-slate-500 font-semibold">No purchases recorded.</div>
                      ) : detail.purchases.map(p => (
                        <div key={p.id} className="p-2 text-[11px]">
                          <div className="font-bold text-slate-900">{p.brand} {p.model_name} x{p.quantity}</div>
                          <div className="text-slate-500">
                            {formatDate(p.created_at)} • ₹{p.cost_price}/unit
                            {p.reference_id ? ` • ${p.reference_id}` : ''}
                          </div>
                          <div className="flex justify-between mt-0.5">
                            <span className="font-bold">Cost: {formatCurrency(p.total_cost)}</span>
                            {p.balance_due > 0 && <span className="text-red-600 font-bold">Due: {formatCurrency(p.balance_due)}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-xs font-black uppercase text-slate-600 mb-1 flex items-center space-x-1"><Wallet className="w-3.5 h-3.5" /><span>Payments Made</span></h4>
                    <div className="divide-y divide-slate-100 border rounded">
                      {detail.payments.length === 0 ? (
                        <div className="p-3 text-xs text-slate-500 font-semibold">No payments recorded.</div>
                      ) : detail.payments.map(p => (
                        <div key={p.id} className="p-2 text-[11px]">
                          <div className="flex justify-between">
                            <span className="font-black text-emerald-700">{formatCurrency(p.amount)}</span>
                            <span className="font-bold text-slate-700">{p.payment_mode}</span>
                          </div>
                          <div className="text-slate-500">
                            {formatDate(p.created_at)} • by {p.paid_by_name}
                            {p.reference_no ? ` • ${p.reference_no}` : ''}
                          </div>
                          {p.notes && <div className="text-slate-500 mt-0.5">{p.notes}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}

      {/* PAY DEALER MODAL */}
      {showPayModal && detail && (
        <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-3">
          <div className="bg-white rounded-xl max-w-sm w-full p-5 border-2 border-accent-700 shadow-2xl">
            <div className="flex justify-between items-center border-b pb-2 mb-3">
              <h3 className="text-sm font-black text-slate-900">Pay {detail.supplier.name}</h3>
              <button type="button" onClick={() => setShowPayModal(false)}><X className="w-5 h-5 text-slate-500" /></button>
            </div>
            <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-xs font-bold text-red-700">
              Outstanding payable: {formatCurrency(detail.summary.balance_due)}
            </div>
            <form onSubmit={handlePayDealer} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Amount Paid *</label>
                <input
                  type="number"
                  required
                  min="1"
                  max={detail.summary.balance_due}
                  value={payForm.amount}
                  onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
                  className="w-full h-10 px-2.5 border-2 border-slate-300 rounded font-black text-base"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Payment Mode</label>
                <select value={payForm.payment_mode} onChange={(e) => setPayForm({ ...payForm, payment_mode: e.target.value })} className="w-full h-10 px-2.5 border rounded font-semibold bg-white">
                  <option>Cash</option>
                  <option>UPI</option>
                  <option>Bank Transfer</option>
                  <option>Cheque</option>
                </select>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Reference No / Cheque No</label>
                <input value={payForm.reference_no} onChange={(e) => setPayForm({ ...payForm, reference_no: e.target.value })} className="w-full h-10 px-2.5 border rounded" />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Notes</label>
                <input value={payForm.notes} onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })} className="w-full h-10 px-2.5 border rounded" />
              </div>
              <div className="flex justify-end space-x-2 pt-2 border-t">
                <button type="button" onClick={() => setShowPayModal(false)} className="px-3 py-2 bg-slate-100 rounded text-slate-700 font-bold border">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-accent-700 text-white rounded font-black shadow">Save Payment</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

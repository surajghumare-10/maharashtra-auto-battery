import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { formatDate } from '../utils/formatters';
import {
  ArrowLeftRight,
  Plus,
  Search,
  RotateCcw,
  CheckCircle,
  AlertCircle,
  Package,
  CalendarDays,
  User,
  Phone,
  Clock
} from 'lucide-react';

const PARTY_TYPES = ['Customer', 'Dealer', 'Staff', 'Other'];

function todayValue() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

const emptyForm = {
  direction: 'lent',
  party_type: 'Customer',
  party_name: '',
  party_mobile: '',
  battery_id: '',
  quantity: 1,
  serial_number: '',
  loan_date: todayValue(),
  expected_return_date: '',
  notes: ''
};

export default function BatteryLoans() {
  const [batteries, setBatteries] = useState([]);
  const [loans, setLoans] = useState([]);
  const [stats, setStats] = useState({});
  const [statusFilter, setStatusFilter] = useState('open');
  const [directionFilter, setDirectionFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [returningId, setReturningId] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    loadBatteries();
  }, []);

  useEffect(() => {
    loadLoans();
  }, [statusFilter, directionFilter]);

  const loadBatteries = async () => {
    try {
      const res = await api.getBatteries();
      setBatteries(res.batteries || []);
    } catch (err) {
      setError(err.message || 'Failed to load battery catalog');
    }
  };

  const loadLoans = async () => {
    setLoading(true);
    try {
      const params = { status: statusFilter, direction: directionFilter };
      if (search.trim()) params.search = search.trim();
      const res = await api.getLoans(params);
      setLoans(res.loans || []);
      setStats(res.stats || {});
    } catch (err) {
      setError(err.message || 'Failed to load battery loans');
    } finally {
      setLoading(false);
    }
  };

  const selectedBattery = batteries.find(b => String(b.id) === String(form.battery_id));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    setError('');
    setSuccess('');

    if (!form.party_name.trim()) {
      setError('Please enter the name of the person or dealer');
      return;
    }
    if (!form.battery_id) {
      setError('Please select a battery model');
      return;
    }

    setSaving(true);
    try {
      const res = await api.createLoan({
        ...form,
        quantity: Number(form.quantity) || 1,
        battery_id: Number(form.battery_id)
      });
      setForm({ ...emptyForm, loan_date: todayValue() });
      setSuccess(`${res.loan.direction === 'lent' ? 'Lent' : 'Borrowed'} battery recorded successfully.`);
      await Promise.all([loadLoans(), loadBatteries()]);
    } catch (err) {
      setError(err.message || 'Failed to save battery loan');
    } finally {
      setSaving(false);
    }
  };

  const handleReturn = async (loan) => {
    if (!window.confirm(`Mark this ${loan.direction === 'lent' ? 'lent' : 'borrowed'} battery as returned? Stock will be adjusted automatically.`)) {
      return;
    }
    setReturningId(loan.id);
    setError('');
    setSuccess('');
    try {
      await api.returnLoan(loan.id);
      setSuccess(`Battery return recorded for ${loan.party_name}.`);
      await Promise.all([loadLoans(), loadBatteries()]);
    } catch (err) {
      setError(err.message || 'Failed to mark battery returned');
    } finally {
      setReturningId(null);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    loadLoans();
  };

  return (
    <div className="max-w-7xl mx-auto px-3 py-3 sm:py-6 pb-28">
      <div className="border-b-2 border-slate-200 pb-3 mb-4">
        <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center space-x-2">
          <ArrowLeftRight className="w-5 h-5 text-accent-700" />
          <span>Battery Loans</span>
          <span className="text-xs bg-slate-200 text-slate-800 font-bold px-2 py-0.5 rounded">
            Lend / Borrow Register
          </span>
        </h2>
        <p className="text-xs text-slate-500 font-semibold mt-0.5">
          Track batteries given to customers or borrowed from dealers, and who recorded each entry.
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-300 rounded text-red-800 text-xs font-bold flex items-center justify-between">
          <span className="flex items-center space-x-2"><AlertCircle className="w-4 h-4" /><span>{error}</span></span>
          <button type="button" onClick={() => setError('')} className="underline">Dismiss</button>
        </div>
      )}
      {success && (
        <div className="mb-4 p-3 bg-emerald-50 border border-emerald-300 rounded text-emerald-900 text-xs font-bold flex items-center justify-between">
          <span className="flex items-center space-x-2"><CheckCircle className="w-4 h-4" /><span>{success}</span></span>
          <button type="button" onClick={() => setSuccess('')} className="underline">Dismiss</button>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <div className="bg-amber-50 border border-amber-300 rounded-lg p-3">
          <div className="text-[10px] font-black text-amber-800 uppercase">Lent Out (Open)</div>
          <div className="text-2xl font-black text-amber-900">{stats.open_lent || 0}</div>
        </div>
        <div className="bg-blue-50 border border-blue-300 rounded-lg p-3">
          <div className="text-[10px] font-black text-blue-800 uppercase">Borrowed In (Open)</div>
          <div className="text-2xl font-black text-blue-900">{stats.open_borrowed || 0}</div>
        </div>
        <div className="bg-red-50 border border-red-300 rounded-lg p-3">
          <div className="text-[10px] font-black text-red-800 uppercase">Overdue</div>
          <div className="text-2xl font-black text-red-900">{stats.overdue || 0}</div>
        </div>
        <div className="bg-slate-100 border border-slate-300 rounded-lg p-3">
          <div className="text-[10px] font-black text-slate-700 uppercase">Total Open</div>
          <div className="text-2xl font-black text-slate-900">{stats.open_total || 0}</div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white border-2 border-slate-300 rounded-lg p-3 sm:p-4 shadow-sm mb-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-black text-slate-900">Record New Lend / Borrow</h3>
          <div className="flex space-x-1">
            <button
              type="button"
              onClick={() => setForm({ ...form, direction: 'lent' })}
              className={`px-3 py-1.5 rounded text-xs font-black border ${form.direction === 'lent' ? 'bg-amber-700 text-white border-amber-700' : 'bg-slate-100 text-slate-700 border-slate-300'}`}
            >
              Lent Out
            </button>
            <button
              type="button"
              onClick={() => setForm({ ...form, direction: 'borrowed' })}
              className={`px-3 py-1.5 rounded text-xs font-black border ${form.direction === 'borrowed' ? 'bg-blue-700 text-white border-blue-700' : 'bg-slate-100 text-slate-700 border-slate-300'}`}
            >
              Borrowed In
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
          <div>
            <label className="block font-bold text-slate-700 mb-1">Person / Dealer Type</label>
            <select
              value={form.party_type}
              onChange={(e) => setForm({ ...form, party_type: e.target.value })}
              className="w-full h-9 px-2 border rounded font-semibold bg-white"
            >
              {PARTY_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
            </select>
          </div>
          <div>
            <label className="block font-bold text-slate-700 mb-1">Name *</label>
            <input
              type="text"
              value={form.party_name}
              onChange={(e) => setForm({ ...form, party_name: e.target.value })}
              placeholder="e.g. Ramesh Patil / Amaron Dealer"
              className="w-full h-9 px-2 border rounded font-semibold"
            />
          </div>
          <div>
            <label className="block font-bold text-slate-700 mb-1">Mobile</label>
            <input
              type="tel"
              maxLength={10}
              value={form.party_mobile}
              onChange={(e) => setForm({ ...form, party_mobile: e.target.value.replace(/\D/g, '').slice(0, 10) })}
              placeholder="9876543210"
              className="w-full h-9 px-2 border rounded font-semibold"
            />
          </div>
          <div>
            <label className="block font-bold text-slate-700 mb-1">Battery Model *</label>
            <select
              value={form.battery_id}
              onChange={(e) => setForm({ ...form, battery_id: e.target.value })}
              className="w-full h-9 px-2 border rounded font-semibold bg-white"
            >
              <option value="">Select battery</option>
              {batteries.map(b => (
                <option key={b.id} value={b.id}>
                  {b.brand} {b.model_name} ({b.type}, {b.capacity_ah}Ah) — Stock {b.current_stock}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block font-bold text-slate-700 mb-1">Quantity</label>
            <input
              type="number"
              min={1}
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: Math.max(1, parseInt(e.target.value, 10) || 1) })}
              className="w-full h-9 px-2 border rounded font-semibold"
            />
          </div>
          <div>
            <label className="block font-bold text-slate-700 mb-1">Serial Number</label>
            <input
              type="text"
              value={form.serial_number}
              onChange={(e) => setForm({ ...form, serial_number: e.target.value.toUpperCase() })}
              placeholder="Optional"
              className="w-full h-9 px-2 border rounded font-semibold uppercase"
            />
          </div>
          <div>
            <label className="block font-bold text-slate-700 mb-1">Loan Date</label>
            <input
              type="date"
              value={form.loan_date}
              onChange={(e) => setForm({ ...form, loan_date: e.target.value })}
              className="w-full h-9 px-2 border rounded font-semibold"
            />
          </div>
          <div>
            <label className="block font-bold text-slate-700 mb-1">Expected Return</label>
            <input
              type="date"
              value={form.expected_return_date}
              onChange={(e) => setForm({ ...form, expected_return_date: e.target.value })}
              className="w-full h-9 px-2 border rounded font-semibold"
            />
          </div>
        </div>

        <div className="mt-2.5">
          <label className="block font-bold text-slate-700 mb-1 text-xs">Notes</label>
          <input
            type="text"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="e.g. Customer's battery kept for checking; return after 2 days"
            className="w-full h-9 px-2 border rounded font-semibold text-xs"
          />
        </div>

        {selectedBattery && form.direction === 'lent' && selectedBattery.current_stock < (Number(form.quantity) || 1) && (
          <div className="mt-2 text-[11px] font-bold text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">
            Only {selectedBattery.current_stock} in stock. Cannot lend {form.quantity}.
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="mt-3 h-10 px-4 w-full sm:w-auto rounded-lg bg-accent-700 hover:bg-accent-800 text-white font-black text-sm flex items-center justify-center space-x-2 disabled:opacity-60"
        >
          <Plus className="w-4 h-4" />
          <span>{saving ? 'Saving...' : form.direction === 'lent' ? 'Record Lent Battery' : 'Record Borrowed Battery'}</span>
        </button>
      </form>

      <div className="bg-white border-2 border-slate-300 rounded-lg p-3 mb-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="flex space-x-1">
            {[
              { id: 'open', label: 'Open' },
              { id: 'returned', label: 'Returned' },
              { id: 'all', label: 'All' }
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 rounded text-xs font-black border ${statusFilter === tab.id ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-100 text-slate-700 border-slate-300'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <select
            value={directionFilter}
            onChange={(e) => setDirectionFilter(e.target.value)}
            className="h-8 px-2 border border-slate-300 rounded text-xs font-semibold bg-white"
          >
            <option value="all">All Directions</option>
            <option value="lent">Lent Out</option>
            <option value="borrowed">Borrowed In</option>
          </select>
          <form onSubmit={handleSearch} className="flex gap-1.5 sm:ml-auto">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2.5 top-2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, mobile, serial..."
                className="h-8 pl-8 pr-2 border border-slate-300 rounded text-xs font-semibold"
              />
            </div>
            <button type="submit" className="h-8 px-3 bg-slate-800 text-white rounded text-xs font-bold">
              Search
            </button>
            <button
              type="button"
              onClick={() => { setSearch(''); setStatusFilter('open'); setDirectionFilter('all'); }}
              className="h-8 px-2 bg-slate-100 text-slate-700 rounded text-xs font-bold border border-slate-300"
              title="Reset filters"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-center text-slate-500 font-bold text-sm bg-white rounded-lg border">
          Loading battery loans...
        </div>
      ) : loans.length === 0 ? (
        <div className="p-8 text-center text-slate-500 font-medium text-sm bg-white rounded-lg border">
          No battery loans found for this filter.
        </div>
      ) : (
        <div className="space-y-2">
          {loans.map(loan => {
            const isLent = loan.direction === 'lent';
            const isOpen = loan.status === 'open';
            const isOverdue = isOpen && loan.expected_return_date && loan.expected_return_date < todayValue();
            return (
              <div key={loan.id} className={`bg-white border-2 rounded-lg p-3 shadow-sm ${isOverdue ? 'border-red-300' : 'border-slate-300'}`}>
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center flex-wrap gap-1.5">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black ${isLent ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-blue-100 text-blue-900 border border-blue-300'}`}>
                        {isLent ? 'LENT OUT' : 'BORROWED IN'}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black ${isOpen ? (isOverdue ? 'bg-red-100 text-red-800 border border-red-300' : 'bg-slate-100 text-slate-700 border border-slate-300') : 'bg-emerald-100 text-emerald-800 border border-emerald-300'}`}>
                        {isOpen ? (isOverdue ? 'OVERDUE' : 'OPEN') : 'RETURNED'}
                      </span>
                      <span className="text-sm font-black text-slate-900">{loan.party_name}</span>
                      <span className="text-[11px] text-slate-500 font-semibold">({loan.party_type})</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 mt-2 text-[11px] text-slate-700 font-semibold">
                      <div className="flex items-center space-x-1.5">
                        <Package className="w-3.5 h-3.5 text-slate-400" />
                        <span>{loan.battery_brand} {loan.battery_model} × {loan.quantity}</span>
                      </div>
                      {loan.serial_number && (
                        <div className="font-mono">Serial: <strong>{loan.serial_number}</strong></div>
                      )}
                      {loan.party_mobile && (
                        <div className="flex items-center space-x-1.5">
                          <Phone className="w-3.5 h-3.5 text-slate-400" />
                          <span>+91 {loan.party_mobile}</span>
                        </div>
                      )}
                      <div className="flex items-center space-x-1.5">
                        <CalendarDays className="w-3.5 h-3.5 text-slate-400" />
                        <span>Loan: {formatDate(loan.loan_date)}</span>
                        {loan.expected_return_date && <span>• Return by: {formatDate(loan.expected_return_date)}</span>}
                      </div>
                      <div className="flex items-center space-x-1.5">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        <span>Recorded by: <strong>{loan.created_by_name}</strong></span>
                      </div>
                      {loan.status === 'returned' && (
                        <div className="flex items-center space-x-1.5 text-emerald-800">
                          <CheckCircle className="w-3.5 h-3.5" />
                          <span>Returned {formatDate(loan.returned_at)} by <strong>{loan.returned_by_name}</strong></span>
                        </div>
                      )}
                    </div>

                    {loan.notes && (
                      <div className="mt-1.5 text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded px-2 py-1">
                        {loan.notes}
                      </div>
                    )}
                  </div>

                  {isOpen && (
                    <button
                      type="button"
                      disabled={returningId === loan.id}
                      onClick={() => handleReturn(loan)}
                      className="h-9 px-3 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-black flex items-center justify-center space-x-1.5 disabled:opacity-60 self-start"
                    >
                      <Clock className="w-3.5 h-3.5" />
                      <span>{returningId === loan.id ? 'Saving...' : 'Mark Returned'}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

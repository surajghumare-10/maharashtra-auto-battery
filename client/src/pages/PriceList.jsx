import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { formatCurrency } from '../utils/formatters';
import { Plus, Edit, Trash2, Search, X, Check, AlertCircle } from 'lucide-react';

const BATTERY_TYPES = ['Car', 'Bike', 'Inverter', 'Tractor', 'Truck', 'E-rickshaw'];

export default function PriceList() {
  const { isOwner, isManager, t } = useAuth();

  const [batteries, setBatteries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedType, setSelectedType] = useState('All');
  const [search, setSearch] = useState('');
  const [statusMessage, setStatusMessage] = useState('');

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingBattery, setEditingBattery] = useState(null);

  // Form State
  const [form, setForm] = useState({
    brand: '',
    model_name: '',
    type: 'Car',
    capacity_ah: 35,
    warranty_months: 36,
    selling_price: '',
    cost_price: '',
    exchange_discount: '',
    current_stock: 0,
    low_stock_alert: 2
  });

  useEffect(() => {
    loadBatteries();
  }, []);

  const loadBatteries = async () => {
    setLoading(true);
    try {
      const res = await api.getBatteries();
      setBatteries(res.batteries || []);
    } catch (err) {
      console.error('Error loading batteries:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAdd = () => {
    setForm({
      brand: '',
      model_name: '',
      type: 'Car',
      capacity_ah: 35,
      warranty_months: 36,
      selling_price: '',
      cost_price: '',
      exchange_discount: '',
      current_stock: 0,
      low_stock_alert: 2
    });
    setShowAddModal(true);
  };

  const handleOpenEdit = (b) => {
    setEditingBattery(b);
    setForm({
      brand: b.brand,
      model_name: b.model_name,
      type: b.type,
      capacity_ah: b.capacity_ah,
      warranty_months: b.warranty_months,
      selling_price: b.selling_price,
      cost_price: b.cost_price || '',
      exchange_discount: b.exchange_discount,
      low_stock_alert: b.low_stock_alert || 2
    });
  };

  const handleSaveAdd = async (e) => {
    e.preventDefault();
    try {
      await api.createBattery(form);
      setShowAddModal(false);
      setStatusMessage('Battery model added successfully.');
      loadBatteries();
    } catch (err) {
      alert(err.message || 'Failed to add model');
    }
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    try {
      await api.updateBattery(editingBattery.id, form);
      setEditingBattery(null);
      setStatusMessage('Battery model and price updated successfully.');
      loadBatteries();
    } catch (err) {
      alert(err.message || 'Failed to update battery');
    }
  };

  const handleDelete = async (b) => {
    if (!window.confirm(`Are you sure you want to delete ${b.brand} ${b.model_name}?`)) {
      return;
    }
    try {
      await api.deleteBattery(b.id);
      setStatusMessage('Battery model removed from catalog.');
      loadBatteries();
    } catch (err) {
      alert(err.message || 'Failed to delete battery');
    }
  };

  const filtered = batteries.filter(b => {
    const matchesType = selectedType === 'All' || b.type === selectedType;
    const matchesSearch = !search || 
      b.brand.toLowerCase().includes(search.toLowerCase()) || 
      b.model_name.toLowerCase().includes(search.toLowerCase());
    return matchesType && matchesSearch;
  });

  return (
    <div className="max-w-7xl mx-auto px-3 py-3 sm:py-6 pb-28">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b-2 border-slate-200 pb-3 mb-4">
        <div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center space-x-2">
            <span>{t.price_list} & Catalog</span>
            <span className="text-xs bg-slate-200 text-slate-800 font-bold px-2 py-0.5 rounded">
              {filtered.length} Models
            </span>
          </h2>
          <p className="text-xs text-slate-500 font-semibold mt-0.5">
            Default selling prices, warranty, and exchange discount rates
          </p>
        </div>

        {(isOwner || isManager) && (
          <button
            type="button"
            onClick={handleOpenAdd}
            className="px-4 py-2 bg-accent-700 hover:bg-accent-800 active:bg-accent-900 text-white font-bold rounded-lg text-xs flex items-center space-x-1.5 shadow-sm self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Add Battery Model</span>
          </button>
        )}
      </div>

      {statusMessage && (
        <div className="mb-4 p-3 bg-emerald-100 border border-emerald-300 text-emerald-900 font-bold text-xs rounded flex items-center justify-between">
          <span>{statusMessage}</span>
          <button type="button" onClick={() => setStatusMessage('')} className="underline font-bold">Dismiss</button>
        </div>
      )}

      {/* FILTERS & SEARCH */}
      <div className="bg-white border-2 border-slate-300 rounded-lg p-3 mb-4 shadow-sm space-y-2.5">
        <div className="flex space-x-1 overflow-x-auto pb-1 scrollbar-none">
          {['All', ...BATTERY_TYPES].map(type => (
            <button
              key={type}
              type="button"
              onClick={() => setSelectedType(type)}
              className={`px-3 py-1.5 rounded text-xs font-bold whitespace-nowrap border transition-colors ${
                selectedType === type
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
              }`}
            >
              {type}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by brand or model name (e.g. Exide Epiq, Amaron Pro, 150Ah)..."
            className="w-full h-10 pl-9 pr-3 border border-slate-300 rounded text-xs font-semibold focus:border-accent-700 focus:outline-none"
          />
        </div>
      </div>

      {/* CATALOG TABLE */}
      {loading ? (
        <div className="p-8 text-center text-slate-500 font-bold text-sm bg-white rounded-lg border">
          Loading catalog...
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-8 text-center text-slate-500 font-medium text-sm bg-white rounded-lg border">
          No battery models found.
        </div>
      ) : (
        <div className="bg-white border-2 border-slate-300 rounded-lg overflow-x-auto shadow-sm">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-slate-100 border-b-2 border-slate-300 text-slate-700 font-black text-[11px] uppercase tracking-wider">
              <tr>
                <th className="py-2.5 px-3">Brand & Model</th>
                <th className="py-2.5 px-3">Type</th>
                <th className="py-2.5 px-3 text-center">Ah</th>
                <th className="py-2.5 px-3 text-center">Warranty</th>
                <th className="py-2.5 px-3 text-right">Selling Price</th>
                <th className="py-2.5 px-3 text-right">Exch. Discount</th>
                <th className="py-2.5 px-3 text-center">Stock</th>
                {(isOwner || isManager) && (
                  <th className="py-2.5 px-3 text-center">Action</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filtered.map(b => {
                const isOutOfStock = b.current_stock <= 0;
                const isLowStock = b.current_stock > 0 && b.current_stock <= b.low_stock_alert;

                return (
                  <tr key={b.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2.5 px-3">
                      <div className="font-bold text-slate-900">{b.brand} {b.model_name}</div>
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-slate-700">{b.type}</td>
                    <td className="py-2.5 px-3 text-center font-bold text-slate-900">{b.capacity_ah} Ah</td>
                    <td className="py-2.5 px-3 text-center font-semibold text-slate-700">{b.warranty_months} m</td>
                    <td className="py-2.5 px-3 text-right font-black text-slate-900 text-sm">
                      {formatCurrency(b.selling_price)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-emerald-800">
                      -{formatCurrency(b.exchange_discount)}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-black ${
                        isOutOfStock
                          ? 'bg-red-100 text-red-800 border border-red-300'
                          : isLowStock
                          ? 'bg-amber-100 text-amber-900 border border-amber-300'
                          : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      }`}>
                        {b.current_stock}
                      </span>
                    </td>
                    {(isOwner || isManager) && (
                      <td className="py-2.5 px-3 text-center">
                        <div className="flex items-center justify-center space-x-1">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(b)}
                            title="Edit Model / Price"
                            className="p-1 text-slate-600 hover:text-accent-700 hover:bg-blue-50 rounded"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          {isOwner && (
                            <button
                              type="button"
                              onClick={() => handleDelete(b)}
                              title="Delete Model"
                              className="p-1 text-slate-400 hover:text-red-700 hover:bg-red-50 rounded"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ADD / EDIT MODAL */}
      {(showAddModal || editingBattery) && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-3 overflow-y-auto">
          <div className="bg-white rounded-xl max-w-md w-full p-5 border-2 border-accent-700 shadow-2xl my-auto">
            <div className="flex justify-between items-center border-b pb-2 mb-3">
              <h3 className="text-base font-black text-slate-900">
                {editingBattery ? 'Edit Battery Model & Price' : 'Add New Battery Model'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowAddModal(false);
                  setEditingBattery(null);
                }}
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <form onSubmit={editingBattery ? handleSaveEdit : handleSaveAdd} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-0.5">Brand *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Exide, Amaron"
                    value={form.brand}
                    onChange={(e) => setForm({ ...form, brand: e.target.value })}
                    className="w-full h-9 px-2 border rounded font-semibold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-0.5">Model Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Epiq EPIQ35L"
                    value={form.model_name}
                    onChange={(e) => setForm({ ...form, model_name: e.target.value })}
                    className="w-full h-9 px-2 border rounded font-semibold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-0.5">Type *</label>
                  <select
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value })}
                    className="w-full h-9 px-2 border rounded font-semibold bg-white"
                  >
                    {BATTERY_TYPES.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-0.5">Capacity (Ah) *</label>
                  <input
                    type="number"
                    required
                    value={form.capacity_ah}
                    onChange={(e) => setForm({ ...form, capacity_ah: e.target.value })}
                    className="w-full h-9 px-2 border rounded font-semibold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-0.5">Warranty (M) *</label>
                  <input
                    type="number"
                    required
                    value={form.warranty_months}
                    onChange={(e) => setForm({ ...form, warranty_months: e.target.value })}
                    className="w-full h-9 px-2 border rounded font-semibold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-0.5">Selling Price (₹) *</label>
                  <input
                    type="number"
                    required
                    placeholder="5400"
                    value={form.selling_price}
                    onChange={(e) => setForm({ ...form, selling_price: e.target.value })}
                    className="w-full h-9 px-2 border-2 border-blue-300 rounded font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-0.5">Old Battery Exch. (₹)</label>
                  <input
                    type="number"
                    placeholder="600"
                    value={form.exchange_discount}
                    onChange={(e) => setForm({ ...form, exchange_discount: e.target.value })}
                    className="w-full h-9 px-2 border rounded font-semibold"
                  />
                </div>
              </div>

              {isOwner && (
                <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2 rounded border">
                  <div>
                    <label className="block font-bold text-slate-700 mb-0.5">Cost/Purchase Price (₹)</label>
                    <input
                      type="number"
                      placeholder="4200"
                      value={form.cost_price}
                      onChange={(e) => setForm({ ...form, cost_price: e.target.value })}
                      className="w-full h-9 px-2 border rounded font-semibold bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-0.5">Low Stock Alert Level</label>
                    <input
                      type="number"
                      placeholder="2"
                      value={form.low_stock_alert}
                      onChange={(e) => setForm({ ...form, low_stock_alert: e.target.value })}
                      className="w-full h-9 px-2 border rounded font-semibold bg-white"
                    />
                  </div>
                </div>
              )}

              {!editingBattery && (
                <div>
                  <label className="block font-bold text-slate-700 mb-0.5">Opening Stock Qty</label>
                  <input
                    type="number"
                    min={0}
                    value={form.current_stock}
                    onChange={(e) => setForm({ ...form, current_stock: e.target.value })}
                    className="w-full h-9 px-2 border rounded font-semibold"
                  />
                </div>
              )}

              <div className="flex justify-end space-x-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setEditingBattery(null);
                  }}
                  className="px-3 py-2 bg-slate-100 rounded text-slate-700 font-bold border"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-accent-700 text-white rounded font-black shadow"
                >
                  Save Model
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

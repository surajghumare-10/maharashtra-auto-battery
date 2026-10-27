import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { formatCurrency, formatDate, exportToCSV } from '../utils/formatters';
import {
  Boxes,
  Plus,
  SlidersHorizontal,
  Printer,
  FileSpreadsheet,
  AlertTriangle,
  TrendingUp,
  Clock,
  Recycle,
  X,
  History
} from 'lucide-react';

const BATTERY_TYPES = ['Car', 'Bike', 'Inverter', 'Tractor', 'Truck', 'E-rickshaw'];

export default function InventoryReport() {
  const { isOwner, isManager, t } = useAuth();

  const [reportData, setReportData] = useState({
    summary: {},
    inventory: [],
    topSelling: [],
    slowMoving: [],
    oldBatterySummary: []
  });

  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedType, setSelectedType] = useState('all');
  const [search, setSearch] = useState('');

  // Modals
  const [showAddStockModal, setShowAddStockModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [showScrapModal, setShowScrapModal] = useState(false);
  const [showMovementsModal, setShowMovementsModal] = useState(false);
  const [movements, setMovements] = useState([]);

  // Form states
  const [stockForm, setStockForm] = useState({
    battery_id: '',
    quantity: '',
    cost_price: '',
    supplier_name: '',
    reference_id: '',
    notes: ''
  });

  const [adjustForm, setAdjustForm] = useState({
    battery_id: '',
    new_quantity: '',
    reason: ''
  });

  const [scrapForm, setScrapForm] = useState({
    scrap_dealer_name: '',
    count_to_sell: '',
    amount_received: '',
    payment_mode: 'Cash',
    notes: ''
  });

  useEffect(() => {
    loadReport();
  }, [selectedType]);

  const loadReport = async () => {
    setLoading(true);
    try {
      const params = {};
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      if (selectedType !== 'all') params.type = selectedType;
      if (search.trim()) params.search = search.trim();

      const res = await api.getInventoryReport(params);
      setReportData(res);
    } catch (err) {
      console.error('Error loading inventory report:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleApplyFilter = (e) => {
    e.preventDefault();
    loadReport();
  };

  // Submit Add Stock
  const handleSaveAddStock = async (e) => {
    e.preventDefault();
    try {
      await api.addStock(stockForm);
      setShowAddStockModal(false);
      alert('Stock added successfully');
      loadReport();
    } catch (err) {
      alert(err.message || 'Failed to add stock');
    }
  };

  // Submit Adjust Stock
  const handleSaveAdjust = async (e) => {
    e.preventDefault();
    if (!adjustForm.reason.trim()) {
      alert('Please enter a mandatory reason for adjustment');
      return;
    }
    try {
      await api.adjustStock(adjustForm);
      setShowAdjustModal(false);
      alert('Stock adjusted successfully');
      loadReport();
    } catch (err) {
      alert(err.message || 'Failed to adjust stock');
    }
  };

  // Submit Scrap Sale
  const handleSaveScrap = async (e) => {
    e.preventDefault();
    try {
      await api.sellScrap(scrapForm);
      setShowScrapModal(false);
      alert('Scrap sale recorded successfully');
      loadReport();
    } catch (err) {
      alert(err.message || 'Failed to record scrap sale');
    }
  };

  // Open Movements History
  const handleOpenMovements = async () => {
    try {
      const res = await api.getStockMovements();
      setMovements(res.movements || []);
      setShowMovementsModal(true);
    } catch (err) {
      console.error(err);
    }
  };

  // Export to CSV
  const handleExportCSV = () => {
    const dataToExport = reportData.inventory.map(r => ({
      'Brand': r.brand,
      'Model': r.model_name,
      'Type': r.type,
      'Capacity (Ah)': r.capacity_ah,
      'Opening Stock': r.opening_stock,
      'Stock In': r.stock_in,
      'Sold': r.sold,
      'Current Stock': r.current_stock,
      'Cost Price': r.cost_price,
      'Selling Price': r.selling_price,
      'Stock Value (Cost)': r.stock_value_cost,
      'Stock Value (Retail)': r.stock_value_selling
    }));
    exportToCSV(`inventory_valuation_${new Date().toISOString().split('T')[0]}.csv`, dataToExport);
  };

  const { summary = {}, inventory = [], topSelling = [], slowMoving = [], oldBatterySummary = [] } = reportData;

  return (
    <div className="max-w-7xl mx-auto px-3 py-3 sm:py-6 pb-28">
      {/* Title & Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b-2 border-slate-200 pb-3 mb-4 print:hidden">
        <div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center space-x-2">
            <span>Inventory Valuation & Stock Report</span>
            <span className="text-xs bg-slate-900 text-white font-bold px-2 py-0.5 rounded">
              Owner Report
            </span>
          </h2>
          <p className="text-xs text-slate-500 font-semibold mt-0.5">
            Real-time stock quantities, cost valuation, low-stock warnings, and old battery scrap
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAddStockModal(true)}
            className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-lg text-xs flex items-center space-x-1.5 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Add Stock Inward</span>
          </button>

          <button
            type="button"
            onClick={() => setShowAdjustModal(true)}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-lg text-xs flex items-center space-x-1.5 shadow-sm"
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span>Adjust Stock</span>
          </button>

          <button
            type="button"
            onClick={handleOpenMovements}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-xs border border-slate-300 flex items-center space-x-1"
          >
            <History className="w-3.5 h-3.5" />
            <span>Audit History</span>
          </button>

          <button
            type="button"
            onClick={handleExportCSV}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-xs border border-slate-300 flex items-center space-x-1"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
            <span>Export CSV</span>
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-xs border border-slate-300 flex items-center space-x-1"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print</span>
          </button>
        </div>
      </div>

      {/* SUMMARY STRIP */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {/* Total Stock Qty */}
        <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-3 shadow-sm">
          <div className="text-[11px] font-black text-blue-800 uppercase tracking-wider">
            Total Batteries in Stock
          </div>
          <div className="text-2xl font-black text-blue-900 mt-1">
            {summary.totalBatteriesInStock || 0} <span className="text-sm font-bold text-blue-700">Units</span>
          </div>
        </div>

        {/* Total Value at Cost */}
        <div className="bg-emerald-50 border-2 border-emerald-300 rounded-lg p-3 shadow-sm">
          <div className="text-[11px] font-black text-emerald-800 uppercase tracking-wider">
            Stock Value (At Cost)
          </div>
          <div className="text-2xl font-black text-emerald-700 mt-1">
            {formatCurrency(summary.totalStockValueCost || 0)}
          </div>
        </div>

        {/* Potential Sales Value */}
        <div className="bg-slate-50 border-2 border-slate-300 rounded-lg p-3 shadow-sm">
          <div className="text-[11px] font-black text-slate-700 uppercase tracking-wider">
            Potential Sales Value
          </div>
          <div className="text-2xl font-black text-slate-900 mt-1">
            {formatCurrency(summary.totalPotentialSalesValue || 0)}
          </div>
        </div>

        {/* Low Stock Models */}
        <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-3 shadow-sm">
          <div className="text-[11px] font-black text-amber-800 uppercase tracking-wider">
            Low / Out of Stock
          </div>
          <div className="text-2xl font-black text-amber-900 mt-1">
            {summary.lowStockModelsCount || 0} <span className="text-sm font-bold text-amber-700">Models</span>
          </div>
        </div>
      </div>

      {/* DATE RANGE & SEARCH FILTER */}
      <div className="bg-white border-2 border-slate-300 rounded-lg p-3 mb-4 shadow-sm space-y-2.5 print:hidden">
        <form onSubmit={handleApplyFilter} className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-bold text-slate-700">Filter Range:</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="h-8 px-2 border border-slate-300 rounded text-xs"
          />
          <span className="text-slate-500 font-bold">to</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="h-8 px-2 border border-slate-300 rounded text-xs"
          />

          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="h-8 px-2 border border-slate-300 rounded text-xs font-semibold bg-white"
          >
            <option value="all">All Types</option>
            {BATTERY_TYPES.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>

          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search model..."
            className="h-8 px-2 border border-slate-300 rounded text-xs w-44"
          />

          <button
            type="submit"
            className="h-8 px-3 bg-accent-700 text-white font-bold rounded text-xs"
          >
            Apply
          </button>

          {(startDate || endDate || search) && (
            <button
              type="button"
              onClick={() => {
                setStartDate('');
                setEndDate('');
                setSearch('');
                loadReport();
              }}
              className="text-slate-500 underline text-xs"
            >
              Reset
            </button>
          )}
        </form>
      </div>

      {/* INVENTORY VALUATION TABLE */}
      {loading ? (
        <div className="p-8 text-center text-slate-500 font-bold text-sm bg-white rounded-lg border">
          Loading inventory valuation table...
        </div>
      ) : inventory.length === 0 ? (
        <div className="p-8 text-center text-slate-500 font-medium text-sm bg-white rounded-lg border">
          No inventory records found.
        </div>
      ) : (
        <div className="bg-white border-2 border-slate-300 rounded-lg overflow-x-auto shadow-sm mb-6">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-slate-100 border-b-2 border-slate-300 text-slate-800 font-black text-[11px] uppercase tracking-wider">
              <tr>
                <th className="py-2.5 px-3">Brand & Model</th>
                <th className="py-2.5 px-3">Type</th>
                <th className="py-2.5 px-3 text-center">Ah</th>
                <th className="py-2.5 px-3 text-center">Opening</th>
                <th className="py-2.5 px-3 text-center">Stock In</th>
                <th className="py-2.5 px-3 text-center">Sold</th>
                <th className="py-2.5 px-3 text-center">Current Stock</th>
                <th className="py-2.5 px-3 text-right">Cost (₹)</th>
                <th className="py-2.5 px-3 text-right">Selling (₹)</th>
                <th className="py-2.5 px-3 text-right">Cost Value</th>
                <th className="py-2.5 px-3 text-right">Sales Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {inventory.map(r => {
                let rowBg = 'hover:bg-slate-50';
                if (r.is_out_of_stock) {
                  rowBg = 'bg-red-50 hover:bg-red-100 text-red-950';
                } else if (r.is_low_stock) {
                  rowBg = 'bg-amber-50 hover:bg-amber-100 text-amber-950';
                }

                return (
                  <tr key={r.id} className={`${rowBg} transition-colors`}>
                    <td className="py-2.5 px-3">
                      <div className="font-bold">{r.brand} {r.model_name}</div>
                    </td>
                    <td className="py-2.5 px-3 font-medium text-slate-700">{r.type}</td>
                    <td className="py-2.5 px-3 text-center font-bold">{r.capacity_ah}</td>
                    <td className="py-2.5 px-3 text-center font-medium text-slate-600">{r.opening_stock}</td>
                    <td className="py-2.5 px-3 text-center font-bold text-emerald-800">+{r.stock_in}</td>
                    <td className="py-2.5 px-3 text-center font-bold text-blue-800">-{r.sold}</td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-black ${
                        r.is_out_of_stock
                          ? 'bg-red-600 text-white'
                          : r.is_low_stock
                          ? 'bg-amber-500 text-white'
                          : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                      }`}>
                        {r.current_stock}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-medium">{formatCurrency(r.cost_price)}</td>
                    <td className="py-2.5 px-3 text-right font-medium">{formatCurrency(r.selling_price)}</td>
                    <td className="py-2.5 px-3 text-right font-bold text-emerald-900">{formatCurrency(r.stock_value_cost)}</td>
                    <td className="py-2.5 px-3 text-right font-bold text-slate-900">{formatCurrency(r.stock_value_selling)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* SECTION BELOW: OLD BATTERY SCRAP & TOP / SLOW SELLERS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* OLD BATTERY SCRAP SECTION */}
        <div className="bg-white border-2 border-slate-300 rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between border-b pb-2 mb-3">
            <div className="flex items-center space-x-2">
              <Recycle className="w-5 h-5 text-emerald-700" />
              <h3 className="text-base font-black text-slate-900">
                Old Battery Scrap Stock ({summary.totalOldBatteries || 0} Total in Shop)
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setShowScrapModal(true)}
              className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded text-xs shadow-sm"
            >
              Sell Scrap
            </button>
          </div>

          <div className="text-xs text-slate-600 mb-2">
            Total scrap revenue collected: <strong>{formatCurrency(summary.scrapRevenue || 0)}</strong>
          </div>

          {oldBatterySummary.length === 0 ? (
            <p className="text-xs text-slate-500 italic">No returned old batteries currently in stock.</p>
          ) : (
            <div className="divide-y divide-slate-200 border rounded max-h-48 overflow-y-auto">
              {oldBatterySummary.map((item, idx) => (
                <div key={idx} className="p-2.5 flex justify-between items-center text-xs">
                  <div>
                    <span className="font-bold text-slate-900">{item.battery_type}</span>{' '}
                    <span className="text-slate-600">({item.brand || 'Unbranded'})</span>
                  </div>
                  <span className="font-black text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                    {item.count} Units
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* TOP SELLING & SLOW MOVING */}
        <div className="bg-white border-2 border-slate-300 rounded-lg p-4 shadow-sm space-y-4">
          {/* Top Selling */}
          <div>
            <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider mb-2 flex items-center space-x-1.5">
              <TrendingUp className="w-4 h-4 text-accent-700" />
              <span>Top Selling Battery Models:</span>
            </h4>
            <div className="space-y-1">
              {topSelling.map((ts, idx) => (
                <div key={idx} className="flex justify-between items-center text-xs p-1.5 bg-slate-50 rounded border border-slate-200">
                  <span className="font-bold text-slate-900">#{idx + 1} {ts.brand} {ts.model_name} ({ts.type})</span>
                  <span className="font-black text-emerald-800">{ts.total_sold} Sold ({formatCurrency(ts.revenue)})</span>
                </div>
              ))}
            </div>
          </div>

          {/* Slow Moving */}
          <div>
            <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider mb-2 flex items-center space-x-1.5">
              <Clock className="w-4 h-4 text-amber-700" />
              <span>Slow Moving Models (No sale in 60+ days):</span>
            </h4>
            <div className="space-y-1 max-h-36 overflow-y-auto">
              {slowMoving.length === 0 ? (
                <p className="text-xs text-slate-500 italic">All models have active sales!</p>
              ) : (
                slowMoving.map((sm) => (
                  <div key={sm.id} className="flex justify-between items-center text-xs p-1.5 bg-amber-50 rounded border border-amber-200">
                    <span className="font-bold text-amber-950">{sm.brand} {sm.model_name}</span>
                    <span className="text-amber-900 font-semibold">
                      Stock: {sm.current_stock} | Last Sold: {sm.last_sale_date ? formatDate(sm.last_sale_date) : 'Never'}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ADD STOCK MODAL */}
      {showAddStockModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-3 overflow-y-auto">
          <div className="bg-white rounded-xl max-w-md w-full p-5 border-2 border-emerald-600 shadow-2xl my-auto">
            <div className="flex justify-between items-center border-b pb-2 mb-3">
              <h3 className="text-base font-black text-slate-900">Add Stock (Stock Inward)</h3>
              <button type="button" onClick={() => setShowAddStockModal(false)}>
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <form onSubmit={handleSaveAddStock} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-0.5">Battery Model *</label>
                <select
                  required
                  value={stockForm.battery_id}
                  onChange={(e) => setStockForm({ ...stockForm, battery_id: e.target.value })}
                  className="w-full h-9 px-2 border rounded font-semibold bg-white"
                >
                  <option value="">Select Battery...</option>
                  {inventory.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.brand} {b.model_name} ({b.type}) - Current: {b.current_stock}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-0.5">Quantity (Units) *</label>
                  <input
                    type="number"
                    required
                    min={1}
                    placeholder="10"
                    value={stockForm.quantity}
                    onChange={(e) => setStockForm({ ...stockForm, quantity: e.target.value })}
                    className="w-full h-9 px-2 border rounded font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-0.5">Cost / Unit (₹)</label>
                  <input
                    type="number"
                    placeholder="e.g. 4200"
                    value={stockForm.cost_price}
                    onChange={(e) => setStockForm({ ...stockForm, cost_price: e.target.value })}
                    className="w-full h-9 px-2 border rounded"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-0.5">Supplier Name</label>
                <input
                  type="text"
                  placeholder="e.g. Exide Depot Pune / Shinde Auto Agency"
                  value={stockForm.supplier_name}
                  onChange={(e) => setStockForm({ ...stockForm, supplier_name: e.target.value })}
                  className="w-full h-9 px-2 border rounded"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-0.5">Supplier Invoice / Ref No</label>
                  <input
                    type="text"
                    placeholder="INV-9921"
                    value={stockForm.reference_id}
                    onChange={(e) => setStockForm({ ...stockForm, reference_id: e.target.value })}
                    className="w-full h-9 px-2 border rounded"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-0.5">Notes</label>
                  <input
                    type="text"
                    placeholder="Remarks"
                    value={stockForm.notes}
                    onChange={(e) => setStockForm({ ...stockForm, notes: e.target.value })}
                    className="w-full h-9 px-2 border rounded"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setShowAddStockModal(false)}
                  className="px-3 py-2 bg-slate-100 rounded text-slate-700 font-bold border"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-700 text-white rounded font-black shadow"
                >
                  Save Stock In
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADJUST STOCK MODAL WITH MANDATORY REASON */}
      {showAdjustModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-3 overflow-y-auto">
          <div className="bg-white rounded-xl max-w-md w-full p-5 border-2 border-slate-900 shadow-2xl my-auto">
            <div className="flex justify-between items-center border-b pb-2 mb-3">
              <h3 className="text-base font-black text-slate-900">Manual Stock Adjustment</h3>
              <button type="button" onClick={() => setShowAdjustModal(false)}>
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <form onSubmit={handleSaveAdjust} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-0.5">Battery Model *</label>
                <select
                  required
                  value={adjustForm.battery_id}
                  onChange={(e) => setAdjustForm({ ...adjustForm, battery_id: e.target.value })}
                  className="w-full h-9 px-2 border rounded font-semibold bg-white"
                >
                  <option value="">Select Battery...</option>
                  {inventory.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.brand} {b.model_name} (Current: {b.current_stock})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-0.5">
                  New Actual Count in Shop (Units) *
                </label>
                <input
                  type="number"
                  required
                  min={0}
                  placeholder="Enter verified physical count"
                  value={adjustForm.new_quantity}
                  onChange={(e) => setAdjustForm({ ...adjustForm, new_quantity: e.target.value })}
                  className="w-full h-9 px-2 border rounded font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-red-700 mb-0.5">
                  Mandatory Reason for Adjustment *
                </label>
                <textarea
                  required
                  rows={2}
                  placeholder="e.g. Physical inventory audit recount; 1 unit acid leak damaged; Returned to company for factory defect..."
                  value={adjustForm.reason}
                  onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })}
                  className="w-full p-2 border-2 border-slate-300 rounded font-medium focus:border-slate-900"
                />
              </div>

              <p className="text-[11px] text-slate-500 italic">
                * All adjustments are strictly logged with timestamp and user account for accountability.
              </p>

              <div className="flex justify-end space-x-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setShowAdjustModal(false)}
                  className="px-3 py-2 bg-slate-100 rounded text-slate-700 font-bold border"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-slate-900 text-white rounded font-black shadow"
                >
                  Apply Adjustment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SCRAP SALE MODAL */}
      {showScrapModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-3 overflow-y-auto">
          <div className="bg-white rounded-xl max-w-md w-full p-5 border-2 border-emerald-600 shadow-2xl my-auto">
            <div className="flex justify-between items-center border-b pb-2 mb-3">
              <h3 className="text-base font-black text-slate-900">Record Old Battery Scrap Sale</h3>
              <button type="button" onClick={() => setShowScrapModal(false)}>
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <form onSubmit={handleSaveScrap} className="space-y-3 text-xs">
              <div className="p-2 bg-emerald-50 rounded border border-emerald-200">
                Available Scrap Old Batteries: <strong>{summary.totalOldBatteries || 0} Units</strong>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-0.5">Scrap Dealer Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Maharashtra Metal Scrap / Iqbal Bhai"
                  value={scrapForm.scrap_dealer_name}
                  onChange={(e) => setScrapForm({ ...scrapForm, scrap_dealer_name: e.target.value })}
                  className="w-full h-9 px-2 border rounded font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-0.5">Count of Batteries Sold *</label>
                  <input
                    type="number"
                    required
                    min={1}
                    max={summary.totalOldBatteries || 1}
                    placeholder="e.g. 10"
                    value={scrapForm.count_to_sell}
                    onChange={(e) => setScrapForm({ ...scrapForm, count_to_sell: e.target.value })}
                    className="w-full h-9 px-2 border rounded font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-0.5">Amount Received (₹) *</label>
                  <input
                    type="number"
                    required
                    placeholder="e.g. 8500"
                    value={scrapForm.amount_received}
                    onChange={(e) => setScrapForm({ ...scrapForm, amount_received: e.target.value })}
                    className="w-full h-9 px-2 border rounded font-bold text-emerald-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-0.5">Payment Mode</label>
                  <select
                    value={scrapForm.payment_mode}
                    onChange={(e) => setScrapForm({ ...scrapForm, payment_mode: e.target.value })}
                    className="w-full h-9 px-2 border rounded font-semibold bg-white"
                  >
                    <option value="Cash">Cash</option>
                    <option value="UPI">UPI</option>
                    <option value="Card">Card</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-0.5">Notes</label>
                  <input
                    type="text"
                    placeholder="Weight, rate per kg, etc."
                    value={scrapForm.notes}
                    onChange={(e) => setScrapForm({ ...scrapForm, notes: e.target.value })}
                    className="w-full h-9 px-2 border rounded"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setShowScrapModal(false)}
                  className="px-3 py-2 bg-slate-100 rounded text-slate-700 font-bold border"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-700 text-white rounded font-black shadow"
                >
                  Record Scrap Sale
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* STOCK MOVEMENTS AUDIT LOG MODAL */}
      {showMovementsModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-3 overflow-y-auto">
          <div className="bg-white rounded-xl max-w-2xl w-full p-5 border-2 border-slate-700 shadow-2xl my-auto">
            <div className="flex justify-between items-center border-b pb-2 mb-3">
              <h3 className="text-base font-black text-slate-900">Stock Movements History</h3>
              <button type="button" onClick={() => setShowMovementsModal(false)}>
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="max-h-96 overflow-y-auto divide-y divide-slate-200 text-xs">
              {movements.map(m => (
                <div key={m.id} className="py-2 flex justify-between items-center">
                  <div>
                    <div className="font-bold text-slate-900">
                      {m.brand} {m.model_name} ({m.battery_type})
                    </div>
                    <div className="text-[11px] text-slate-600">
                      Reason: {m.reason || m.type} • By: {m.user_name} on {formatDate(m.created_at)}
                    </div>
                  </div>
                  <div className={`font-black text-sm ${
                    m.quantity > 0 ? 'text-emerald-700' : 'text-red-600'
                  }`}>
                    {m.quantity > 0 ? `+${m.quantity}` : m.quantity} Units
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-3 border-t mt-2">
              <button
                type="button"
                onClick={() => setShowMovementsModal(false)}
                className="px-4 py-2 bg-slate-800 text-white font-bold rounded text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { formatCurrency, formatDate, formatDateTime, exportToCSV } from '../utils/formatters';
import PrintInvoice from '../components/PrintInvoice';
import {
  Search,
  Filter,
  Printer,
  Edit,
  Trash2,
  History,
  Send,
  CheckCircle,
  AlertCircle,
  ExternalLink,
  MessageCircle,
  FileSpreadsheet,
  X,
  ChevronRight
} from 'lucide-react';

export default function BillsList({ initialSelectedBillId, onClearInitialBillId }) {
  const { user, isOwner, isManager, isWorker, shopSettings, t } = useAuth();

  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [paymentModeFilter, setPaymentModeFilter] = useState('all');
  const [batteryTypeFilter, setBatteryTypeFilter] = useState('all');

  // Modals
  const [selectedBill, setSelectedBill] = useState(null);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [billEdits, setBillEdits] = useState([]);
  const [actionMessage, setActionMessage] = useState('');
  const [resendingId, setResendingId] = useState(null);

  // Edit form state
  const [editForm, setEditForm] = useState({});

  useEffect(() => {
    loadBills();
  }, [dateFilter, customStartDate, customEndDate, paymentModeFilter, batteryTypeFilter]);

  // Handle open from New Bill
  useEffect(() => {
    if (initialSelectedBillId && bills.length > 0) {
      const match = bills.find(b => b.id === Number(initialSelectedBillId));
      if (match) {
        handleViewBill(match);
      }
      if (onClearInitialBillId) onClearInitialBillId();
    }
  }, [initialSelectedBillId, bills]);

  const loadBills = async () => {
    setLoading(true);
    try {
      const params = {};
      if (search.trim()) params.search = search.trim();
      if (paymentModeFilter !== 'all') params.paymentMode = paymentModeFilter;
      if (batteryTypeFilter !== 'all') params.batteryType = batteryTypeFilter;

      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const todayStr = `${yyyy}-${mm}-${dd}`;

      if (dateFilter === 'today') {
        params.startDate = todayStr;
        params.endDate = todayStr;
      } else if (dateFilter === 'yesterday') {
        const yest = new Date();
        yest.setDate(yest.getDate() - 1);
        const yDateStr = yest.toISOString().split('T')[0];
        params.startDate = yDateStr;
        params.endDate = yDateStr;
      } else if (dateFilter === 'last7') {
        const d7 = new Date();
        d7.setDate(d7.getDate() - 6);
        params.startDate = d7.toISOString().split('T')[0];
        params.endDate = todayStr;
      } else if (dateFilter === 'custom') {
        if (customStartDate) params.startDate = customStartDate;
        if (customEndDate) params.endDate = customEndDate;
      }

      const res = await api.getBills(params);
      setBills(res.bills || []);
    } catch (err) {
      console.error('Failed to load bills:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    loadBills();
  };

  const handleViewBill = async (bill) => {
    try {
      const res = await api.getBill(bill.id);
      setSelectedBill(res.bill);
      setBillEdits(res.edits || []);
    } catch (err) {
      console.error('Error fetching bill detail:', err);
    }
  };

  // Open Edit Modal
  const handleOpenEdit = (bill) => {
    setEditForm({
      id: bill.id,
      customer_name: bill.customer_name,
      customer_mobile: bill.customer_mobile,
      quantity: bill.quantity,
      unit_price: bill.unit_price,
      exchange_discount: bill.exchange_discount,
      manual_discount: bill.manual_discount,
      payment_mode: bill.payment_mode,
      amount_paid: bill.amount_paid,
      warranty_months: bill.warranty_months,
      serial_number: bill.serial_number || '',
      notes: bill.notes || ''
    });
    setShowEditModal(true);
  };

  // Submit Edit
  const handleSaveEdit = async (e) => {
    e.preventDefault();
    try {
      await api.updateBill(editForm.id, editForm);
      setShowEditModal(false);
      setActionMessage('Bill updated successfully with audit trail.');
      loadBills();
      // Reload current selected
      const fresh = await api.getBill(editForm.id);
      setSelectedBill(fresh.bill);
      setBillEdits(fresh.edits);
    } catch (err) {
      alert(err.message || 'Failed to update bill');
    }
  };

  // Delete Bill (Owner only)
  const handleDeleteBill = async (bill) => {
    if (!window.confirm(`Are you sure you want to cancel Bill ${bill.bill_no}? Sold stock will be restored back to inventory.`)) {
      return;
    }
    try {
      await api.deleteBill(bill.id);
      setActionMessage(`Bill ${bill.bill_no} cancelled and stock returned.`);
      setSelectedBill(null);
      loadBills();
    } catch (err) {
      alert(err.message || 'Failed to cancel bill');
    }
  };

  // Resend WhatsApp / SMS
  const handleResend = async (billId) => {
    setResendingId(billId);
    try {
      const res = await api.resendBillMessage(billId);
      setActionMessage(
        res.status === 'sent'
          ? 'WhatsApp invoice message resent successfully!'
          : 'Automated delivery pending. Click below to open in WhatsApp.'
      );
      loadBills();
      if (selectedBill?.id === billId) {
        const fresh = await api.getBill(billId);
        setSelectedBill(fresh.bill);
      }
    } catch (err) {
      alert(err.message || 'Failed to resend message');
    } finally {
      setResendingId(null);
    }
  };

  // Check if current user can edit this bill
  const canEditBill = (bill) => {
    if (bill.status === 'cancelled') return false;
    if (isOwner || isManager) return true;
    if (isWorker) {
      const billDate = bill.created_at.split(' ')[0];
      const today = new Date().toISOString().split('T')[0];
      return billDate === today;
    }
    return false;
  };

  // CSV Export
  const handleExportCSV = () => {
    const dataToExport = bills.map(b => ({
      'Bill No': b.bill_no,
      'Date': b.created_at,
      'Customer Name': b.customer_name,
      'Mobile': b.customer_mobile,
      'Battery': `${b.battery_brand} ${b.battery_model}`,
      'Type': b.battery_type,
      'Capacity (Ah)': b.battery_capacity,
      'Qty': b.quantity,
      'Unit Price': b.unit_price,
      'Subtotal': b.subtotal,
      'Exchange Discount': b.exchange_discount,
      'Manual Discount': b.manual_discount,
      'Grand Total': b.grand_total,
      'Payment Mode': b.payment_mode,
      'Amount Paid': b.amount_paid,
      'Balance Due': b.balance_due,
      'Warranty (M)': b.warranty_months,
      'Serial Number': b.serial_number || '',
      'Status': b.status,
      'Staff': b.created_by_name
    }));
    exportToCSV(`bills_export_${new Date().toISOString().split('T')[0]}.csv`, dataToExport);
  };

  return (
    <div className="max-w-7xl mx-auto px-3 py-3 sm:py-6 pb-28">
      {/* Title & Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b-2 border-slate-200 pb-3 mb-4">
        <div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center space-x-2">
            <span>{t.bills}</span>
            <span className="text-xs bg-slate-200 text-slate-800 font-bold px-2 py-0.5 rounded">
              {bills.length} Records
            </span>
          </h2>
          {isWorker && (
            <p className="text-xs text-slate-500 font-semibold mt-0.5">
              Showing today's bills (Worker view)
            </p>
          )}
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={handleExportCSV}
            className="px-3 py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs border border-slate-300 flex items-center space-x-1.5 active:bg-slate-300"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
            <span>{t.export_csv}</span>
          </button>
        </div>
      </div>

      {actionMessage && (
        <div className="mb-4 p-3 bg-emerald-100 border border-emerald-300 text-emerald-900 font-bold text-xs rounded flex items-center justify-between">
          <span>{actionMessage}</span>
          <button type="button" onClick={() => setActionMessage('')} className="underline font-bold">Dismiss</button>
        </div>
      )}

      {/* SEARCH AND FILTERS */}
      <div className="bg-white border-2 border-slate-300 rounded-lg p-3 mb-4 shadow-sm space-y-3">
        {/* Search Bar */}
        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by Bill No (e.g. MAB-0001), Customer name, Mobile, or Serial..."
              className="w-full h-10 pl-9 pr-3 border border-slate-300 rounded text-xs font-semibold focus:border-accent-700 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="h-10 px-4 bg-accent-700 hover:bg-accent-800 text-white font-bold text-xs rounded"
          >
            Search
          </button>
        </form>

        {/* Quick Date Range Pills */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-[11px] font-bold text-slate-500 mr-1 flex items-center">
            <Filter className="w-3 h-3 mr-1" /> Date:
          </span>
          {[
            { id: 'all', label: 'All' },
            { id: 'today', label: 'Today' },
            { id: 'yesterday', label: 'Yesterday' },
            { id: 'last7', label: 'Last 7 Days' },
            { id: 'custom', label: 'Custom' }
          ].map(d => (
            <button
              key={d.id}
              type="button"
              onClick={() => setDateFilter(d.id)}
              className={`px-2.5 py-1 rounded text-xs font-bold border transition-colors ${
                dateFilter === d.id
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
              }`}
            >
              {d.label}
            </button>
          ))}

          {/* Payment Mode Filter */}
          <select
            value={paymentModeFilter}
            onChange={(e) => setPaymentModeFilter(e.target.value)}
            className="h-7 px-2 border border-slate-300 rounded text-xs font-semibold bg-white ml-auto"
          >
            <option value="all">All Payment Modes</option>
            <option value="UPI">UPI</option>
            <option value="Cash">Cash</option>
            <option value="Card">Card</option>
            <option value="Credit">Credit (Pay Later)</option>
          </select>
        </div>

        {/* Custom Date Inputs if Custom selected */}
        {dateFilter === 'custom' && (
          <div className="flex items-center space-x-2 pt-2 border-t border-slate-200 text-xs">
            <span className="font-bold text-slate-600">From:</span>
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              className="h-8 px-2 border border-slate-300 rounded text-xs"
            />
            <span className="font-bold text-slate-600">To:</span>
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              className="h-8 px-2 border border-slate-300 rounded text-xs"
            />
            <button
              type="button"
              onClick={loadBills}
              className="h-8 px-3 bg-slate-800 text-white font-bold rounded text-xs"
            >
              Apply
            </button>
          </div>
        )}
      </div>

      {/* BILLS LIST / TABLE */}
      {loading ? (
        <div className="p-8 text-center text-slate-500 font-bold text-sm bg-white rounded-lg border border-slate-200">
          Loading bills...
        </div>
      ) : bills.length === 0 ? (
        <div className="p-8 text-center text-slate-500 font-medium text-sm bg-white rounded-lg border border-slate-200">
          No bills found matching current filter or search criteria.
        </div>
      ) : (
        <div className="space-y-2">
          {bills.map((bill) => {
            const isCancelled = bill.status === 'cancelled';
            const hasDue = bill.balance_due > 0;

            return (
              <div
                key={bill.id}
                onClick={() => handleViewBill(bill)}
                className={`p-3.5 bg-white border-2 rounded-lg cursor-pointer transition-all hover:border-accent-700 shadow-sm ${
                  isCancelled
                    ? 'border-red-200 opacity-60 bg-red-50/20'
                    : selectedBill?.id === bill.id
                    ? 'border-accent-700 ring-2 ring-blue-100'
                    : 'border-slate-300'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                  {/* Left Column: Bill No, Date, Customer */}
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-black text-accent-700">
                        {bill.bill_no}
                      </span>
                      <span className="text-xs text-slate-500 font-semibold">
                        {formatDateTime(bill.created_at)}
                      </span>
                      {isCancelled && (
                        <span className="text-[10px] font-black uppercase bg-red-100 text-red-800 px-1.5 py-0.2 rounded border border-red-300">
                          Cancelled
                        </span>
                      )}
                    </div>

                    <div className="text-sm font-bold text-slate-900 mt-0.5">
                      {bill.customer_name}{' '}
                      <span className="text-xs font-semibold text-slate-600">
                        (+91 {bill.customer_mobile})
                      </span>
                    </div>

                    <div className="text-xs text-slate-700 mt-0.5">
                      {bill.battery_brand} {bill.battery_model} ({bill.battery_type}) x{bill.quantity}
                      {bill.serial_number && (
                        <span className="text-slate-500 font-mono ml-1">
                          [SN: {bill.serial_number}]
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right Column: Amount, Payment Mode, Due, Actions */}
                  <div className="sm:text-right flex sm:flex-col justify-between items-center sm:items-end mt-1 sm:mt-0">
                    <div>
                      <div className="text-base font-black text-slate-900">
                        {formatCurrency(bill.grand_total)}
                      </div>
                      <div className="text-xs font-bold text-slate-600">
                        Mode: <span className="text-slate-900">{bill.payment_mode}</span>
                        {hasDue && (
                          <span className="text-red-600 ml-1.5 font-black">
                            Due: {formatCurrency(bill.balance_due)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center space-x-1.5 mt-1 text-[11px]">
                      <span className="text-slate-500 hidden sm:inline">By {bill.created_by_name?.split(' ')[0]}</span>
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* BILL DETAIL MODAL / DRAWER */}
      {selectedBill && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-xl max-w-xl w-full p-4 sm:p-6 shadow-2xl my-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b pb-3 mb-3">
              <div>
                <span className="text-xs font-bold text-slate-500 uppercase">Bill Details</span>
                <h3 className="text-lg font-black text-slate-900 flex items-center space-x-2">
                  <span>{selectedBill.bill_no}</span>
                  {selectedBill.status === 'cancelled' && (
                    <span className="text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded font-black">CANCELLED</span>
                  )}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedBill(null)}
                className="p-1.5 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Bill Body */}
            <div className="space-y-3 text-xs sm:text-sm">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 grid grid-cols-2 gap-2">
                <div>
                  <span className="text-slate-500 block text-[11px]">Customer:</span>
                  <strong className="text-slate-900">{selectedBill.customer_name}</strong>
                  <div className="text-slate-700">+91 {selectedBill.customer_mobile}</div>
                </div>
                <div className="text-right">
                  <span className="text-slate-500 block text-[11px]">Billed Date:</span>
                  <strong className="text-slate-900">{formatDateTime(selectedBill.created_at)}</strong>
                  <div className="text-slate-600 text-[11px]">Staff: {selectedBill.created_by_name}</div>
                </div>
              </div>

              {/* Item Info */}
              <div className="border border-slate-200 rounded-lg p-3">
                <div className="flex justify-between font-bold text-slate-900 text-sm">
                  <span>{selectedBill.battery_brand} {selectedBill.battery_model}</span>
                  <span>{formatCurrency(selectedBill.unit_price)} x {selectedBill.quantity}</span>
                </div>
                <div className="text-xs text-slate-600 mt-1">
                  Type: {selectedBill.battery_type} ({selectedBill.battery_capacity}Ah) • Warranty: {selectedBill.warranty_months}m
                </div>
                {selectedBill.serial_number && (
                  <div className="text-xs font-mono font-bold text-slate-800 mt-0.5">
                    Serial No: {selectedBill.serial_number}
                  </div>
                )}
              </div>

              {/* Pricing breakdown */}
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-600">Subtotal:</span>
                  <span className="font-semibold">{formatCurrency(selectedBill.subtotal)}</span>
                </div>
                {selectedBill.exchange_discount > 0 && (
                  <div className="flex justify-between text-emerald-800">
                    <span>Old Battery Exchange Discount ({selectedBill.old_battery_brand}):</span>
                    <span className="font-bold">-{formatCurrency(selectedBill.exchange_discount)}</span>
                  </div>
                )}
                {selectedBill.manual_discount > 0 && (
                  <div className="flex justify-between text-slate-700">
                    <span>Extra Discount:</span>
                    <span className="font-bold">-{formatCurrency(selectedBill.manual_discount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-base font-black text-slate-900 border-t border-slate-300 pt-1">
                  <span>Grand Total:</span>
                  <span className="text-accent-700">{formatCurrency(selectedBill.grand_total)}</span>
                </div>
                <div className="flex justify-between text-xs font-bold pt-0.5">
                  <span>Amount Paid ({selectedBill.payment_mode}):</span>
                  <span>{formatCurrency(selectedBill.amount_paid)}</span>
                </div>
                {selectedBill.balance_due > 0 && (
                  <div className="flex justify-between text-sm font-black text-red-600 border-t border-red-200 pt-1">
                    <span>Balance Due:</span>
                    <span>{formatCurrency(selectedBill.balance_due)}</span>
                  </div>
                )}
              </div>

              {/* Messaging status strip */}
              <div className="p-2.5 bg-blue-50 border border-blue-200 rounded text-xs flex items-center justify-between">
                <div>
                  <span className="font-bold text-blue-900">WhatsApp Status: </span>
                  <span className="capitalize font-semibold text-blue-800">
                    {selectedBill.whatsapp_status || 'Pending'}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={resendingId === selectedBill.id}
                  onClick={() => handleResend(selectedBill.id)}
                  className="px-2.5 py-1 bg-white hover:bg-blue-100 border border-blue-300 rounded font-bold text-xs text-blue-900 flex items-center space-x-1"
                >
                  <Send className="w-3 h-3" />
                  <span>{resendingId === selectedBill.id ? 'Sending...' : 'Resend WhatsApp'}</span>
                </button>
              </div>

              {/* Edit History (if any) */}
              {billEdits.length > 0 && (
                <div className="border border-slate-200 rounded p-2.5 text-xs bg-slate-50">
                  <div className="font-bold text-slate-700 mb-1 flex items-center space-x-1">
                    <History className="w-3.5 h-3.5" />
                    <span>Edit Audit Trail ({billEdits.length} changes logged):</span>
                  </div>
                  <div className="space-y-1 divide-y divide-slate-200">
                    {billEdits.map((ed) => (
                      <div key={ed.id} className="pt-1 text-[11px] text-slate-600">
                        <strong className="text-slate-800">{ed.edited_by_name}</strong> on {formatDateTime(ed.created_at)}:{' '}
                        <span>{ed.changes_summary}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Actions */}
            <div className="border-t pt-3 mt-4 flex flex-wrap justify-between gap-2">
              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={() => setShowPrintModal(true)}
                  className="px-3.5 py-2 bg-accent-700 hover:bg-accent-800 text-white font-bold rounded-lg text-xs flex items-center space-x-1.5"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print / View Invoice</span>
                </button>

                {canEditBill(selectedBill) && (
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(selectedBill)}
                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-lg text-xs border border-slate-300 flex items-center space-x-1"
                  >
                    <Edit className="w-3.5 h-3.5" />
                    <span>Edit</span>
                  </button>
                )}
              </div>

              {isOwner && selectedBill.status !== 'cancelled' && (
                <button
                  type="button"
                  onClick={() => handleDeleteBill(selectedBill)}
                  className="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-700 font-bold rounded-lg text-xs border border-red-300 flex items-center space-x-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Cancel Bill</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* EDIT BILL MODAL */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-3 overflow-y-auto">
          <div className="bg-white rounded-xl max-w-lg w-full p-5 border-2 border-accent-700 shadow-2xl my-auto">
            <div className="flex justify-between items-center border-b pb-2 mb-3">
              <h3 className="text-base font-black text-slate-900">
                Edit Bill: {selectedBill?.bill_no}
              </h3>
              <button type="button" onClick={() => setShowEditModal(false)}>
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-0.5">Customer Name</label>
                  <input
                    type="text"
                    required
                    value={editForm.customer_name}
                    onChange={(e) => setEditForm({ ...editForm, customer_name: e.target.value })}
                    className="w-full h-9 px-2 border rounded font-semibold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-0.5">Mobile Number</label>
                  <input
                    type="text"
                    required
                    maxLength={10}
                    value={editForm.customer_mobile}
                    onChange={(e) => setEditForm({ ...editForm, customer_mobile: e.target.value })}
                    className="w-full h-9 px-2 border rounded font-semibold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-0.5">Quantity</label>
                  <input
                    type="number"
                    min={1}
                    value={editForm.quantity}
                    onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })}
                    className="w-full h-9 px-2 border rounded font-semibold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-0.5">Unit Price (₹)</label>
                  <input
                    type="number"
                    value={editForm.unit_price}
                    onChange={(e) => setEditForm({ ...editForm, unit_price: e.target.value })}
                    className="w-full h-9 px-2 border rounded font-semibold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-0.5">Exchange Discount (₹)</label>
                  <input
                    type="number"
                    value={editForm.exchange_discount}
                    onChange={(e) => setEditForm({ ...editForm, exchange_discount: e.target.value })}
                    className="w-full h-9 px-2 border rounded font-semibold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-0.5">Special Discount (₹)</label>
                  <input
                    type="number"
                    value={editForm.manual_discount}
                    onChange={(e) => setEditForm({ ...editForm, manual_discount: e.target.value })}
                    className="w-full h-9 px-2 border rounded font-semibold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-0.5">Payment Mode</label>
                  <select
                    value={editForm.payment_mode}
                    onChange={(e) => setEditForm({ ...editForm, payment_mode: e.target.value })}
                    className="w-full h-9 px-2 border rounded font-semibold bg-white"
                  >
                    <option value="UPI">UPI</option>
                    <option value="Cash">Cash</option>
                    <option value="Card">Card</option>
                    <option value="Credit">Credit</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-0.5">Amount Paid (₹)</label>
                  <input
                    type="number"
                    value={editForm.amount_paid}
                    onChange={(e) => setEditForm({ ...editForm, amount_paid: e.target.value })}
                    className="w-full h-9 px-2 border rounded font-semibold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-0.5">Serial Number</label>
                  <input
                    type="text"
                    value={editForm.serial_number}
                    onChange={(e) => setEditForm({ ...editForm, serial_number: e.target.value })}
                    className="w-full h-9 px-2 border rounded font-mono font-semibold uppercase"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-0.5">Warranty (Months)</label>
                  <input
                    type="number"
                    value={editForm.warranty_months}
                    onChange={(e) => setEditForm({ ...editForm, warranty_months: e.target.value })}
                    className="w-full h-9 px-2 border rounded font-semibold"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-0.5">Notes</label>
                <input
                  type="text"
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  className="w-full h-9 px-2 border rounded"
                />
              </div>

              <p className="text-[11px] text-slate-500 italic">
                * Note: Changes will be recorded in the audit history under your account ({user?.name}). Stock will adjust automatically if quantity changes.
              </p>

              <div className="flex justify-end space-x-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-3 py-2 bg-slate-100 rounded text-slate-700 font-bold border"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-accent-700 text-white rounded font-black shadow"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PRINT INVOICE MODAL */}
      {showPrintModal && selectedBill && (
        <PrintInvoice
          bill={selectedBill}
          shopSettings={shopSettings}
          onClose={() => setShowPrintModal(false)}
        />
      )}
    </div>
  );
}

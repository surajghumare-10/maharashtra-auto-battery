import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { formatCurrency, formatDate, formatDateTime, exportToCSV } from '../utils/formatters';
import {
  AlertCircle,
  Search,
  Filter,
  DollarSign,
  Send,
  Printer,
  FileSpreadsheet,
  ChevronDown,
  ChevronUp,
  Receipt,
  CheckCircle,
  ExternalLink,
  MessageCircle,
  X
} from 'lucide-react';

export default function CustomerDues() {
  const { shopSettings, t } = useAuth();

  const [summary, setSummary] = useState({});
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [pendingOnly, setPendingOnly] = useState(true);
  const [sortBy, setSortBy] = useState('highestPending');

  // Expanded customer state
  const [expandedCustomerId, setExpandedCustomerId] = useState(null);
  const [customerDetails, setCustomerDetails] = useState({});

  // Payment Recording Modal
  const [paymentTarget, setPaymentTarget] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState('UPI');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [isRecordingPayment, setIsRecordingPayment] = useState(false);
  const [paymentSuccessData, setPaymentSuccessData] = useState(null);

  // Reminder status
  const [reminderStatus, setReminderStatus] = useState({});

  useEffect(() => {
    loadDues();
  }, [pendingOnly, sortBy]);

  const loadDues = async () => {
    setLoading(true);
    try {
      const params = {
        pendingOnly,
        sortBy
      };
      if (search.trim()) params.search = search.trim();

      const res = await api.getDuesReport(params);
      setSummary(res.summary || {});
      setCustomers(res.customers || []);
    } catch (err) {
      console.error('Error loading dues report:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    loadDues();
  };

  // Toggle expanded customer details (bills & payments)
  const toggleExpandCustomer = async (cust) => {
    if (expandedCustomerId === cust.id) {
      setExpandedCustomerId(null);
      return;
    }

    setExpandedCustomerId(cust.id);
    if (!customerDetails[cust.id]) {
      try {
        const res = await api.getCustomerDetail(cust.id);
        setCustomerDetails(prev => ({ ...prev, [cust.id]: res }));
      } catch (err) {
        console.error('Failed to load customer history:', err);
      }
    }
  };

  // Open Payment Modal
  const handleOpenPayment = (cust) => {
    setPaymentTarget(cust);
    setPaymentAmount(cust.pending_balance > 0 ? cust.pending_balance : '');
    setPaymentMode('UPI');
    setPaymentNotes('');
    setPaymentSuccessData(null);
  };

  // Submit Payment
  const handleSubmitPayment = async (e) => {
    e.preventDefault();
    if (!paymentAmount || parseFloat(paymentAmount) <= 0) {
      alert('Please enter a valid payment amount');
      return;
    }

    setIsRecordingPayment(true);
    try {
      const res = await api.recordPayment({
        customer_id: paymentTarget.id,
        amount: parseFloat(paymentAmount),
        payment_mode: paymentMode,
        notes: paymentNotes
      });

      setPaymentSuccessData(res);
      // Reload dues ledger
      loadDues();
      // Reload customer history
      const freshDetail = await api.getCustomerDetail(paymentTarget.id);
      setCustomerDetails(prev => ({ ...prev, [paymentTarget.id]: freshDetail }));
    } catch (err) {
      alert(err.message || 'Failed to record payment');
    } finally {
      setIsRecordingPayment(false);
    }
  };

  // Send Due Reminder
  const handleSendReminder = async (cust) => {
    setReminderStatus(prev => ({ ...prev, [cust.id]: 'sending' }));
    try {
      const res = await api.sendDueReminder(cust.id);
      setReminderStatus(prev => ({
        ...prev,
        [cust.id]: {
          status: res.status,
          waMeUrl: res.waMeUrl
        }
      }));
    } catch (err) {
      alert(err.message || 'Failed to send reminder');
      setReminderStatus(prev => ({ ...prev, [cust.id]: 'failed' }));
    }
  };

  // Export to CSV
  const handleExportCSV = () => {
    const dataToExport = customers.map(c => ({
      'Customer Name': c.name,
      'Mobile': c.mobile,
      'Total Purchases': c.total_purchases,
      'Total Paid': c.total_paid,
      'Pending Balance': c.pending_balance,
      'Last Purchase Date': c.last_purchase_date || 'N/A',
      'Last Payment Date': c.last_payment_date || 'N/A'
    }));
    exportToCSV(`customer_dues_${new Date().toISOString().split('T')[0]}.csv`, dataToExport);
  };

  // Print Friendly
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="max-w-7xl mx-auto px-3 py-3 sm:py-6 pb-28">
      {/* Title & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b-2 border-slate-200 pb-3 mb-4 print:hidden">
        <div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center space-x-2">
            <span>Customer Dues</span>
            <span className="text-xs bg-red-100 text-red-800 font-bold px-2 py-0.5 rounded border border-red-300">
              Owner Ledger
            </span>
          </h2>
          <p className="text-xs text-slate-500 font-semibold mt-0.5">
            Credit tracking, payment receipts, and automated WhatsApp dues reminders
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={handleExportCSV}
            className="px-3 py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs border border-slate-300 flex items-center space-x-1.5 active:bg-slate-300"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="px-3 py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs border border-slate-300 flex items-center space-x-1.5 active:bg-slate-300"
          >
            <Printer className="w-3.5 h-3.5 text-slate-700" />
            <span>Print Sheet</span>
          </button>
        </div>
      </div>

      {/* SUMMARY STRIP */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        {/* Total Pending */}
        <div className="bg-red-50 border-2 border-red-300 rounded-lg p-3.5 shadow-sm">
          <div className="text-xs font-black text-red-800 uppercase tracking-wider">
            Total Pending Across All Customers
          </div>
          <div className="text-2xl sm:text-3xl font-black text-red-600 mt-1">
            {formatCurrency(summary.totalPendingAcrossAll || 0)}
          </div>
          <div className="text-[11px] font-bold text-red-700 mt-0.5">
            {summary.customersWithDuesCount || 0} customers with outstanding balance
          </div>
        </div>

        {/* Total Customers With Dues */}
        <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-3.5 shadow-sm">
          <div className="text-xs font-black text-amber-800 uppercase tracking-wider">
            Customers with Dues
          </div>
          <div className="text-2xl sm:text-3xl font-black text-amber-900 mt-1">
            {summary.customersWithDuesCount || 0}
          </div>
          <div className="text-[11px] font-bold text-amber-800 mt-0.5">
            Require follow-up & payment collection
          </div>
        </div>

        {/* Total Sales To Date */}
        <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-3.5 shadow-sm">
          <div className="text-xs font-black text-blue-800 uppercase tracking-wider">
            Total Sales to Date
          </div>
          <div className="text-2xl sm:text-3xl font-black text-blue-900 mt-1">
            {formatCurrency(summary.totalSalesToDate || 0)}
          </div>
          <div className="text-[11px] font-bold text-blue-700 mt-0.5">
            All-time gross turnover
          </div>
        </div>
      </div>

      {/* SEARCH AND FILTERS */}
      <div className="bg-white border-2 border-slate-300 rounded-lg p-3 mb-4 shadow-sm space-y-2.5 print:hidden">
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customer by name or 10-digit mobile number..."
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

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-200 text-xs">
          {/* Toggle: Only pending > 0 */}
          <label className="flex items-center space-x-2 font-bold text-slate-800 cursor-pointer">
            <input
              type="checkbox"
              checked={pendingOnly}
              onChange={(e) => setPendingOnly(e.target.checked)}
              className="w-4 h-4 text-accent-700 rounded border-slate-300"
            />
            <span>Only show customers with pending balance &gt; 0</span>
          </label>

          {/* Sort By */}
          <div className="flex items-center space-x-1.5">
            <span className="font-bold text-slate-600">Sort by:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="h-8 px-2 border border-slate-300 rounded text-xs font-semibold bg-white"
            >
              <option value="highestPending">Highest Pending Balance</option>
              <option value="oldestDue">Oldest Due Date</option>
              <option value="name">Customer Name</option>
            </select>
          </div>
        </div>
      </div>

      {/* CUSTOMER DUES TABLE */}
      {loading ? (
        <div className="p-8 text-center text-slate-500 font-bold text-sm bg-white rounded-lg border">
          Loading customer dues ledger...
        </div>
      ) : customers.length === 0 ? (
        <div className="p-8 text-center text-slate-500 font-medium text-sm bg-white rounded-lg border">
          No customer records found matching filter.
        </div>
      ) : (
        <div className="space-y-3">
          {customers.map((c) => {
            const isExpanded = expandedCustomerId === c.id;
            const details = customerDetails[c.id];
            const reminder = reminderStatus[c.id];

            return (
              <div
                key={c.id}
                className="bg-white border-2 border-slate-300 rounded-lg shadow-sm overflow-hidden"
              >
                {/* Customer Main Row */}
                <div className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  {/* Left: Customer Info */}
                  <div
                    onClick={() => toggleExpandCustomer(c)}
                    className="cursor-pointer flex-1"
                  >
                    <div className="flex items-center space-x-2">
                      <span className="text-base font-black text-slate-900">
                        {c.name}
                      </span>
                      <span className="text-xs font-bold text-slate-600">
                        (+91 {c.mobile})
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-slate-500" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-500" />
                      )}
                    </div>

                    <div className="text-xs text-slate-600 mt-1 flex flex-wrap gap-x-4">
                      <span>Total Purchases: <strong>{formatCurrency(c.total_purchases)}</strong></span>
                      <span>Total Paid: <strong>{formatCurrency(c.total_paid)}</strong></span>
                      {c.last_purchase_date && (
                        <span>Last Billed: {formatDate(c.last_purchase_date)}</span>
                      )}
                    </div>
                  </div>

                  {/* Middle / Right: Pending Balance & Actions */}
                  <div className="flex items-center justify-between sm:justify-end space-x-3">
                    <div className="text-right">
                      <div className="text-[11px] font-bold text-slate-500 uppercase">
                        Pending Due:
                      </div>
                      <div className={`text-xl font-black ${
                        c.pending_balance > 0 ? 'text-red-600' : 'text-emerald-700'
                      }`}>
                        {formatCurrency(c.pending_balance)}
                      </div>
                    </div>

                    <div className="flex items-center space-x-1.5 print:hidden">
                      {/* Record Payment Button */}
                      <button
                        type="button"
                        onClick={() => handleOpenPayment(c)}
                        className="px-3 py-2 bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 text-white font-bold text-xs rounded-lg shadow-sm flex items-center space-x-1"
                      >
                        <DollarSign className="w-3.5 h-3.5" />
                        <span>Record Payment</span>
                      </button>

                      {/* Send Reminder Button */}
                      {c.pending_balance > 0 && (
                        <button
                          type="button"
                          disabled={reminder === 'sending'}
                          onClick={() => handleSendReminder(c)}
                          title="Send Due Reminder"
                          className="px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-900 font-bold text-xs rounded-lg border border-blue-300 flex items-center space-x-1"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>{reminder === 'sending' ? 'Sending...' : 'Reminder'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Reminder feedback if generated */}
                {reminder && typeof reminder === 'object' && reminder.waMeUrl && (
                  <div className="px-3.5 py-2 bg-blue-50 border-t border-blue-200 text-xs flex items-center justify-between">
                    <span className="text-blue-900 font-semibold">Reminder pre-filled link generated:</span>
                    <a
                      href={reminder.waMeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center space-x-1 px-3 py-1 bg-emerald-600 text-white rounded font-bold text-xs"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>Open WhatsApp</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}

                {/* EXPANDABLE BILLS AND PAYMENT HISTORY */}
                {isExpanded && (
                  <div className="border-t-2 border-slate-200 bg-slate-50 p-3 sm:p-4 text-xs">
                    <h4 className="font-black text-slate-800 text-xs uppercase mb-2">
                      Ledger & History for {c.name}:
                    </h4>

                    {!details ? (
                      <p className="text-slate-500">Loading customer history...</p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Purchases / Bills */}
                        <div>
                          <div className="font-bold text-slate-700 mb-1 flex items-center justify-between">
                            <span>Bills / Purchases ({details.bills?.length || 0}):</span>
                          </div>
                          <div className="space-y-1.5 max-h-56 overflow-y-auto">
                            {details.bills?.length === 0 ? (
                              <p className="text-slate-500 italic">No bills found.</p>
                            ) : (
                              details.bills.map(b => (
                                <div key={b.id} className="p-2 bg-white rounded border border-slate-200">
                                  <div className="flex justify-between font-bold text-slate-900">
                                    <span>{b.bill_no} • {b.battery_brand} {b.battery_model}</span>
                                    <span>{formatCurrency(b.grand_total)}</span>
                                  </div>
                                  <div className="text-[11px] text-slate-600 flex justify-between mt-0.5">
                                    <span>{formatDate(b.created_at)} ({b.payment_mode})</span>
                                    {b.balance_due > 0 ? (
                                      <span className="text-red-600 font-bold">Due: {formatCurrency(b.balance_due)}</span>
                                    ) : (
                                      <span className="text-emerald-700 font-bold">Paid</span>
                                    )}
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>

                        {/* Payment Receipts */}
                        <div>
                          <div className="font-bold text-slate-700 mb-1">
                            Payments Received ({details.payments?.length || 0}):
                          </div>
                          <div className="space-y-1.5 max-h-56 overflow-y-auto">
                            {details.payments?.length === 0 ? (
                              <p className="text-slate-500 italic">No separate payment receipts recorded yet.</p>
                            ) : (
                              details.payments.map(p => (
                                <div key={p.id} className="p-2 bg-white rounded border border-slate-200">
                                  <div className="flex justify-between font-bold text-emerald-800">
                                    <span>{p.receipt_no || `REC-${p.id}`} • {p.payment_mode}</span>
                                    <span>+{formatCurrency(p.amount)}</span>
                                  </div>
                                  <div className="text-[11px] text-slate-600 flex justify-between mt-0.5">
                                    <span>Date: {formatDateTime(p.created_at)}</span>
                                    <span>By: {p.received_by_name}</span>
                                  </div>
                                  {p.notes && (
                                    <div className="text-[11px] text-slate-500 italic mt-0.5">{p.notes}</div>
                                  )}
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* RECORD PAYMENT MODAL */}
      {paymentTarget && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-3 overflow-y-auto">
          <div className="bg-white rounded-xl max-w-md w-full p-5 border-2 border-emerald-600 shadow-2xl my-auto">
            <div className="flex justify-between items-center border-b pb-2 mb-3">
              <div>
                <h3 className="text-base font-black text-slate-900">
                  Record Payment
                </h3>
                <p className="text-xs text-slate-600">
                  Customer: <strong>{paymentTarget.name}</strong> (+91 {paymentTarget.mobile})
                </p>
              </div>
              <button type="button" onClick={() => setPaymentTarget(null)}>
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            {paymentSuccessData ? (
              /* Success confirmation */
              <div className="space-y-3 text-xs">
                <div className="p-3 bg-emerald-50 border border-emerald-300 rounded text-emerald-900">
                  <div className="flex items-center space-x-2 font-black text-sm mb-1">
                    <CheckCircle className="w-5 h-5 text-emerald-600" />
                    <span>Payment Recorded Successfully!</span>
                  </div>
                  <p>Receipt No: <strong>{paymentSuccessData.payment.receipt_no}</strong></p>
                  <p>Amount Received: <strong>{formatCurrency(paymentSuccessData.payment.amount)}</strong></p>
                  <p>Remaining Balance: <strong className="text-red-700">{formatCurrency(paymentSuccessData.remainingBalance)}</strong></p>
                </div>

                {paymentSuccessData.messaging?.waMeUrl && (
                  <a
                    href={paymentSuccessData.messaging.waMeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded flex items-center justify-center space-x-1.5"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>Send Receipt via WhatsApp</span>
                    <ExternalLink className="w-3.5 h-3.5 ml-1" />
                  </a>
                )}

                <button
                  type="button"
                  onClick={() => setPaymentTarget(null)}
                  className="w-full h-10 bg-slate-800 text-white font-bold rounded"
                >
                  Done / Close
                </button>
              </div>
            ) : (
              /* Payment Input Form */
              <form onSubmit={handleSubmitPayment} className="space-y-3 text-xs">
                <div className="p-2.5 bg-red-50 border border-red-200 rounded flex justify-between items-center">
                  <span className="font-bold text-red-900">Current Outstanding Balance:</span>
                  <span className="text-base font-black text-red-600">{formatCurrency(paymentTarget.pending_balance)}</span>
                </div>

                <div>
                  <label className="block font-bold text-slate-800 mb-1">
                    Payment Amount Received (₹) *
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    min={1}
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    placeholder="Enter amount paid"
                    className="w-full h-11 px-3 border-2 border-emerald-500 rounded text-base font-black text-slate-900 focus:outline-none"
                  />
                  <div className="flex gap-1.5 mt-1.5">
                    <button
                      type="button"
                      onClick={() => setPaymentAmount(paymentTarget.pending_balance)}
                      className="px-2 py-0.5 bg-slate-100 border text-[11px] font-bold text-slate-700 rounded hover:bg-slate-200"
                    >
                      Full Balance ({formatCurrency(paymentTarget.pending_balance)})
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-800 mb-1">
                    Payment Mode *
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {['UPI', 'Cash', 'Card'].map(mode => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setPaymentMode(mode)}
                        className={`h-10 rounded font-bold border-2 transition-colors ${
                          paymentMode === mode
                            ? 'bg-accent-700 text-white border-accent-700'
                            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-800 mb-1">
                    Notes / Reference (Optional)
                  </label>
                  <input
                    type="text"
                    value={paymentNotes}
                    onChange={(e) => setPaymentNotes(e.target.value)}
                    placeholder="e.g. GPay Ref 882910"
                    className="w-full h-9 px-2 border rounded"
                  />
                </div>

                <p className="text-[11px] text-slate-500 italic">
                  * Payment is automatically allocated to the oldest unpaid bill first. The balance updates instantly and customer receives a WhatsApp receipt.
                </p>

                <div className="flex justify-end space-x-2 pt-2 border-t">
                  <button
                    type="button"
                    onClick={() => setPaymentTarget(null)}
                    className="px-3 py-2 bg-slate-100 rounded text-slate-700 font-bold border"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isRecordingPayment}
                    className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded font-black shadow"
                  >
                    {isRecordingPayment ? 'Recording...' : 'Submit Payment'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

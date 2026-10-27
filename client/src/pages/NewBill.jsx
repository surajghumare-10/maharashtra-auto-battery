import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { formatCurrency, cleanMobile } from '../utils/formatters';
import {
  Send,
  Save,
  CheckCircle,
  AlertCircle,
  Printer,
  RotateCcw,
  UserCheck,
  Search,
  MessageCircle,
  ExternalLink,
  ChevronDown
} from 'lucide-react';

const BATTERY_TYPES = ['Car', 'Bike', 'Inverter', 'Tractor', 'Truck', 'E-rickshaw'];

export default function NewBill({ onOpenBillDetail }) {
  const { user, isOwner, isManager, isWorker, t } = useAuth();

  // Catalog
  const [batteries, setBatteries] = useState([]);
  const [selectedType, setSelectedType] = useState('All');
  const [modelSearch, setModelSearch] = useState('');
  const [loadingCatalog, setLoadingCatalog] = useState(true);

  // Form Fields
  const [customerMobile, setCustomerMobile] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [repeatCustomer, setRepeatCustomer] = useState(null);
  const [selectedBattery, setSelectedBattery] = useState(null);

  const [quantity, setQuantity] = useState(1);
  const [unitPrice, setUnitPrice] = useState('');
  const [oldBatteryReturned, setOldBatteryReturned] = useState(false);
  const [exchangeDiscount, setExchangeDiscount] = useState('');
  const [oldBatteryBrand, setOldBatteryBrand] = useState('');
  const [oldBatteryCondition, setOldBatteryCondition] = useState('Scrap / Used');
  const [manualDiscount, setManualDiscount] = useState('');
  const [paymentMode, setPaymentMode] = useState('UPI');
  const [amountPaidNow, setAmountPaidNow] = useState('');
  const [warrantyMonths, setWarrantyMonths] = useState(36);
  const [serialNumber, setSerialNumber] = useState('');
  const [notes, setNotes] = useState('');

  // States
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [stockOverridePrompt, setStockOverridePrompt] = useState(null);
  const [saveSuccessModal, setSaveSuccessModal] = useState(null);

  // Load catalog on mount
  useEffect(() => {
    loadBatteries();
  }, []);

  const loadBatteries = async () => {
    try {
      setLoadingCatalog(true);
      const res = await api.getBatteries();
      setBatteries(res.batteries || []);
    } catch (err) {
      setErrorMessage('Failed to load battery catalog: ' + err.message);
    } finally {
      setLoadingCatalog(false);
    }
  };

  // Instant Customer Mobile Lookup
  const handleMobileChange = async (val) => {
    const raw = cleanMobile(val);
    setCustomerMobile(raw);

    if (raw.length === 10) {
      try {
        const res = await api.lookupCustomer(raw);
        if (res.found && res.customer) {
          setCustomerName(res.customer.name);
          setRepeatCustomer(res.customer);
        } else {
          setRepeatCustomer(null);
        }
      } catch (err) {
        console.error('Customer lookup error:', err);
      }
    } else {
      setRepeatCustomer(null);
    }
  };

  // Select Battery Model
  const handleSelectBattery = (battery) => {
    setSelectedBattery(battery);
    setUnitPrice(battery.selling_price);
    setWarrantyMonths(battery.warranty_months);

    if (oldBatteryReturned) {
      setExchangeDiscount(battery.exchange_discount || 0);
    }
  };

  // Toggle Old Battery Return
  const handleOldBatteryToggle = (returned) => {
    setOldBatteryReturned(returned);
    if (returned && selectedBattery) {
      setExchangeDiscount(selectedBattery.exchange_discount || 0);
    } else if (!returned) {
      setExchangeDiscount(0);
      setOldBatteryBrand('');
    }
  };

  // Calculations
  const numQty = Math.max(1, parseInt(quantity, 10) || 1);
  const numPrice = parseFloat(unitPrice) || 0;
  const subtotal = numQty * numPrice;
  const numExDiscount = oldBatteryReturned ? (parseFloat(exchangeDiscount) || 0) : 0;
  const numManDiscount = parseFloat(manualDiscount) || 0;
  const grandTotal = Math.max(0, subtotal - numExDiscount - numManDiscount);

  // Payment Paid & Due calculation
  let paidNow = 0;
  let balanceDue = 0;
  if (paymentMode === 'Credit') {
    paidNow = parseFloat(amountPaidNow) || 0;
    balanceDue = Math.max(0, grandTotal - paidNow);
  } else {
    paidNow = grandTotal;
    balanceDue = 0;
  }

  // Filtered batteries for selection
  const filteredBatteries = batteries.filter(b => {
    const matchesType = selectedType === 'All' || b.type === selectedType;
    const matchesSearch = !modelSearch || 
      b.brand.toLowerCase().includes(modelSearch.toLowerCase()) || 
      b.model_name.toLowerCase().includes(modelSearch.toLowerCase());
    return matchesType && matchesSearch;
  });

  // Save Bill Handler
  const handleSaveBill = async (sendMessage = true, allowOverride = false) => {
    if (isSubmitting) return; // Prevent double-tap!

    // Validations
    if (!customerName.trim()) {
      setErrorMessage('Please enter Customer Name');
      return;
    }
    if (!customerMobile || customerMobile.length !== 10) {
      setErrorMessage('Please enter a valid 10-digit mobile number');
      return;
    }
    if (!selectedBattery) {
      setErrorMessage('Please select a battery model');
      return;
    }

    setErrorMessage('');
    setIsSubmitting(true);

    const payload = {
      customer_name: customerName.trim(),
      customer_mobile: customerMobile,
      battery_id: selectedBattery.id,
      quantity: numQty,
      unit_price: numPrice,
      old_battery_returned: oldBatteryReturned,
      old_battery_type: selectedBattery.type,
      old_battery_brand: oldBatteryBrand || 'Old Return',
      old_battery_condition: oldBatteryCondition,
      exchange_discount: numExDiscount,
      manual_discount: numManDiscount,
      payment_mode: paymentMode,
      amount_paid: paidNow,
      warranty_months: warrantyMonths,
      serial_number: serialNumber.trim(),
      notes: notes.trim(),
      allow_zero_stock_override: allowOverride,
      send_message: sendMessage
    };

    try {
      const res = await api.createBill(payload);
      setSaveSuccessModal(res);
      // Refresh catalog stock
      loadBatteries();
    } catch (err) {
      if (err.data && err.data.requiresOverride) {
        setStockOverridePrompt({
          warning: err.data.warning,
          sendMessage
        });
      } else {
        setErrorMessage(err.message || 'Failed to save bill');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Reset form for next customer
  const handleResetForm = () => {
    setCustomerMobile('');
    setCustomerName('');
    setRepeatCustomer(null);
    setSelectedBattery(null);
    setQuantity(1);
    setUnitPrice('');
    setOldBatteryReturned(false);
    setExchangeDiscount('');
    setOldBatteryBrand('');
    setManualDiscount('');
    setPaymentMode('UPI');
    setAmountPaidNow('');
    setSerialNumber('');
    setNotes('');
    setSaveSuccessModal(null);
    setErrorMessage('');
  };

  return (
    <div className="max-w-4xl mx-auto px-3 py-3 sm:py-6 pb-28">
      {/* Top Banner & Quick Reset */}
      <div className="flex items-center justify-between mb-3 border-b-2 border-slate-200 pb-2">
        <div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center space-x-2">
            <span>{t.new_bill}</span>
            <span className="text-xs bg-accent-700 text-white font-bold px-2 py-0.5 rounded">Counter POS</span>
          </h2>
        </div>
        <button
          type="button"
          onClick={handleResetForm}
          className="text-xs font-bold text-slate-600 hover:text-slate-900 flex items-center space-x-1 px-2.5 py-1.5 rounded bg-slate-100 border border-slate-300 active:bg-slate-200"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Clear Form</span>
        </button>
      </div>

      {errorMessage && (
        <div className="mb-4 p-3 bg-red-100 border-l-4 border-red-600 text-red-900 font-bold text-sm rounded flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-600" />
            <span>{errorMessage}</span>
          </div>
          <button type="button" onClick={() => setErrorMessage('')} className="text-xs underline ml-2">Dismiss</button>
        </div>
      )}

      <div className="space-y-4">
        {/* SECTION 1: CUSTOMER DETAILS */}
        <div className="bg-white border-2 border-slate-300 rounded-lg p-3 sm:p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-black text-slate-600 uppercase tracking-wider">
              1. Customer Details
            </span>
            {repeatCustomer && (
              <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                <UserCheck className="w-3.5 h-3.5" />
                <span>Repeat Customer</span>
                {repeatCustomer.pending_balance > 0 && (
                  <span className="ml-1 text-red-700 font-black">
                    (Due: {formatCurrency(repeatCustomer.pending_balance)})
                  </span>
                )}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Mobile Number */}
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">
                {t.mobile_number} <span className="text-red-600">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-sm font-bold text-slate-500 select-none">
                  +91
                </span>
                <input
                  type="tel"
                  maxLength={10}
                  value={customerMobile}
                  onChange={(e) => handleMobileChange(e.target.value)}
                  placeholder="9876543210"
                  className="w-full h-11 pl-12 pr-3 border-2 border-slate-300 rounded text-base font-bold text-slate-900 focus:border-accent-700 focus:outline-none"
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Type 10 digits to auto-recognize repeat customers
              </p>
            </div>

            {/* Customer Name */}
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">
                {t.customer_name} <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="e.g. Ramesh Patil"
                className="w-full h-11 px-3 border-2 border-slate-300 rounded text-base font-bold text-slate-900 focus:border-accent-700 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* SECTION 2: BATTERY SELECTION */}
        <div className="bg-white border-2 border-slate-300 rounded-lg p-3 sm:p-4 shadow-sm">
          <span className="block text-xs font-black text-slate-600 uppercase tracking-wider mb-2">
            2. Battery Selection
          </span>

          {/* Type Filter Pills */}
          <div className="flex space-x-1 overflow-x-auto pb-2 scrollbar-none">
            {['All', ...BATTERY_TYPES].map(type => (
              <button
                key={type}
                type="button"
                onClick={() => setSelectedType(type)}
                className={`px-3 py-1.5 rounded text-xs font-bold whitespace-nowrap border transition-colors ${
                  selectedType === type
                    ? 'bg-accent-700 text-white border-accent-700'
                    : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
                }`}
              >
                {type}
              </button>
            ))}
          </div>

          {/* Search Model */}
          <div className="relative my-2">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              value={modelSearch}
              onChange={(e) => setModelSearch(e.target.value)}
              placeholder="Search battery by brand or model (e.g. Exide Epiq, Amaron Flo, 150Ah)..."
              className="w-full h-10 pl-9 pr-3 border border-slate-300 rounded text-xs font-semibold focus:border-accent-700 focus:outline-none"
            />
          </div>

          {/* Model Dropdown / List */}
          <div className="max-h-48 overflow-y-auto border border-slate-300 rounded divide-y divide-slate-200 bg-slate-50">
            {filteredBatteries.length === 0 ? (
              <div className="p-3 text-center text-xs text-slate-500 font-medium">
                No matching battery models found in catalog.
              </div>
            ) : (
              filteredBatteries.map((b) => {
                const isSelected = selectedBattery?.id === b.id;
                const isOutOfStock = b.current_stock <= 0;
                const isLowStock = b.current_stock > 0 && b.current_stock <= b.low_stock_alert;

                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => handleSelectBattery(b)}
                    className={`w-full text-left p-2.5 transition-colors flex items-center justify-between ${
                      isSelected
                        ? 'bg-blue-100 border-l-4 border-accent-700 text-slate-900 font-bold'
                        : 'bg-white hover:bg-blue-50/50 text-slate-800'
                    }`}
                  >
                    <div>
                      <div className="flex items-center space-x-1.5">
                        <span className="font-bold text-sm text-slate-900">{b.brand} {b.model_name}</span>
                        <span className="text-[10px] px-1.5 py-0.2 bg-slate-200 text-slate-700 rounded font-semibold">
                          {b.type} • {b.capacity_ah}Ah
                        </span>
                      </div>
                      <div className="text-xs text-slate-600 mt-0.5">
                        Warranty: <strong>{b.warranty_months}m</strong> | Old Exch Discount: <strong>{formatCurrency(b.exchange_discount)}</strong>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-black text-slate-900">
                        {formatCurrency(b.selling_price)}
                      </div>
                      <div className="text-[11px] font-bold">
                        {isOutOfStock ? (
                          <span className="text-red-600 bg-red-50 px-1 rounded">Out of Stock (0)</span>
                        ) : isLowStock ? (
                          <span className="text-amber-700 bg-amber-50 px-1 rounded">Low ({b.current_stock})</span>
                        ) : (
                          <span className="text-emerald-700">Stock: {b.current_stock}</span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Selected Battery Preview & Editable Fields */}
          {selectedBattery && (
            <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="text-xs font-bold text-blue-900 mb-2">
                Selected: {selectedBattery.brand} {selectedBattery.model_name} ({selectedBattery.capacity_ah}Ah - {selectedBattery.type})
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {/* Quantity */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    {t.quantity}
                  </label>
                  <div className="flex items-center">
                    <button
                      type="button"
                      onClick={() => setQuantity(Math.max(1, numQty - 1))}
                      className="w-9 h-9 bg-slate-200 hover:bg-slate-300 font-black rounded-l border border-slate-300 text-slate-800 flex items-center justify-center text-base"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min={1}
                      value={quantity}
                      onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 1)}
                      className="w-12 h-9 border-y border-slate-300 text-center font-bold text-sm bg-white focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setQuantity(numQty + 1)}
                      className="w-9 h-9 bg-slate-200 hover:bg-slate-300 font-black rounded-r border border-slate-300 text-slate-800 flex items-center justify-center text-base"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Editable Unit Price */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    {t.unit_price} <span className="text-blue-700">(Editable)</span>
                  </label>
                  <input
                    type="number"
                    value={unitPrice}
                    onChange={(e) => setUnitPrice(e.target.value)}
                    className="w-full h-9 px-2 border-2 border-blue-300 rounded text-sm font-bold text-slate-900 focus:border-accent-700 focus:outline-none bg-white"
                  />
                </div>

                {/* Warranty Months */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    {t.warranty}
                  </label>
                  <input
                    type="number"
                    value={warrantyMonths}
                    onChange={(e) => setWarrantyMonths(e.target.value)}
                    className="w-full h-9 px-2 border border-slate-300 rounded text-sm font-bold text-slate-900 focus:border-accent-700 focus:outline-none bg-white"
                  />
                </div>

                {/* Battery Serial Number */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    {t.serial_number}
                  </label>
                  <input
                    type="text"
                    value={serialNumber}
                    onChange={(e) => setSerialNumber(e.target.value)}
                    placeholder="e.g. EX-88910"
                    className="w-full h-9 px-2 border border-slate-300 rounded text-sm font-bold text-slate-900 focus:border-accent-700 focus:outline-none bg-white uppercase"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* SECTION 3: OLD BATTERY EXCHANGE & DISCOUNTS */}
        <div className="bg-white border-2 border-slate-300 rounded-lg p-3 sm:p-4 shadow-sm">
          <span className="block text-xs font-black text-slate-600 uppercase tracking-wider mb-2">
            3. Old Battery Exchange & Extra Discount
          </span>

          {/* Old Battery Toggle */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-lg mb-3">
            <div>
              <span className="text-sm font-bold text-slate-900 block">
                {t.old_battery_returned}
              </span>
              <span className="text-xs text-slate-500">
                Customer returned scrap battery for exchange discount
              </span>
            </div>

            <div className="flex items-center space-x-2 mt-2 sm:mt-0">
              <button
                type="button"
                onClick={() => handleOldBatteryToggle(false)}
                className={`px-4 py-2 rounded text-xs font-bold border transition-colors ${
                  !oldBatteryReturned
                    ? 'bg-slate-800 text-white border-slate-800 shadow-sm'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                }`}
              >
                {t.no}
              </button>
              <button
                type="button"
                onClick={() => handleOldBatteryToggle(true)}
                className={`px-4 py-2 rounded text-xs font-bold border transition-colors ${
                  oldBatteryReturned
                    ? 'bg-emerald-700 text-white border-emerald-700 shadow-sm'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                }`}
              >
                {t.yes}
              </button>
            </div>
          </div>

          {/* If Old Battery is Returned */}
          {oldBatteryReturned && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-emerald-50/50 border border-emerald-200 rounded-lg mb-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-800 mb-1">
                  Exchange Discount (₹) <span className="text-emerald-800">(Editable)</span>
                </label>
                <input
                  type="number"
                  value={exchangeDiscount}
                  onChange={(e) => setExchangeDiscount(e.target.value)}
                  className="w-full h-10 px-2.5 border-2 border-emerald-400 rounded text-sm font-bold text-emerald-900 focus:border-emerald-600 focus:outline-none bg-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-800 mb-1">
                  Old Battery Brand / Model
                </label>
                <input
                  type="text"
                  value={oldBatteryBrand}
                  onChange={(e) => setOldBatteryBrand(e.target.value)}
                  placeholder="e.g. Old Exide 35Ah"
                  className="w-full h-10 px-2.5 border border-slate-300 rounded text-sm font-medium focus:border-accent-700 focus:outline-none bg-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-800 mb-1">
                  Condition / Remarks
                </label>
                <select
                  value={oldBatteryCondition}
                  onChange={(e) => setOldBatteryCondition(e.target.value)}
                  className="w-full h-10 px-2.5 border border-slate-300 rounded text-sm font-medium focus:border-accent-700 focus:outline-none bg-white"
                >
                  <option value="Scrap / Used">Scrap / Used</option>
                  <option value="Dead / Damaged">Dead / Damaged Plate</option>
                  <option value="Physical Body Crack">Physical Body Crack</option>
                  <option value="Partial Life">Partial Life</option>
                </select>
              </div>
            </div>
          )}

          {/* Extra Manual Discount */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">
                {t.manual_discount}
              </label>
              <input
                type="number"
                value={manualDiscount}
                onChange={(e) => setManualDiscount(e.target.value)}
                placeholder="0"
                className="w-full h-10 px-3 border border-slate-300 rounded text-sm font-bold text-slate-900 focus:border-accent-700 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">
                {t.notes}
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Vehicle MH-12-AB-1234 Swift Dzire"
                className="w-full h-10 px-3 border border-slate-300 rounded text-sm font-medium focus:border-accent-700 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* SECTION 4: PAYMENT MODE & CREDIT SPLIT */}
        <div className="bg-white border-2 border-slate-300 rounded-lg p-3 sm:p-4 shadow-sm">
          <span className="block text-xs font-black text-slate-600 uppercase tracking-wider mb-2">
            4. Payment Mode
          </span>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
            {['UPI', 'Cash', 'Card', 'Credit'].map(mode => {
              const isSelected = paymentMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setPaymentMode(mode)}
                  className={`h-12 rounded-lg font-bold text-sm border-2 transition-all flex items-center justify-center ${
                    isSelected
                      ? mode === 'Credit'
                        ? 'bg-amber-100 text-amber-900 border-amber-600 shadow-sm'
                        : 'bg-accent-700 text-white border-accent-700 shadow-sm'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {mode === 'Credit' ? t.credit : mode}
                </button>
              );
            })}
          </div>

          {/* If Credit (Pay Later): Amount Paid Now and Balance Due */}
          {paymentMode === 'Credit' && (
            <div className="p-3 bg-amber-50 border-2 border-amber-300 rounded-lg grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-black text-amber-900 mb-1">
                  {t.paid_now}
                </label>
                <input
                  type="number"
                  value={amountPaidNow}
                  onChange={(e) => setAmountPaidNow(e.target.value)}
                  placeholder="0"
                  className="w-full h-11 px-3 border-2 border-amber-400 rounded text-base font-bold text-amber-950 focus:border-amber-600 focus:outline-none bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-amber-900 mb-1">
                  {t.balance_due}
                </label>
                <div className="h-11 px-3 bg-white border-2 border-red-300 rounded flex items-center text-lg font-black text-red-600">
                  {formatCurrency(balanceDue)}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* LIVE BOTTOM CALCULATION BAR & LARGE ACTION BUTTONS */}
      <div className="fixed bottom-16 md:bottom-0 left-0 right-0 bg-white border-t-2 border-slate-300 shadow-2xl p-3 z-30">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Live Calculations Summary */}
          <div className="flex items-center space-x-4">
            <div>
              <div className="text-[11px] font-bold text-slate-500 uppercase">
                Subtotal: {formatCurrency(subtotal)}
                {numExDiscount > 0 && ` | Exch: -${formatCurrency(numExDiscount)}`}
                {numManDiscount > 0 && ` | Disc: -${formatCurrency(numManDiscount)}`}
              </div>
              <div className="flex items-baseline space-x-2">
                <span className="text-xs font-bold text-slate-700">{t.grand_total}:</span>
                <span className="text-2xl sm:text-3xl font-black text-accent-700 tracking-tight">
                  {formatCurrency(grandTotal)}
                </span>
                {paymentMode === 'Credit' && (
                  <span className="text-xs font-bold text-red-600">
                    (Due: {formatCurrency(balanceDue)})
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Large Action Buttons with Double-Tap Prevention */}
          <div className="flex space-x-2">
            <button
              type="button"
              disabled={isSubmitting || !selectedBattery}
              onClick={() => handleSaveBill(false)}
              className="flex-1 sm:flex-initial h-13 px-4 py-2.5 rounded-lg font-bold text-sm bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-800 border-2 border-slate-300 flex items-center justify-center space-x-1.5 transition-colors disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{t.save_only}</span>
            </button>

            <button
              type="button"
              disabled={isSubmitting || !selectedBattery}
              onClick={() => handleSaveBill(true)}
              className="flex-2 sm:flex-initial h-13 px-6 py-2.5 rounded-lg font-black text-base bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-md flex items-center justify-center space-x-2 transition-all disabled:opacity-50"
            >
              <Send className="w-5 h-5" />
              <span>{isSubmitting ? 'Saving...' : t.save_and_send}</span>
            </button>
          </div>
        </div>
      </div>

      {/* STOCK OVERRIDE CONFIRMATION MODAL (If 0 stock) */}
      {stockOverridePrompt && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-5 border-2 border-amber-400 shadow-2xl">
            <div className="flex items-center space-x-3 text-amber-700 mb-3">
              <AlertCircle className="w-7 h-7 flex-shrink-0" />
              <h3 className="text-lg font-black text-slate-900">Zero Stock Warning</h3>
            </div>
            <p className="text-sm font-semibold text-slate-700 mb-4">
              {stockOverridePrompt.warning}
            </p>
            <p className="text-xs text-slate-500 mb-5">
              As an Owner or Manager, you can override and bill this item. Current stock will become negative until new stock is added.
            </p>
            <div className="flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setStockOverridePrompt(null)}
                className="px-4 py-2 rounded text-xs font-bold bg-slate-100 text-slate-700 border border-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const send = stockOverridePrompt.sendMessage;
                  setStockOverridePrompt(null);
                  handleSaveBill(send, true);
                }}
                className="px-4 py-2 rounded text-xs font-black bg-amber-600 hover:bg-amber-700 text-white shadow"
              >
                Override & Proceed
              </button>
            </div>
          </div>
        </div>
      )}

      {/* POST-SAVE CONFIRMATION & WHATSAPP MODAL */}
      {saveSuccessModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-5 sm:p-6 border-2 border-emerald-500 shadow-2xl">
            <div className="text-center mb-4">
              <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto mb-2">
                <CheckCircle className="w-7 h-7" />
              </div>
              <h3 className="text-xl font-black text-slate-900">
                Bill Saved Successfully!
              </h3>
              <p className="text-sm font-bold text-slate-600">
                Bill No: <span className="text-accent-700 text-base">{saveSuccessModal.bill.bill_no}</span>
              </p>
            </div>

            {/* Bill Summary Strip */}
            <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 text-xs space-y-1.5 mb-4">
              <div className="flex justify-between">
                <span className="text-slate-500">Customer:</span>
                <span className="font-bold text-slate-900">{saveSuccessModal.bill.customer_name} ({saveSuccessModal.bill.customer_mobile})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Item:</span>
                <span className="font-bold text-slate-900">{saveSuccessModal.bill.battery_brand} {saveSuccessModal.bill.battery_model} x{saveSuccessModal.bill.quantity}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Amount Paid:</span>
                <span className="font-black text-emerald-700">{formatCurrency(saveSuccessModal.bill.amount_paid)} ({saveSuccessModal.bill.payment_mode})</span>
              </div>
              {saveSuccessModal.bill.balance_due > 0 && (
                <div className="flex justify-between text-red-600 font-bold">
                  <span>Balance Due:</span>
                  <span>{formatCurrency(saveSuccessModal.bill.balance_due)}</span>
                </div>
              )}
            </div>

            {/* Delivery Status */}
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs mb-5">
              <div className="flex items-center justify-between font-bold text-slate-800 mb-1">
                <span>WhatsApp Delivery:</span>
                {saveSuccessModal.messaging?.customerStatus === 'sent' ? (
                  <span className="text-emerald-700 font-black">✓ Sent Automatically</span>
                ) : (
                  <span className="text-blue-800 font-black">Pre-filled Link Ready</span>
                )}
              </div>
              <p className="text-slate-600">
                {saveSuccessModal.messaging?.customerStatus === 'sent'
                  ? 'Message has been dispatched to customer WhatsApp / SMS.'
                  : 'Tap the green button below to open WhatsApp with invoice summary directly on this phone.'}
              </p>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2">
              {/* wa.me direct button */}
              {saveSuccessModal.messaging?.waMeUrl && (
                <a
                  href={saveSuccessModal.messaging.waMeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-lg text-sm flex items-center justify-center space-x-2 shadow-sm transition-colors"
                >
                  <MessageCircle className="w-5 h-5" />
                  <span>Open in WhatsApp (wa.me)</span>
                  <ExternalLink className="w-4 h-4 ml-1" />
                </a>
              )}

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    if (onOpenBillDetail) onOpenBillDetail(saveSuccessModal.bill.id);
                  }}
                  className="h-11 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-lg text-xs border border-slate-300 flex items-center justify-center space-x-1.5"
                >
                  <Printer className="w-4 h-4" />
                  <span>View / Print Bill</span>
                </button>

                <button
                  type="button"
                  onClick={handleResetForm}
                  className="h-11 bg-accent-700 hover:bg-accent-800 text-white font-black rounded-lg text-xs flex items-center justify-center space-x-1.5 shadow-sm"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Start Next Bill</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

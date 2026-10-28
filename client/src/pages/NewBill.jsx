import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { formatCurrency, cleanMobile } from '../utils/formatters';
import UPIPaymentQR from '../components/UPIPaymentQR';
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
  Plus,
  Trash2,
  QrCode,
  ShoppingCart
} from 'lucide-react';

const BATTERY_TYPES = ['Car', 'Bike', 'Inverter', 'Tractor', 'Truck', 'E-rickshaw'];

const emptyDraft = {
  battery: null,
  quantity: 1,
  unit_price: '',
  warranty_months: 36,
  serial_number: '',
  exchange_discount: ''
};

export default function NewBill({ onOpenBillDetail }) {
  const { t } = useAuth();

  const [batteries, setBatteries] = useState([]);
  const [settings, setSettings] = useState({});
  const [selectedType, setSelectedType] = useState('All');
  const [modelSearch, setModelSearch] = useState('');
  const [loadingCatalog, setLoadingCatalog] = useState(true);

  const [customerMobile, setCustomerMobile] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [villageName, setVillageName] = useState('');
  const [repeatCustomer, setRepeatCustomer] = useState(null);

  const [draft, setDraft] = useState(emptyDraft);
  const [cartItems, setCartItems] = useState([]);

  const [oldBatteryReturned, setOldBatteryReturned] = useState(false);
  const [oldBatteryBrand, setOldBatteryBrand] = useState('');
  const [oldBatteryCondition, setOldBatteryCondition] = useState('Scrap / Used');
  const [manualDiscount, setManualDiscount] = useState('');
  const [paymentMode, setPaymentMode] = useState('UPI');
  const [amountPaidNow, setAmountPaidNow] = useState('');
  const [notes, setNotes] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [stockOverridePrompt, setStockOverridePrompt] = useState(null);
  const [saveSuccessModal, setSaveSuccessModal] = useState(null);
  const [showUpiQr, setShowUpiQr] = useState(false);

  useEffect(() => {
    loadBatteries();
    api.getSettings()
      .then(res => setSettings(res.settings || {}))
      .catch(() => {});
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

  const handleMobileChange = async (val) => {
    const raw = cleanMobile(val);
    setCustomerMobile(raw);

    if (raw.length === 10) {
      try {
        const res = await api.lookupCustomer(raw);
        if (res.found && res.customer) {
          setCustomerName(res.customer.name || '');
          setVillageName(res.customer.village || '');
          setVehicleNumber(res.customer.last_vehicle_number || '');
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

  const handleSelectBattery = (battery) => {
    setDraft({
      battery,
      quantity: 1,
      unit_price: battery.selling_price,
      warranty_months: battery.warranty_months,
      serial_number: '',
      exchange_discount: oldBatteryReturned ? (battery.exchange_discount || 0) : ''
    });
  };

  const handleAddItem = () => {
    if (!draft.battery) return;
    const qty = Math.max(1, parseInt(draft.quantity, 10) || 1);
    const price = Math.max(0, parseFloat(draft.unit_price) || 0);
    const exchange = oldBatteryReturned ? Math.max(0, parseFloat(draft.exchange_discount) || 0) : 0;

    setCartItems(prev => [
      ...prev,
      {
        key: `${draft.battery.id}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        battery: draft.battery,
        battery_id: draft.battery.id,
        brand: draft.battery.brand,
        model_name: draft.battery.model_name,
        type: draft.battery.type,
        capacity_ah: draft.battery.capacity_ah,
        quantity: qty,
        unit_price: price,
        exchange_discount: exchange,
        warranty_months: parseInt(draft.warranty_months, 10) || draft.battery.warranty_months,
        serial_number: draft.serial_number.trim().toUpperCase()
      }
    ]);

    setDraft({ ...emptyDraft, battery: draft.battery, unit_price: draft.battery.selling_price, warranty_months: draft.battery.warranty_months });
  };

  const updateItem = (key, field, value) => {
    setCartItems(prev => prev.map(item => {
      if (item.key !== key) return item;
      if (field === 'quantity') return { ...item, quantity: Math.max(1, parseInt(value, 10) || 1) };
      if (field === 'unit_price') return { ...item, unit_price: value };
      if (field === 'exchange_discount') return { ...item, exchange_discount: value };
      if (field === 'warranty_months') return { ...item, warranty_months: value };
      if (field === 'serial_number') return { ...item, serial_number: String(value).toUpperCase() };
      return { ...item, [field]: value };
    }));
  };

  const removeItem = (key) => setCartItems(prev => prev.filter(i => i.key !== key));

  const handleOldBatteryToggle = (returned) => {
    setOldBatteryReturned(returned);
    if (returned) {
      setCartItems(prev => prev.map(i => ({
        ...i,
        exchange_discount: i.exchange_discount !== '' && parseFloat(i.exchange_discount) > 0
          ? i.exchange_discount
          : (i.battery.exchange_discount || 0)
      })));
      if (draft.battery) {
        setDraft(d => ({ ...d, exchange_discount: d.battery?.exchange_discount || 0 }));
      }
    } else {
      setCartItems(prev => prev.map(i => ({ ...i, exchange_discount: 0 })));
      setOldBatteryBrand('');
      setDraft(d => ({ ...d, exchange_discount: '' }));
    }
  };

  const subtotal = useMemo(
    () => cartItems.reduce((sum, i) => sum + (Math.max(0, parseFloat(i.unit_price) || 0) * (parseInt(i.quantity, 10) || 1)), 0),
    [cartItems]
  );
  const exDiscount = useMemo(
    () => oldBatteryReturned
      ? cartItems.reduce((sum, i) => sum + Math.max(0, parseFloat(i.exchange_discount) || 0), 0)
      : 0,
    [cartItems, oldBatteryReturned]
  );
  const manDiscount = Math.max(0, parseFloat(manualDiscount) || 0);
  const grandTotal = Math.max(0, subtotal - exDiscount - manDiscount);

  const paidNow = amountPaidNow !== '' && !isNaN(parseFloat(amountPaidNow))
    ? Math.min(Math.max(0, parseFloat(amountPaidNow)), grandTotal)
    : (paymentMode === 'Credit' ? 0 : grandTotal);
  const balanceDue = Math.max(0, grandTotal - paidNow);
  const totalQty = cartItems.reduce((sum, i) => sum + (parseInt(i.quantity, 10) || 1), 0);

  const filteredBatteries = batteries.filter(b => {
    const matchesType = selectedType === 'All' || b.type === selectedType;
    const search = modelSearch.toLowerCase();
    const matchesSearch = !modelSearch ||
      b.brand.toLowerCase().includes(search) ||
      b.model_name.toLowerCase().includes(search);
    return matchesType && matchesSearch;
  });

  const handleSaveBill = async (sendMessage = true, allowOverride = false) => {
    if (isSubmitting) return;

    if (!customerName.trim()) {
      setErrorMessage('Please enter Customer Name');
      return;
    }
    if (!customerMobile || customerMobile.length !== 10) {
      setErrorMessage('Please enter a valid 10-digit mobile number');
      return;
    }
    if (cartItems.length === 0) {
      setErrorMessage('Please add at least one battery to the bill');
      return;
    }

    setErrorMessage('');
    setIsSubmitting(true);

    const payload = {
      customer_name: customerName.trim(),
      customer_mobile: customerMobile,
      vehicle_number: vehicleNumber.trim(),
      village_name: villageName.trim(),
      items: cartItems.map(i => ({
        battery_id: i.battery_id,
        quantity: parseInt(i.quantity, 10) || 1,
        unit_price: parseFloat(i.unit_price) || 0,
        exchange_discount: oldBatteryReturned ? (parseFloat(i.exchange_discount) || 0) : 0,
        warranty_months: parseInt(i.warranty_months, 10) || 12,
        serial_number: i.serial_number ? i.serial_number.trim() : ''
      })),
      old_battery_returned: oldBatteryReturned,
      old_battery_type: cartItems[0]?.type,
      old_battery_brand: oldBatteryBrand || 'Old Return',
      old_battery_condition: oldBatteryCondition,
      manual_discount: manDiscount,
      payment_mode: paymentMode,
      amount_paid: paidNow,
      notes: notes.trim(),
      allow_zero_stock_override: allowOverride,
      send_message: sendMessage
    };

    try {
      const res = await api.createBill(payload);
      setSaveSuccessModal(res);
      setShowUpiQr(false);
      loadBatteries();
    } catch (err) {
      if (err.data && err.data.requiresOverride) {
        setStockOverridePrompt({ warning: err.data.warning, sendMessage });
      } else {
        setErrorMessage(err.message || 'Failed to save bill');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetForm = () => {
    setCustomerMobile('');
    setCustomerName('');
    setVehicleNumber('');
    setVillageName('');
    setRepeatCustomer(null);
    setDraft(emptyDraft);
    setCartItems([]);
    setOldBatteryReturned(false);
    setOldBatteryBrand('');
    setManualDiscount('');
    setPaymentMode('UPI');
    setAmountPaidNow('');
    setNotes('');
    setSaveSuccessModal(null);
    setErrorMessage('');
    setShowUpiQr(false);
  };

  const upiId = settings.upi_id;
  const payeeName = settings.upi_payee_name || settings.shop_name || 'Maharashtra Auto Battery';
  const qrCollectAmount = balanceDue > 0 ? balanceDue : paidNow;

  return (
    <div className="max-w-5xl mx-auto px-3 py-3 sm:py-6 pb-40 md:pb-32">
      <div className="flex items-center justify-between mb-3 border-b-2 border-slate-200 pb-2">
        <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center space-x-2">
          <span>{t.new_bill}</span>
          <span className="text-xs bg-accent-700 text-white font-bold px-2 py-0.5 rounded">Counter POS</span>
        </h2>
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
        {/* 1. CUSTOMER */}
        <div className="bg-white border-2 border-slate-300 rounded-lg p-3 sm:p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-black text-slate-600 uppercase tracking-wider">1. Customer & Vehicle Details</span>
            {repeatCustomer && (
              <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                <UserCheck className="w-3.5 h-3.5" />
                <span>Repeat</span>
                {repeatCustomer.pending_balance > 0 && (
                  <span className="ml-1 text-red-700 font-black">(Due: {formatCurrency(repeatCustomer.pending_balance)})</span>
                )}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">
                {t.mobile_number} <span className="text-red-600">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-sm font-bold text-slate-500 select-none">+91</span>
                <input
                  type="tel"
                  maxLength={10}
                  value={customerMobile}
                  onChange={(e) => handleMobileChange(e.target.value)}
                  placeholder="9876543210"
                  className="w-full h-11 pl-12 pr-3 border-2 border-slate-300 rounded text-base font-bold text-slate-900 focus:border-accent-700 focus:outline-none"
                />
              </div>
            </div>

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

            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">Bike / Vehicle Number</label>
              <input
                type="text"
                value={vehicleNumber}
                onChange={(e) => setVehicleNumber(e.target.value.toUpperCase())}
                placeholder="e.g. MH-12-AB-1234"
                className="w-full h-11 px-3 border-2 border-slate-300 rounded text-base font-bold text-slate-900 uppercase focus:border-accent-700 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">Village / Town Name</label>
              <input
                type="text"
                value={villageName}
                onChange={(e) => setVillageName(e.target.value)}
                placeholder="e.g. Shirur, Pune"
                className="w-full h-11 px-3 border-2 border-slate-300 rounded text-base font-bold text-slate-900 focus:border-accent-700 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* 2. BATTERY SELECTION */}
        <div className="bg-white border-2 border-slate-300 rounded-lg p-3 sm:p-4 shadow-sm">
          <span className="block text-xs font-black text-slate-600 uppercase tracking-wider mb-2">
            2. Battery Selection ({cartItems.length} item{cartItems.length === 1 ? '' : 's'} in bill)
          </span>

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

          <div className="relative my-2">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              value={modelSearch}
              onChange={(e) => setModelSearch(e.target.value)}
              placeholder="Search battery (e.g. Exide Epiq, Amaron Flo, 150Ah)..."
              className="w-full h-10 pl-9 pr-3 border border-slate-300 rounded text-xs font-semibold focus:border-accent-700 focus:outline-none"
            />
          </div>

          <div className="max-h-52 overflow-y-auto border border-slate-300 rounded divide-y divide-slate-200 bg-slate-50">
            {loadingCatalog ? (
              <div className="p-3 text-center text-xs text-slate-500 font-medium">Loading catalog...</div>
            ) : filteredBatteries.length === 0 ? (
              <div className="p-3 text-center text-xs text-slate-500 font-medium">No matching battery models found.</div>
            ) : (
              filteredBatteries.map((b) => {
                const isSelected = draft.battery?.id === b.id;
                const isOutOfStock = b.current_stock <= 0;
                const isLowStock = b.current_stock > 0 && b.current_stock <= b.low_stock_alert;

                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => handleSelectBattery(b)}
                    className={`w-full text-left p-2.5 transition-colors flex items-center justify-between ${
                      isSelected ? 'bg-blue-100 border-l-4 border-accent-700 text-slate-900 font-bold' : 'bg-white hover:bg-blue-50/50 text-slate-800'
                    }`}
                  >
                    <div>
                      <div className="flex items-center space-x-1.5 flex-wrap">
                        <span className="font-bold text-sm text-slate-900">{b.brand} {b.model_name}</span>
                        <span className="text-[10px] px-1.5 py-0.2 bg-slate-200 text-slate-700 rounded font-semibold">
                          {b.type} • {b.capacity_ah}Ah
                        </span>
                      </div>
                      <div className="text-xs text-slate-600 mt-0.5">
                        Warranty: <strong>{b.warranty_months}m</strong> | Exchange: <strong>{formatCurrency(b.exchange_discount)}</strong>
                      </div>
                    </div>
                    <div className="text-right ml-2">
                      <div className="text-sm font-black text-slate-900">{formatCurrency(b.selling_price)}</div>
                      <div className="text-[11px] font-bold">
                        {isOutOfStock ? (
                          <span className="text-red-600 bg-red-50 px-1 rounded">Out (0)</span>
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

          {draft.battery && (
            <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="text-xs font-bold text-blue-900 mb-2">
                Adding: {draft.battery.brand} {draft.battery.model_name} ({draft.battery.capacity_ah}Ah - {draft.battery.type})
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">{t.quantity}</label>
                  <div className="flex items-center">
                    <button type="button" onClick={() => setDraft(d => ({ ...d, quantity: Math.max(1, d.quantity - 1) }))} className="w-9 h-9 bg-slate-200 hover:bg-slate-300 font-black rounded-l border border-slate-300 text-slate-800">-</button>
                    <input type="number" min={1} value={draft.quantity} onChange={(e) => setDraft(d => ({ ...d, quantity: Math.max(1, parseInt(e.target.value, 10) || 1) }))} className="w-12 h-9 border-y border-slate-300 text-center font-bold text-sm bg-white focus:outline-none" />
                    <button type="button" onClick={() => setDraft(d => ({ ...d, quantity: d.quantity + 1 }))} className="w-9 h-9 bg-slate-200 hover:bg-slate-300 font-black rounded-r border border-slate-300 text-slate-800">+</button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">{t.unit_price}</label>
                  <input type="number" value={draft.unit_price} onChange={(e) => setDraft(d => ({ ...d, unit_price: e.target.value }))} className="w-full h-9 px-2 border-2 border-blue-300 rounded text-sm font-bold text-slate-900 focus:border-accent-700 focus:outline-none bg-white" />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">{t.warranty}</label>
                  <input type="number" value={draft.warranty_months} onChange={(e) => setDraft(d => ({ ...d, warranty_months: e.target.value }))} className="w-full h-9 px-2 border border-slate-300 rounded text-sm font-bold text-slate-900 focus:border-accent-700 focus:outline-none bg-white" />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">{t.serial_number}</label>
                  <input type="text" value={draft.serial_number} onChange={(e) => setDraft(d => ({ ...d, serial_number: e.target.value.toUpperCase() }))} placeholder="EX-88910" className="w-full h-9 px-2 border border-slate-300 rounded text-sm font-bold text-slate-900 uppercase focus:border-accent-700 focus:outline-none bg-white" />
                </div>

                {oldBatteryReturned && (
                  <div>
                    <label className="block text-[11px] font-bold text-emerald-800 mb-1">Exchange ₹</label>
                    <input type="number" value={draft.exchange_discount} onChange={(e) => setDraft(d => ({ ...d, exchange_discount: e.target.value }))} className="w-full h-9 px-2 border-2 border-emerald-400 rounded text-sm font-bold text-emerald-900 focus:border-emerald-600 focus:outline-none bg-white" />
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={handleAddItem}
                className="mt-3 h-10 px-4 w-full sm:w-auto rounded-lg bg-accent-700 hover:bg-accent-800 text-white font-black text-sm flex items-center justify-center space-x-2"
              >
                <Plus className="w-4 h-4" />
                <span>Add Another Battery to Bill</span>
              </button>
            </div>
          )}

          {/* CART */}
          {cartItems.length > 0 && (
            <div className="mt-4 border-2 border-slate-300 rounded-lg overflow-hidden">
              <div className="bg-slate-800 text-white px-3 py-2 flex items-center justify-between text-xs font-black uppercase tracking-wide">
                <span className="flex items-center space-x-1.5"><ShoppingCart className="w-4 h-4" /><span>Bill Items ({cartItems.length})</span></span>
                <span>{totalQty} unit{totalQty === 1 ? '' : 's'}</span>
              </div>
              <div className="divide-y divide-slate-200">
                {cartItems.map((item, idx) => (
                  <div key={item.key} className="p-2.5 bg-white">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-black text-sm text-slate-900">
                          {idx + 1}. {item.brand} {item.model_name}
                        </div>
                        <div className="text-[11px] text-slate-500 font-semibold">{item.type} • {item.capacity_ah}Ah • {item.warranty_months}m warranty</div>
                      </div>
                      <button type="button" onClick={() => removeItem(item.key)} className="text-red-500 hover:text-red-700 p-1" aria-label="Remove item">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-2">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Qty</label>
                        <input type="number" min={1} value={item.quantity} onChange={(e) => updateItem(item.key, 'quantity', e.target.value)} className="w-full h-8 px-2 border border-slate-300 rounded text-sm font-bold" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Unit Price ₹</label>
                        <input type="number" value={item.unit_price} onChange={(e) => updateItem(item.key, 'unit_price', e.target.value)} className="w-full h-8 px-2 border border-slate-300 rounded text-sm font-bold" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Serial No</label>
                        <input type="text" value={item.serial_number} onChange={(e) => updateItem(item.key, 'serial_number', e.target.value)} className="w-full h-8 px-2 border border-slate-300 rounded text-xs font-bold uppercase" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Warranty (m)</label>
                        <input type="number" value={item.warranty_months} onChange={(e) => updateItem(item.key, 'warranty_months', e.target.value)} className="w-full h-8 px-2 border border-slate-300 rounded text-sm font-bold" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Line Total</label>
                        <div className="h-8 px-2 flex items-center text-sm font-black text-slate-900">
                          {formatCurrency((parseFloat(item.unit_price) || 0) * (parseInt(item.quantity, 10) || 1))}
                        </div>
                      </div>
                    </div>

                    {oldBatteryReturned && (
                      <div className="mt-2 flex items-center space-x-2">
                        <label className="text-[10px] font-bold text-emerald-800">Exchange discount for this item (₹):</label>
                        <input type="number" value={item.exchange_discount} onChange={(e) => updateItem(item.key, 'exchange_discount', e.target.value)} className="w-28 h-8 px-2 border-2 border-emerald-400 rounded text-sm font-bold text-emerald-900" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 3. OLD BATTERY */}
        <div className="bg-white border-2 border-slate-300 rounded-lg p-3 sm:p-4 shadow-sm">
          <span className="block text-xs font-black text-slate-600 uppercase tracking-wider mb-2">3. Old Battery Exchange &amp; Discount</span>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-lg mb-3 gap-2">
            <div>
              <span className="text-sm font-bold text-slate-900 block">{t.old_battery_returned}</span>
              <span className="text-xs text-slate-500">Customer returned scrap battery for exchange discount</span>
            </div>
            <div className="flex items-center space-x-2">
              <button type="button" onClick={() => handleOldBatteryToggle(false)} className={`px-4 py-2 rounded text-xs font-bold border ${!oldBatteryReturned ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-700 border-slate-300'}`}>{t.no}</button>
              <button type="button" onClick={() => handleOldBatteryToggle(true)} className={`px-4 py-2 rounded text-xs font-bold border ${oldBatteryReturned ? 'bg-emerald-700 text-white border-emerald-700' : 'bg-white text-slate-700 border-slate-300'}`}>{t.yes}</button>
            </div>
          </div>

          {oldBatteryReturned && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-emerald-50/50 border border-emerald-200 rounded-lg mb-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-800 mb-1">Old Battery Brand / Model</label>
                <input type="text" value={oldBatteryBrand} onChange={(e) => setOldBatteryBrand(e.target.value)} placeholder="e.g. Old Exide 35Ah" className="w-full h-10 px-2.5 border border-slate-300 rounded text-sm font-medium focus:border-accent-700 focus:outline-none bg-white" />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-800 mb-1">Condition / Remarks</label>
                <select value={oldBatteryCondition} onChange={(e) => setOldBatteryCondition(e.target.value)} className="w-full h-10 px-2.5 border border-slate-300 rounded text-sm font-medium focus:border-accent-700 focus:outline-none bg-white">
                  <option value="Scrap / Used">Scrap / Used</option>
                  <option value="Dead / Damaged">Dead / Damaged Plate</option>
                  <option value="Physical Body Crack">Physical Body Crack</option>
                  <option value="Partial Life">Partial Life</option>
                </select>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">{t.manual_discount}</label>
              <input type="number" value={manualDiscount} onChange={(e) => setManualDiscount(e.target.value)} placeholder="0" className="w-full h-10 px-3 border border-slate-300 rounded text-sm font-bold text-slate-900 focus:border-accent-700 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">{t.notes}</label>
              <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any special note..." className="w-full h-10 px-3 border border-slate-300 rounded text-sm font-medium focus:border-accent-700 focus:outline-none" />
            </div>
          </div>
        </div>

        {/* 4. PAYMENT */}
        <div className="bg-white border-2 border-slate-300 rounded-lg p-3 sm:p-4 shadow-sm">
          <span className="block text-xs font-black text-slate-600 uppercase tracking-wider mb-2">4. Payment (full or part payment in any mode)</span>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
            {['UPI', 'Cash', 'Card', 'Credit'].map(mode => {
              const isSelected = paymentMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setPaymentMode(mode)}
                  className={`h-12 rounded-lg font-bold text-sm border-2 transition-all ${
                    isSelected
                      ? mode === 'Credit' ? 'bg-amber-100 text-amber-900 border-amber-600' : 'bg-accent-700 text-white border-accent-700'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {mode === 'Credit' ? t.credit : mode}
                </button>
              );
            })}
          </div>

          <div className="p-3 bg-slate-50 border-2 border-slate-300 rounded-lg grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-black text-slate-800 mb-1">{t.paid_now}</label>
              <input
                type="number"
                value={amountPaidNow}
                onChange={(e) => setAmountPaidNow(e.target.value)}
                placeholder={paymentMode === 'Credit' ? '0' : String(Math.round(grandTotal))}
                className="w-full h-11 px-3 border-2 border-slate-400 rounded text-base font-bold text-slate-950 focus:border-accent-700 focus:outline-none bg-white"
              />
              <button type="button" onClick={() => setAmountPaidNow(String(Math.round(grandTotal)))} className="text-[11px] font-bold text-accent-700 underline mt-1">
                Pay full {formatCurrency(grandTotal)}
              </button>
            </div>

            <div>
              <label className="block text-xs font-black text-slate-800 mb-1">{t.balance_due} (credit)</label>
              <div className="h-11 px-3 bg-white border-2 border-red-300 rounded flex items-center text-lg font-black text-red-600">
                {formatCurrency(balanceDue)}
              </div>
            </div>

            <div className="flex items-end">
              <button
                type="button"
                onClick={() => setShowUpiQr(v => !v)}
                disabled={!upiId || qrCollectAmount <= 0}
                className="w-full h-11 rounded-lg font-bold text-sm bg-white border-2 border-accent-700 text-accent-800 flex items-center justify-center space-x-2 disabled:opacity-40"
              >
                <QrCode className="w-4 h-4" />
                <span>{showUpiQr ? 'Hide UPI QR' : 'Show UPI QR'}</span>
              </button>
            </div>
          </div>

          {showUpiQr && (
            <div className="mt-3 p-3 border-2 border-dashed border-accent-400 rounded-lg bg-white">
              <UPIPaymentQR
                amount={qrCollectAmount}
                note={cartItems.map(i => `${i.brand} ${i.model_name}`).join(', ').slice(0, 60) || 'Battery Purchase'}
                upiId={upiId}
                payeeName={payeeName}
                size={200}
              />
            </div>
          )}
        </div>
      </div>

      {/* STICKY BOTTOM BAR */}
      <div className="fixed bottom-[4.25rem] md:bottom-0 left-0 right-0 bg-white border-t-2 border-slate-300 shadow-2xl p-3 z-30">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="text-[11px] font-bold text-slate-500 uppercase">
              {totalQty} unit{totalQty === 1 ? '' : 's'} | Subtotal: {formatCurrency(subtotal)}
              {exDiscount > 0 && ` | Exch: -${formatCurrency(exDiscount)}`}
              {manDiscount > 0 && ` | Disc: -${formatCurrency(manDiscount)}`}
            </div>
            <div className="flex items-baseline space-x-2 flex-wrap">
              <span className="text-xs font-bold text-slate-700">{t.grand_total}:</span>
              <span className="text-2xl sm:text-3xl font-black text-accent-700 tracking-tight">{formatCurrency(grandTotal)}</span>
              {balanceDue > 0 && (
                <span className="text-xs font-bold text-red-600">(Due: {formatCurrency(balanceDue)})</span>
              )}
            </div>
          </div>

          <div className="flex space-x-2">
            <button
              type="button"
              disabled={isSubmitting || cartItems.length === 0}
              onClick={() => handleSaveBill(false)}
              className="flex-1 sm:flex-initial h-12 px-4 rounded-lg font-bold text-sm bg-slate-100 hover:bg-slate-200 text-slate-800 border-2 border-slate-300 flex items-center justify-center space-x-1.5 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{t.save_only}</span>
            </button>
            <button
              type="button"
              disabled={isSubmitting || cartItems.length === 0}
              onClick={() => handleSaveBill(true)}
              className="flex-1 sm:flex-initial h-12 px-5 rounded-lg font-black text-base bg-emerald-600 hover:bg-emerald-700 text-white shadow-md flex items-center justify-center space-x-2 disabled:opacity-50"
            >
              <Send className="w-5 h-5" />
              <span>{isSubmitting ? 'Saving...' : t.save_and_send}</span>
            </button>
          </div>
        </div>
      </div>

      {/* STOCK OVERRIDE MODAL */}
      {stockOverridePrompt && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-5 border-2 border-amber-400 shadow-2xl">
            <div className="flex items-center space-x-3 text-amber-700 mb-3">
              <AlertCircle className="w-7 h-7 flex-shrink-0" />
              <h3 className="text-lg font-black text-slate-900">Zero Stock Warning</h3>
            </div>
            <p className="text-sm font-semibold text-slate-700 mb-4">{stockOverridePrompt.warning}</p>
            <p className="text-xs text-slate-500 mb-5">
              As Owner / Manager you can override and bill this item. Stock will become negative until new stock is added.
            </p>
            <div className="flex justify-end space-x-2">
              <button type="button" onClick={() => setStockOverridePrompt(null)} className="px-4 py-2 rounded text-xs font-bold bg-slate-100 text-slate-700 border border-slate-300">Cancel</button>
              <button
                type="button"
                onClick={() => {
                  const send = stockOverridePrompt.sendMessage;
                  setStockOverridePrompt(null);
                  handleSaveBill(send, true);
                }}
                className="px-4 py-2 rounded text-xs font-black bg-amber-600 hover:bg-amber-700 text-white shadow"
              >
                Override &amp; Proceed
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUCCESS MODAL */}
      {saveSuccessModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl max-w-lg w-full p-5 sm:p-6 border-2 border-emerald-500 shadow-2xl my-6">
            <div className="text-center mb-4">
              <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto mb-2">
                <CheckCircle className="w-7 h-7" />
              </div>
              <h3 className="text-xl font-black text-slate-900">Bill Saved Successfully!</h3>
              <p className="text-sm font-bold text-slate-600">
                Bill No: <span className="text-accent-700 text-base">{saveSuccessModal.bill.bill_no}</span>
              </p>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 text-xs space-y-1.5 mb-4">
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Customer:</span>
                <span className="font-bold text-slate-900 text-right">{saveSuccessModal.bill.customer_name} ({saveSuccessModal.bill.customer_mobile})</span>
              </div>
              {saveSuccessModal.bill.vehicle_number && (
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Vehicle:</span>
                  <span className="font-bold text-slate-900">{saveSuccessModal.bill.vehicle_number}</span>
                </div>
              )}
              {saveSuccessModal.bill.village_name && (
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Village:</span>
                  <span className="font-bold text-slate-900">{saveSuccessModal.bill.village_name}</span>
                </div>
              )}
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Items:</span>
                <span className="font-bold text-slate-900 text-right">
                  {(saveSuccessModal.bill.items || []).map(i => `${i.brand} ${i.model_name} x${i.quantity}`).join(', ')}
                </span>
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

            {saveSuccessModal.bill.balance_due > 0 && upiId && (
              <div className="p-3 border-2 border-dashed border-accent-400 rounded-lg mb-4">
                <UPIPaymentQR
                  amount={saveSuccessModal.bill.balance_due}
                  note={`Balance for bill ${saveSuccessModal.bill.bill_no}`}
                  upiId={upiId}
                  payeeName={payeeName}
                  size={180}
                />
              </div>
            )}

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
                  : 'Tap the green button below to open WhatsApp with the invoice summary.'}
              </p>
            </div>

            <div className="space-y-2">
              {saveSuccessModal.messaging?.waMeUrl && (
                <a
                  href={saveSuccessModal.messaging.waMeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-lg text-sm flex items-center justify-center space-x-2 shadow-sm"
                >
                  <MessageCircle className="w-5 h-5" />
                  <span>Open in WhatsApp (wa.me)</span>
                  <ExternalLink className="w-4 h-4 ml-1" />
                </a>
              )}

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => { if (onOpenBillDetail) onOpenBillDetail(saveSuccessModal.bill.id); }}
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

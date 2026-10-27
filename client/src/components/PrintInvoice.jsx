import React, { useRef } from 'react';
import { formatCurrency, formatDate, formatDateTime } from '../utils/formatters';
import { Printer, Download, X } from 'lucide-react';

export default function PrintInvoice({ bill, shopSettings, onClose }) {
  const printAreaRef = useRef(null);

  const handlePrint = () => {
    window.print();
  };

  if (!bill) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-xl max-w-2xl w-full p-4 sm:p-6 shadow-2xl my-auto print:p-0 print:m-0 print:w-full print:max-w-none print:shadow-none">
        {/* Header Controls (Hidden on Print) */}
        <div className="flex items-center justify-between border-b pb-3 mb-4 print:hidden">
          <div className="flex items-center space-x-2">
            <span className="font-bold text-slate-900 text-sm">Invoice Preview: {bill.bill_no}</span>
          </div>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-2 bg-accent-700 hover:bg-accent-800 text-white font-bold rounded-lg text-xs flex items-center space-x-1.5 shadow-sm"
            >
              <Printer className="w-4 h-4" />
              <span>Print Invoice / Thermal</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* PRINTABLE AREA */}
        <div ref={printAreaRef} className="print:m-0 print:p-4 bg-white text-slate-900 text-xs sm:text-sm font-sans border border-slate-300 p-4 sm:p-6 rounded">
          {/* Shop Header */}
          <div className="text-center border-b-2 border-slate-900 pb-3 mb-3">
            <h1 className="text-xl sm:text-2xl font-black uppercase tracking-tight text-slate-900">
              {shopSettings?.shop_name || 'Maharashtra Auto Battery'}
            </h1>
            <p className="text-xs font-semibold text-slate-700 mt-0.5">
              {shopSettings?.tagline || 'All Types of Auto & Inverter Batteries | Sales & Service'}
            </p>
            <p className="text-xs text-slate-600 mt-0.5">
              {shopSettings?.address}
            </p>
            <div className="text-xs font-bold text-slate-800 mt-1 flex flex-wrap justify-center gap-x-4">
              <span>Mob: {shopSettings?.phone || '9822012345'}</span>
              {shopSettings?.alt_phone && <span>Alt: {shopSettings.alt_phone}</span>}
              {shopSettings?.gst_number && <span>GSTIN: {shopSettings.gst_number}</span>}
            </div>
          </div>

          {/* Tax Invoice Banner & Bill Metadata */}
          <div className="grid grid-cols-2 gap-2 border-b border-slate-300 pb-2 mb-3 text-xs">
            <div>
              <p><span className="text-slate-500">Bill No:</span> <strong className="text-sm font-black text-slate-900">{bill.bill_no}</strong></p>
              <p><span className="text-slate-500">Date & Time:</span> <strong>{formatDateTime(bill.created_at)}</strong></p>
              <p><span className="text-slate-500">Billed By:</span> <strong>{bill.created_by_name}</strong></p>
            </div>
            <div className="text-right">
              <p className="text-slate-500">Customer Details:</p>
              <p className="text-sm font-black text-slate-900">{bill.customer_name}</p>
              <p className="font-bold text-slate-800">+91 {bill.customer_mobile}</p>
            </div>
          </div>

          {/* Line Item Table */}
          <table className="w-full text-left border-collapse mb-3">
            <thead>
              <tr className="border-y-2 border-slate-800 text-[11px] font-black uppercase text-slate-700 bg-slate-50">
                <th className="py-1.5 px-1">Item Description</th>
                <th className="py-1.5 px-1 text-center">Type/Ah</th>
                <th className="py-1.5 px-1 text-center">Qty</th>
                <th className="py-1.5 px-1 text-right">Rate</th>
                <th className="py-1.5 px-1 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              <tr>
                <td className="py-2 px-1">
                  <div className="font-bold text-slate-900 text-sm">
                    {bill.battery_brand} {bill.battery_model}
                  </div>
                  <div className="text-[11px] text-slate-600">
                    Serial No: <strong className="font-mono text-slate-900">{bill.serial_number || 'N/A'}</strong> | Warranty: <strong>{bill.warranty_months} Months</strong>
                  </div>
                </td>
                <td className="py-2 px-1 text-center font-medium">
                  {bill.battery_type} / {bill.battery_capacity}Ah
                </td>
                <td className="py-2 px-1 text-center font-bold">
                  {bill.quantity}
                </td>
                <td className="py-2 px-1 text-right font-medium">
                  {formatCurrency(bill.unit_price)}
                </td>
                <td className="py-2 px-1 text-right font-bold">
                  {formatCurrency(bill.subtotal)}
                </td>
              </tr>
            </tbody>
          </table>

          {/* Old Battery Exchange Note if any */}
          {bill.old_battery_returned === 1 && (
            <div className="p-2 bg-slate-50 border border-slate-200 rounded text-xs mb-3">
              <span className="font-bold text-slate-800">Old Battery Exchange Returned:</span>{' '}
              {bill.old_battery_brand} ({bill.old_battery_type}) - Discount credited: <strong>-{formatCurrency(bill.exchange_discount)}</strong>
            </div>
          )}

          {/* Totals & Calculations */}
          <div className="flex justify-end border-t border-slate-300 pt-2 mb-3">
            <div className="w-64 space-y-1 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal:</span>
                <span className="font-semibold">{formatCurrency(bill.subtotal)}</span>
              </div>
              {bill.exchange_discount > 0 && (
                <div className="flex justify-between text-emerald-800 font-medium">
                  <span>Old Battery Discount:</span>
                  <span>-{formatCurrency(bill.exchange_discount)}</span>
                </div>
              )}
              {bill.manual_discount > 0 && (
                <div className="flex justify-between text-slate-700 font-medium">
                  <span>Special Discount:</span>
                  <span>-{formatCurrency(bill.manual_discount)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-black text-slate-900 border-t-2 border-slate-800 pt-1">
                <span>Total Amount:</span>
                <span>{formatCurrency(bill.grand_total)}</span>
              </div>
              <div className="flex justify-between text-xs font-bold text-slate-800 pt-0.5">
                <span>Payment Mode:</span>
                <span>{bill.payment_mode}</span>
              </div>
              <div className="flex justify-between text-xs font-bold text-slate-900">
                <span>Amount Paid:</span>
                <span>{formatCurrency(bill.amount_paid)}</span>
              </div>
              {bill.balance_due > 0 && (
                <div className="flex justify-between text-sm font-black text-red-600 border-t border-red-200 pt-1">
                  <span>Balance Due:</span>
                  <span>{formatCurrency(bill.balance_due)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Notes */}
          {bill.notes && (
            <div className="text-xs text-slate-600 border-t border-slate-200 pt-1 mb-2">
              <strong className="text-slate-800">Notes:</strong> {bill.notes}
            </div>
          )}

          {/* Terms & Footer */}
          <div className="border-t-2 border-slate-800 pt-2 text-[10px] text-slate-600 space-y-1">
            <p className="font-bold text-slate-800">Terms & Conditions:</p>
            <p>{shopSettings?.terms || '1. Warranty claims as per manufacturer policy. 2. Please preserve bill and warranty card. 3. Physically damaged batteries void warranty.'}</p>
            <div className="flex justify-between pt-4 font-bold text-slate-800">
              <div>Customer Signature: __________________</div>
              <div>For Maharashtra Auto Battery: __________________</div>
            </div>
            <p className="text-center font-bold text-slate-900 pt-2 text-xs">
              Thank you for your business! Visit again!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

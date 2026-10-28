import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { QrCode, Copy, Check } from 'lucide-react';
import { formatCurrency } from '../utils/formatters';

export default function UPIPaymentQR({ amount, note = 'Battery Purchase', upiId, payeeName, size = 220 }) {
  const [dataUrl, setDataUrl] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const payAmount = Math.max(0, Math.round(parseFloat(amount) || 0));
  const cleanUpi = (upiId || '').trim();
  const upiLink = cleanUpi
    ? `upi://pay?pa=${encodeURIComponent(cleanUpi)}&pn=${encodeURIComponent(payeeName || 'Shop')}&am=${payAmount}&cu=INR&tn=${encodeURIComponent(note)}`
    : '';

  useEffect(() => {
    let cancelled = false;
    setError('');
    if (!upiLink || payAmount <= 0) {
      setDataUrl('');
      return;
    }
    QRCode.toDataURL(upiLink, {
      width: size,
      margin: 1,
      color: { dark: '#0f172a', light: '#ffffff' },
      errorCorrectionLevel: 'M'
    })
      .then(url => { if (!cancelled) setDataUrl(url); })
      .catch(err => { if (!cancelled) { setError(err?.message || 'QR generation failed'); setDataUrl(''); } });
    return () => { cancelled = true; };
  }, [upiLink, payAmount, size]);

  if (!cleanUpi) {
    return (
      <div className="text-center text-xs font-semibold text-slate-500 p-3 border border-dashed border-slate-300 rounded-lg">
        UPI ID is not configured. Add it in Settings to generate payment QR codes.
      </div>
    );
  }

  if (!upiId) {
    return (
      <div className="text-center text-xs font-semibold text-slate-500 p-3 border border-dashed border-slate-300 rounded-lg">
        UPI ID is not configured. Add it in Settings to generate payment QR codes.
      </div>
    );
  }

  const copyUpi = async () => {
    try {
      await navigator.clipboard.writeText(cleanUpi);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      setCopied(false);
    }
  };

  return (
    <div className="flex flex-col items-center text-center">
      <div className="flex items-center space-x-2 text-slate-800 font-black text-sm mb-2">
        <QrCode className="w-4 h-4" />
        <span>Scan & Pay with any UPI App</span>
      </div>

      {error ? (
        <div className="text-xs text-red-600 font-bold">Could not generate QR: {error}</div>
      ) : dataUrl ? (
        <img
          src={dataUrl}
          alt={`UPI QR code for ${formatCurrency(payAmount)}`}
          width={size}
          height={size}
          className="rounded-lg border-4 border-white shadow-sm bg-white"
        />
      ) : (
        <div
          className="flex items-center justify-center bg-slate-100 rounded-lg text-xs font-semibold text-slate-500"
          style={{ width: size, height: size }}
        >
          Generating QR...
        </div>
      )}

      <div className="mt-2 text-lg font-black text-slate-900">{formatCurrency(payAmount)}</div>
      <button
        type="button"
        onClick={copyUpi}
        className="mt-1 inline-flex items-center space-x-1 text-xs font-bold text-accent-700 hover:text-accent-800"
      >
        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        <span>{copied ? 'Copied!' : cleanUpi}</span>
      </button>
      <div className="text-[10px] text-slate-500 mt-0.5">{note}</div>
    </div>
  );
}

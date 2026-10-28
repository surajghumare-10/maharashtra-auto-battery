import React, { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { AlertCircle, Camera, Loader2, X } from 'lucide-react';

export default function BarcodeScanner({ open, onClose, onDetected, title = 'Scan Barcode / QR' }) {
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const detectedRef = useRef(false);
  const onDetectedRef = useRef(onDetected);
  const onCloseRef = useRef(onClose);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(true);

  useEffect(() => {
    onDetectedRef.current = onDetected;
    onCloseRef.current = onClose;
  }, [onDetected, onClose]);

  useEffect(() => {
    if (!open) return undefined;

    let mounted = true;
    detectedRef.current = false;
    setError('');
    setStarting(true);

    const reader = new BrowserMultiFormatReader(undefined, {
      delayBetweenScanAttempts: 150,
      delayBetweenScanSuccess: 500
    });

    reader
      .decodeFromConstraints(
        { video: { facingMode: { ideal: 'environment' } } },
        videoRef.current,
        (result, _err, controls) => {
          if (!mounted) return;
          if (controls) controlsRef.current = controls;
          if (!result || detectedRef.current) return;

          detectedRef.current = true;
          try {
            controlsRef.current?.stop();
          } catch (e) {
            // Camera already stopped.
          }
          if (navigator.vibrate) navigator.vibrate(80);
          const text = result.getText().trim();
          if (text) {
            onDetectedRef.current(text);
            onCloseRef.current();
          }
        }
      )
      .then((controls) => {
        if (!mounted) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
        setStarting(false);
      })
      .catch((err) => {
        if (!mounted) return;
        setStarting(false);
        setError(
          err?.name === 'NotAllowedError'
            ? 'Camera permission denied. Allow camera access in browser settings and try again.'
            : err?.message || 'Camera could not start on this device.'
        );
      });

    return () => {
      mounted = false;
      try {
        controlsRef.current?.stop();
      } catch (e) {
        // Camera already stopped.
      }
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-3">
      <div className="w-full max-w-md bg-white rounded-xl overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200">
          <div className="flex items-center space-x-2 font-black text-sm text-slate-900">
            <Camera className="w-4 h-4 text-accent-700" />
            <span>{title}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            aria-label="Close scanner"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="relative bg-black aspect-square">
          <video ref={videoRef} className="w-full h-full object-cover" muted playsInline autoPlay />
          <div className="absolute inset-x-8 inset-y-16 border-2 border-white/80 rounded-lg pointer-events-none">
            <div className="absolute inset-x-0 top-1/2 h-0.5 bg-red-500/80" />
          </div>
          {starting && !error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white bg-black/50">
              <Loader2 className="w-7 h-7 animate-spin mb-2" />
              <span className="text-xs font-bold">Starting camera...</span>
            </div>
          )}
        </div>

        <div className="p-3">
          {error ? (
            <div className="p-2.5 bg-red-50 border border-red-300 rounded text-red-800 text-xs font-bold flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          ) : (
            <p className="text-xs text-slate-600 font-semibold text-center">
              Hold the battery barcode/QR inside the frame. It will fill automatically.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

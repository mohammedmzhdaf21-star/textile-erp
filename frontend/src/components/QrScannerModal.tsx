import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BrowserQRCodeReader } from '@zxing/browser';
import type { IScannerControls } from '@zxing/browser';
import { normalizeQrScanValue } from '../lib/qrScan';

type QrScannerModalProps = {
  open: boolean;
  onClose: () => void;
  onScan: (value: string) => void;
};

export default function QrScannerModal({ open, onClose, onScan }: QrScannerModalProps) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const onScanRef = useRef(onScan);
  const onCloseRef = useRef(onClose);
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  onScanRef.current = onScan;
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) {
      setError(null);
      setIsStarting(false);
      return;
    }

    const reader = new BrowserQRCodeReader();
    let controls: IScannerControls | null = null;
    let cancelled = false;
    let hasScanned = false;

    const stopScanner = () => {
      controls?.stop();
      controls = null;
    };

    const startScanner = async () => {
      if (!videoRef.current || cancelled) return;

      setIsStarting(true);
      setError(null);

      try {
        controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' } } },
          videoRef.current,
          (result) => {
            if (!result || hasScanned || cancelled) return;

            const normalized = normalizeQrScanValue(result.getText());
            if (!normalized) return;

            hasScanned = true;
            stopScanner();
            onScanRef.current(normalized);
            onCloseRef.current();
          }
        );
      } catch (scanError: unknown) {
        if (!cancelled) {
          const message =
            scanError instanceof Error ? scanError.message : t('qrScanner.cameraError');
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setIsStarting(false);
        }
      }
    };

    void startScanner();

    return () => {
      cancelled = true;
      stopScanner();
    };
  }, [open, t]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-4 sm:items-center">
      <div
        className="w-full max-w-lg rounded-3xl bg-white p-4 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label={t('qrScanner.title')}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-black">{t('qrScanner.title')}</h3>
            <p className="mt-1 text-sm text-gray-500">{t('qrScanner.hint')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700"
          >
            {t('common.close')}
          </button>
        </div>

        <div className="relative mt-4 overflow-hidden rounded-2xl bg-black">
          <video ref={videoRef} className="aspect-[4/3] w-full object-cover" muted playsInline />
          <div className="pointer-events-none absolute inset-6 rounded-2xl border-2 border-white/80" />
        </div>

        {isStarting && !error && (
          <p className="mt-3 text-sm text-gray-500">{t('qrScanner.startingCamera')}</p>
        )}
        {error && (
          <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

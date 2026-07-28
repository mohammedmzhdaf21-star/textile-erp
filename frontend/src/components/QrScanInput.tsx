import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import QrScannerModal from './QrScannerModal';
import { normalizeQrScanValue } from '../lib/qrScan';

type QrScanInputProps = {
  value: string;
  onChange: (value: string) => void;
  onScan?: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
};

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 8.5V18a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8.5a2 2 0 0 0-2-2h-2.2l-1.2-1.6A2 2 0 0 0 14.8 4H9.2a2 2 0 0 0-1.6.9L6.4 6.5H4a2 2 0 0 0-2 2Z"
      />
      <circle cx="12" cy="12.5" r="3.25" />
    </svg>
  );
}

export default function QrScanInput({
  value,
  onChange,
  onScan,
  placeholder,
  className = '',
  disabled = false,
  id,
}: QrScanInputProps) {
  const { t } = useTranslation();
  const [scannerOpen, setScannerOpen] = useState(false);

  const applyScan = (rawValue: string) => {
    const normalized = normalizeQrScanValue(rawValue);
    if (!normalized) return;
    onChange(normalized);
    onScan?.(normalized);
  };

  return (
    <>
      <div className={className} id={id}>
        <button
          type="button"
          onClick={() => setScannerOpen(true)}
          disabled={disabled}
          className="inline-flex items-center justify-center rounded-xl border border-magenta-200 bg-magenta-50 p-3 text-magenta-700 transition hover:bg-magenta-100 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label={t('qrScanner.scanWithCamera')}
          title={t('qrScanner.scanWithCamera')}
        >
          <CameraIcon />
        </button>
        {value ? (
          <p className="mt-2 break-all text-xs font-semibold text-gray-800">{value}</p>
        ) : (
          <p className="mt-2 text-xs text-gray-500">{placeholder ?? t('qrScanner.tapToScan')}</p>
        )}
      </div>

      <QrScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={applyScan}
      />
    </>
  );
}

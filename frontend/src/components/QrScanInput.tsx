import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import QrScannerModal from './QrScannerModal';
import { normalizeQrScanValue } from '../lib/qrScan';

type QrScanInputProps = {
  value: string;
  onChange: (value: string) => void;
  onScan?: (value: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  onBlur?: () => void;
  id?: string;
  name?: string;
};

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
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
  inputClassName = 'w-full rounded-xl border border-gray-300 px-3 py-2 text-sm',
  disabled = false,
  autoFocus = false,
  onBlur,
  id,
  name,
}: QrScanInputProps) {
  const { t } = useTranslation();
  const [scannerOpen, setScannerOpen] = useState(false);
  const ignoreBlurRef = useRef(false);

  const applyScan = (rawValue: string) => {
    const normalized = normalizeQrScanValue(rawValue);
    if (!normalized) return;
    ignoreBlurRef.current = true;
    onChange(normalized);
    onScan?.(normalized);
  };

  const handleBlur = () => {
    if (ignoreBlurRef.current) {
      ignoreBlurRef.current = false;
      return;
    }
    onBlur?.();
  };

  return (
    <>
      <div className={`flex gap-2 ${className}`}>
        <input
          id={id}
          name={name}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={handleBlur}
          className={inputClassName}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
        />
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            ignoreBlurRef.current = true;
            setScannerOpen(true);
          }}
          disabled={disabled}
          className="inline-flex shrink-0 items-center justify-center rounded-xl border border-magenta-200 bg-magenta-50 px-3 text-magenta-700 transition hover:bg-magenta-100 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label={t('qrScanner.scanWithCamera')}
        >
          <CameraIcon />
        </button>
      </div>

      <QrScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={applyScan}
      />
    </>
  );
}

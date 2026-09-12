import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import QrScanInput from '../components/QrScanInput';
import { checkInAttendance } from '../lib/attendanceApi';
import { parseAttendanceQrValue } from '../lib/qrScan';

const AttendanceCheckIn: React.FC = () => {
  const { t } = useTranslation();
  const [scanValue, setScanValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submitCheckIn = async (rawValue: string) => {
    const parsed = parseAttendanceQrValue(rawValue);
    if (!parsed) {
      setError(t('attendance.invalidQr'));
      setMessage(null);
      return;
    }

    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const result = await checkInAttendance(rawValue);
      setMessage(
        result.alreadyCheckedIn
          ? t('attendance.alreadyCheckedIn', {
              branch: result.record.branchName,
              time: new Date(result.record.checkedInAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              }),
            })
          : t('attendance.checkInSuccess', {
              branch: result.record.branchName,
              time: new Date(result.record.checkedInAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              }),
            })
      );
      setScanValue('');
    } catch (submitError: unknown) {
      setError(submitError instanceof Error ? submitError.message : t('attendance.checkInFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-3xl font-bold text-black">{t('attendance.checkInTitle')}</h1>
        <p className="mt-1 text-sm text-gray-600">{t('attendance.checkInSubtitle')}</p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-gray-700">{t('attendance.checkInSteps')}</p>

        <div className="mt-6">
          <QrScanInput
            value={scanValue}
            onChange={setScanValue}
            onScan={(value) => void submitCheckIn(value)}
            placeholder={t('attendance.scanPlaceholder')}
            disabled={submitting}
          />
        </div>

        {message && (
          <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            {message}
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
      </div>
    </div>
  );
};

export default AttendanceCheckIn;

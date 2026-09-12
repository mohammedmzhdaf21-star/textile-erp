import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BRANCH_DESTINATIONS, BRANCH_ID_BY_CODE, type BranchDestinationCode } from '../lib/inventoryCodes';
import {
  fetchAttendanceRecords,
  fetchDailyAttendanceQr,
  type AttendanceRecord,
  type DailyAttendanceQr,
} from '../lib/attendanceApi';

const Attendance: React.FC = () => {
  const { t } = useTranslation();
  const [selectedBranch, setSelectedBranch] = useState<BranchDestinationCode>('A');
  const [qr, setQr] = useState<DailyAttendanceQr | null>(null);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const branchId = BRANCH_ID_BY_CODE[selectedBranch];

  const formatDateTime = (value: string) =>
    new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [qrRow, recordRows] = await Promise.all([
        fetchDailyAttendanceQr(branchId),
        fetchAttendanceRecords({ branchId }),
      ]);
      setQr(qrRow);
      setRecords(recordRows);
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : t('attendance.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [branchId, t]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadData();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [loadData]);

  const branchLabel = useMemo(() => {
    const branch = BRANCH_DESTINATIONS.find((entry) => entry.code === selectedBranch);
    return branch ? t(branch.labelKey) : selectedBranch;
  }, [selectedBranch, t]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-3xl font-bold text-black">{t('attendance.title')}</h1>
        <p className="mt-1 max-w-3xl text-sm text-gray-600">{t('attendance.subtitle')}</p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <label className="block text-sm font-medium text-gray-700">{t('attendance.branch')}</label>
        <select
          className="mt-2 w-full max-w-xs rounded-lg border border-gray-300 px-3 py-2"
          value={selectedBranch}
          onChange={(event) => setSelectedBranch(event.target.value as BranchDestinationCode)}
        >
          {BRANCH_DESTINATIONS.map((branch) => (
            <option key={branch.code} value={branch.code}>
              {t(branch.labelKey)} ({branch.id})
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && !qr ? (
        <p className="text-sm text-gray-500">{t('common.loading')}</p>
      ) : qr ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-black">{branchLabel}</h2>
            <p className="mt-1 text-sm text-gray-600">{t('attendance.tabletHint')}</p>
            <p className="mt-3 text-sm text-gray-700">
              {t('attendance.validUntil', { time: formatDateTime(qr.validUntil) })}
            </p>
            <p className="text-xs text-gray-500">
              {t('attendance.renewNotice', { hour: qr.resetHour })}
            </p>

            <div className="mt-6 flex flex-col items-center gap-4">
              {qr.qrCodeDataUrl ? (
                <img
                  src={qr.qrCodeDataUrl}
                  alt={t('attendance.qrAlt')}
                  className="h-72 w-72 max-w-full rounded-lg border border-gray-200 bg-white p-3"
                />
              ) : (
                <div className="flex h-72 w-72 items-center justify-center rounded-lg border border-dashed border-gray-300 text-sm text-gray-500">
                  {t('attendance.qrMissing')}
                </div>
              )}
              <p className="break-all text-center text-xs text-gray-500">{qr.qrCodeValue}</p>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-black">{t('attendance.todayCheckIns')}</h2>
            <p className="mt-1 text-sm text-gray-600">
              {t('attendance.dayLabel', { day: qr.attendanceDay })}
            </p>

            {records.length === 0 ? (
              <p className="mt-6 text-sm text-gray-500">{t('attendance.noCheckIns')}</p>
            ) : (
              <ul className="mt-4 max-h-[28rem] space-y-3 overflow-y-auto">
                {records.map((record) => (
                  <li
                    key={record.id}
                    className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3"
                  >
                    <p className="font-medium text-gray-900">{record.employeeName}</p>
                    <p className="text-xs text-gray-500">{record.employeeEmail}</p>
                    <p className="mt-1 text-sm text-gray-700">
                      {formatDateTime(record.checkedInAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default Attendance;

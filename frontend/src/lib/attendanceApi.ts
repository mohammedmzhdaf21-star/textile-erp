import api from './api';

export type DailyAttendanceQr = {
  branchId: string;
  attendanceDay: string;
  qrCodeValue: string;
  qrCodeDataUrl: string | null;
  validFrom: string;
  validUntil: string;
  renewsAt: string;
  resetHour: number;
  timezone: string;
};

export type AttendanceRecord = {
  id: string;
  branchId: string;
  branchName: string;
  employeeId?: string;
  employeeName: string;
  employeeEmail?: string;
  attendanceDay: string;
  checkedInAt: string;
};

export async function fetchDailyAttendanceQr(branchId: string) {
  const { data } = await api.get<{ qr: DailyAttendanceQr }>('/attendance/qr', {
    params: { branchId },
  });
  return data.qr;
}

export async function checkInAttendance(qrValue: string) {
  const { data } = await api.post<{
    alreadyCheckedIn: boolean;
    record: AttendanceRecord;
  }>('/attendance/check-in', { qrValue });
  return data;
}

export async function fetchAttendanceRecords(params?: {
  branchId?: string;
  attendanceDay?: string;
}) {
  const { data } = await api.get<{ records: AttendanceRecord[] }>('/attendance/records', {
    params,
  });
  return data.records;
}

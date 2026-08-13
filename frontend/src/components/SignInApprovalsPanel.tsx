import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { canManageEmployeeAccounts, getCurrentUser } from "../lib/auth";
import { fetchUnreadNotificationCount } from "../lib/registrationApi";
import {
  approveSignInRequest,
  fetchPendingSignInRequests,
  rejectSignInRequest,
  type DeviceSignInRequest,
} from "../lib/signInRequestsApi";

type SignInApprovalsPanelProps = {
  className?: string;
};

export default function SignInApprovalsPanel({ className = "" }: SignInApprovalsPanelProps) {
  const { t } = useTranslation();
  const user = getCurrentUser();
  const canManage = canManageEmployeeAccounts(user);

  const [pendingSignIns, setPendingSignIns] = useState<DeviceSignInRequest[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const loadPending = useCallback(async () => {
    if (!canManage) return;
    setLoading(true);
    setError("");
    try {
      const [requests, count] = await Promise.all([
        fetchPendingSignInRequests(),
        fetchUnreadNotificationCount(),
      ]);
      setPendingSignIns(requests);
      setUnreadCount(count);
    } catch (err: any) {
      setError(err?.response?.data?.error || t("dashboard.signInLoadFailed"));
    } finally {
      setLoading(false);
    }
  }, [canManage, t]);

  useEffect(() => {
    void loadPending();
  }, [loadPending]);

  useEffect(() => {
    if (!canManage) return;
    const intervalId = window.setInterval(() => {
      void loadPending();
    }, 10000);
    return () => window.clearInterval(intervalId);
  }, [canManage, loadPending]);

  async function handleApprove(request: DeviceSignInRequest) {
    setActionId(request.id);
    setError("");
    try {
      await approveSignInRequest(request.id);
      await loadPending();
    } catch (err: any) {
      setError(err?.response?.data?.error || t("dashboard.approveFailed"));
    } finally {
      setActionId(null);
    }
  }

  async function handleReject(request: DeviceSignInRequest) {
    if (window.prompt(t("dashboard.rejectReasonPrompt")) === null) return;

    setActionId(request.id);
    setError("");
    try {
      await rejectSignInRequest(request.id);
      await loadPending();
    } catch (err: any) {
      setError(err?.response?.data?.error || t("dashboard.rejectFailed"));
    } finally {
      setActionId(null);
    }
  }

  if (!canManage) return null;

  return (
    <div className={`rounded-xl border-2 border-amber-400 bg-amber-50 p-6 ${className}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-amber-900">
            {t("dashboard.pendingSignInsTitle")}
          </h2>
          <p className="mt-1 text-sm text-amber-800">
            {pendingSignIns.length > 0
              ? t("dashboard.pendingSignInsDescription", { count: pendingSignIns.length })
              : t("dashboard.pendingSignInsEmpty")}
          </p>
          {unreadCount > 0 && (
            <p className="mt-2 text-xs font-semibold text-amber-700">
              {t("dashboard.unreadNotifications", { count: unreadCount })}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => void loadPending()}
          disabled={loading}
          className="btn-secondary shrink-0 text-sm"
        >
          {loading ? t("common.loading") : t("common.refresh")}
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {pendingSignIns.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {pendingSignIns.map((request) => (
            <li
              key={request.id}
              className="rounded-lg border border-amber-200 bg-white p-4 shadow-sm"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-black">{request.employeeName}</p>
                  <p className="text-sm text-gray-600">{request.employeeEmail}</p>
                  <p className="mt-2 text-sm font-medium text-amber-900">
                    {t("dashboard.deviceLabel", {
                      device: request.deviceLabel || t("dashboard.unknownDevice"),
                    })}
                  </p>
                  {request.ipAddress && (
                    <p className="text-xs text-gray-500">{request.ipAddress}</p>
                  )}
                  <p className="mt-1 text-xs text-gray-400">
                    {t("dashboard.requestedAt", {
                      date: new Date(request.createdAt).toLocaleString(),
                    })}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void handleApprove(request)}
                    disabled={actionId === request.id}
                    className="btn-primary min-w-[7rem] text-sm font-semibold"
                  >
                    {actionId === request.id ? t("common.loading") : t("dashboard.approve")}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleReject(request)}
                    disabled={actionId === request.id}
                    className="btn-secondary min-w-[7rem] text-sm font-semibold"
                  >
                    {t("dashboard.reject")}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-lg border border-amber-200 bg-white px-4 py-3 text-sm text-gray-600">
          {t("dashboard.pendingSignInsHint")}
        </p>
      )}
    </div>
  );
}

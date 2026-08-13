import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { canEditEmployeeAccounts, getCurrentUser, logout } from "../lib/auth";
import { fetchUnreadNotificationCount } from "../lib/registrationApi";
import {
  approveSignInRequest,
  fetchPendingSignInRequests,
  rejectSignInRequest,
  type DeviceSignInRequest,
} from "../lib/signInRequestsApi";

export default function Dashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = getCurrentUser();
  const isAdmin = canEditEmployeeAccounts(user);

  const [pendingSignIns, setPendingSignIns] = useState<DeviceSignInRequest[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loadingPending, setLoadingPending] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const loadPending = useCallback(async () => {
    if (!isAdmin) return;
    setLoadingPending(true);
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
      setLoadingPending(false);
    }
  }, [isAdmin, t]);

  useEffect(() => {
    void loadPending();
  }, [loadPending]);

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

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

  return (
    <div className="mx-auto max-w-4xl">
      <div className="card animate-fade-in">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-extrabold text-black">
              {t("dashboard.welcome", { name: user?.name })}
            </h1>
            <p className="mt-1 text-gray-500">{user?.email}</p>
          </div>
          <button onClick={handleLogout} className="btn-secondary">
            {t("common.signOut")}
          </button>
        </div>

        {isAdmin && (pendingSignIns.length > 0 || unreadCount > 0) && (
          <div className="mb-8 rounded-xl border-2 border-amber-400 bg-amber-50 p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-amber-900">
                  {t("dashboard.pendingSignInsTitle")}
                </h2>
                <p className="mt-1 text-sm text-amber-800">
                  {t("dashboard.pendingSignInsDescription", {
                    count: pendingSignIns.length,
                  })}
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
                disabled={loadingPending}
                className="btn-secondary text-sm"
              >
                {loadingPending ? t("common.loading") : t("common.refresh")}
              </button>
            </div>

            {error && (
              <div className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            {pendingSignIns.length > 0 && (
              <ul className="mt-4 space-y-3">
                {pendingSignIns.map((request) => (
                  <li
                    key={request.id}
                    className="rounded-lg border border-amber-200 bg-white p-4 shadow-sm"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
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
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          onClick={() => void handleApprove(request)}
                          disabled={actionId === request.id}
                          className="btn-primary text-sm"
                        >
                          {actionId === request.id ? t("common.loading") : t("dashboard.approve")}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleReject(request)}
                          disabled={actionId === request.id}
                          className="btn-secondary text-sm"
                        >
                          {t("dashboard.reject")}
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-xl bg-gradient-to-br from-magenta-500 to-magenta-700 p-6 text-white shadow-lg">
            <p className="text-sm opacity-80">{t("common.role")}</p>
            <p className="mt-1 text-2xl font-bold">{user?.role}</p>
          </div>
          <div className="rounded-xl bg-black p-6 text-white shadow-lg">
            <p className="text-sm opacity-80">{t("common.status")}</p>
            <p className="mt-1 text-2xl font-bold">{t("common.active")}</p>
          </div>
          <div className="rounded-xl border-2 border-magenta-500 bg-white p-6 text-black">
            <p className="text-sm text-gray-500">{t("common.login")}</p>
            <p className="mt-1 text-2xl font-bold text-magenta-500">{t("common.success")}</p>
          </div>
        </div>

        <div className="mt-8 rounded-xl border border-gray-200 bg-gradient-to-br from-gray-50 to-white p-6">
          <h2 className="text-lg font-bold text-black">{t("dashboard.overviewTitle")}</h2>
          <p className="mt-2 text-gray-600">{t("dashboard.overviewDescription")}</p>
        </div>
      </div>
    </div>
  );
}

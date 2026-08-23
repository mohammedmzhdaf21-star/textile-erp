import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { canEditEmployeeAccounts, canManageEmployeeAccounts, getCurrentUser } from "../lib/auth";
import {
  approveEmployee,
  fetchPendingEmployees,
  rejectEmployee,
  type PendingEmployee,
} from "../lib/registrationApi";

type RegistrationApprovalsPanelProps = {
  className?: string;
};

export default function RegistrationApprovalsPanel({
  className = "",
}: RegistrationApprovalsPanelProps) {
  const { t } = useTranslation();
  const user = getCurrentUser();
  const canView = canManageEmployeeAccounts(user);
  const canAct = canEditEmployeeAccounts(user);

  const [pending, setPending] = useState<PendingEmployee[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const loadPending = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    setError("");
    try {
      const employees = await fetchPendingEmployees();
      setPending(employees);
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined;
      setError(msg || t("dashboard.pendingLoadFailed"));
    } finally {
      setLoading(false);
    }
  }, [canView, t]);

  useEffect(() => {
    void loadPending();
  }, [loadPending]);

  useEffect(() => {
    if (!canView) return;
    const intervalId = window.setInterval(() => {
      void loadPending();
    }, 10000);
    return () => window.clearInterval(intervalId);
  }, [canView, loadPending]);

  async function handleApprove(employee: PendingEmployee) {
    setActionId(employee.id);
    setError("");
    try {
      await approveEmployee(employee.id, {
        branchIds: employee.branchIds.length > 0 ? employee.branchIds : undefined,
        assignedWork: employee.assignedWork ?? undefined,
      });
      await loadPending();
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined;
      setError(msg || t("dashboard.approveFailed"));
    } finally {
      setActionId(null);
    }
  }

  async function handleReject(employee: PendingEmployee) {
    const reason = window.prompt(t("dashboard.rejectReasonPrompt"));
    if (reason === null) return;

    setActionId(employee.id);
    setError("");
    try {
      await rejectEmployee(employee.id, reason || undefined);
      await loadPending();
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined;
      setError(msg || t("dashboard.rejectFailed"));
    } finally {
      setActionId(null);
    }
  }

  if (!canView) return null;

  return (
    <div className={`rounded-xl border-2 border-violet-400 bg-violet-50 p-6 ${className}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-violet-900">
            {t("dashboard.pendingRegistrationsTitle")}
          </h2>
          <p className="mt-1 text-sm text-violet-800">
            {pending.length > 0
              ? t("dashboard.pendingRegistrationsDescription", { count: pending.length })
              : t("dashboard.pendingRegistrationsEmpty")}
          </p>
          {!canAct && (
            <p className="mt-2 text-xs font-medium text-violet-700">
              {t("dashboard.pendingRegistrationsAdminOnly")}
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

      {pending.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {pending.map((employee) => (
            <li
              key={employee.id}
              className="rounded-lg border border-violet-200 bg-white p-4 shadow-sm"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-black">{employee.name}</p>
                  <p className="text-sm text-gray-600">{employee.email}</p>
                  {employee.phone && (
                    <p className="text-sm text-gray-600">{employee.phone}</p>
                  )}
                  {employee.branchIds.length > 0 && (
                    <p className="mt-2 text-sm text-violet-900">
                      {t("dashboard.registrationBranchLabel", {
                        branches: employee.branchIds.join(", "),
                      })}
                    </p>
                  )}
                  {employee.registrationNote && (
                    <p className="mt-2 text-sm text-gray-700">
                      {t("dashboard.registrationNoteLabel")}: {employee.registrationNote}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-gray-400">
                    {t("dashboard.requestedAt", {
                      date: new Date(employee.createdAt).toLocaleString(),
                    })}
                  </p>
                </div>
                {canAct && (
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void handleApprove(employee)}
                      disabled={actionId === employee.id}
                      className="btn-primary min-w-[7rem] text-sm font-semibold"
                    >
                      {actionId === employee.id ? t("common.loading") : t("dashboard.approve")}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleReject(employee)}
                      disabled={actionId === employee.id}
                      className="btn-secondary min-w-[7rem] text-sm font-semibold"
                    >
                      {t("dashboard.reject")}
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-lg border border-violet-200 bg-white px-4 py-3 text-sm text-gray-600">
          {t("dashboard.pendingRegistrationsHint")}
        </p>
      )}
    </div>
  );
}

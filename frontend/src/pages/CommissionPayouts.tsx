import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import api from "../lib/api";
import { canManageEmployeeAccounts, getCurrentUser } from "../lib/auth";
import { formatCurrency } from "../lib/currency";

type PendingLine = {
  id: string;
  saleId: string;
  inventoryItemId: string | null;
  soldPrice: string;
  minimumPrice: string;
  quantitySold: string;
  ratePercent: string;
  commissionAmount: string;
  saleDate: string;
};

type PendingGroup = {
  employee: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  totalPending: string;
  entries: PendingLine[];
};

export default function CommissionPayouts() {
  const { t } = useTranslation();
  const user = getCurrentUser();
  const canPay = canManageEmployeeAccounts(user);
  const [groups, setGroups] = useState<PendingGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const grandTotal = useMemo(
    () => groups.reduce((sum, group) => sum + Number(group.totalPending || 0), 0),
    [groups]
  );

  const loadPending = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get<{ groups: PendingGroup[] }>("/commissions/pending");
      setGroups(response.data.groups || []);
    } catch (loadError: unknown) {
      const msg =
        loadError instanceof Error ? loadError.message : t("commissionPayouts.loadFailed");
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadPending();
  }, [loadPending]);

  async function markPaid(employeeId: string) {
    if (!canPay) return;
    const confirmed = window.confirm(t("commissionPayouts.confirmPaid"));
    if (!confirmed) return;

    setPayingId(employeeId);
    setMessage(null);
    setError(null);

    try {
      const response = await api.post<{ amountPaid: string; paidCount: number }>(
        `/commissions/pay/${employeeId}`
      );
      setMessage(
        t("commissionPayouts.paidSuccess", {
          count: response.data.paidCount,
          amount: formatCurrency(response.data.amountPaid),
        })
      );
      await loadPending();
    } catch (payError: unknown) {
      const body =
        payError &&
        typeof payError === "object" &&
        "response" in payError &&
        payError.response &&
        typeof payError.response === "object" &&
        "data" in payError.response
          ? (payError.response.data as { error?: string })
          : undefined;
      setError(body?.error ?? t("commissionPayouts.payFailed"));
    } finally {
      setPayingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-black">{t("nav.commissionPayouts")}</h1>
        <p className="mt-1 text-sm text-gray-600">{t("commissionPayouts.subtitle")}</p>
      </div>

      <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm text-gray-500">{t("commissionPayouts.totalPending")}</div>
            <div className="mt-1 text-3xl font-bold text-black">{formatCurrency(grandTotal)}</div>
          </div>
          <button type="button" onClick={() => void loadPending()} className="btn-secondary">
            {t("common.refresh")}
          </button>
        </div>

        {message && <p className="mt-4 text-sm text-green-700">{message}</p>}
        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        {loading ? (
          <p className="mt-6 text-sm text-gray-500">{t("common.loading")}</p>
        ) : groups.length === 0 ? (
          <p className="mt-6 text-sm text-gray-500">{t("commissionPayouts.noPending")}</p>
        ) : (
          <div className="mt-6 space-y-5">
            {groups.map((group) => (
              <article
                key={group.employee.id}
                className="rounded-2xl border border-gray-200 bg-gray-50 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-black">{group.employee.name}</h2>
                    <p className="text-sm text-gray-600">{group.employee.email}</p>
                    <p className="mt-1 text-xs uppercase tracking-wide text-gray-500">
                      {group.employee.role}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-gray-500">{t("commissionPayouts.employeeTotal")}</div>
                    <div className="text-2xl font-bold text-magenta-600">
                      {formatCurrency(group.totalPending)}
                    </div>
                    {canPay && (
                      <button
                        type="button"
                        disabled={payingId === group.employee.id}
                        onClick={() => void markPaid(group.employee.id)}
                        className="btn-primary mt-3 min-w-[7rem]"
                      >
                        {payingId === group.employee.id
                          ? t("common.saving")
                          : t("commissionPayouts.markPaid")}
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  {group.entries.map((entry) => (
                    <div
                      key={entry.id}
                      className="grid grid-cols-1 gap-2 rounded-xl bg-white p-3 text-sm sm:grid-cols-[1fr_auto]"
                    >
                      <div className="min-w-0">
                        <div className="break-all font-medium text-black">
                          {entry.inventoryItemId || t("common.unknownItem")}
                        </div>
                        <div className="text-xs text-gray-500">
                          {t("commissionPayouts.lineDetail", {
                            sold: formatCurrency(entry.soldPrice),
                            min: formatCurrency(entry.minimumPrice),
                            qty: Number(entry.quantitySold).toFixed(2),
                            rate: Number(entry.ratePercent).toFixed(1),
                            date: new Date(entry.saleDate).toLocaleString(),
                          })}
                        </div>
                      </div>
                      <div className="self-center whitespace-nowrap font-bold text-magenta-600">
                        {formatCurrency(entry.commissionAmount)}
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

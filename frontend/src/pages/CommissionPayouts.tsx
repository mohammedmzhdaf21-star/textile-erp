import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api from "../lib/api";
import { canManageEmployeeAccounts, getCurrentUser } from "../lib/auth";
import { formatCurrency } from "../lib/currency";
import { resolveSalePaymentLabel } from "../lib/paymentMethod";

type PendingCommissionSaleDetail = {
  customerName: string;
  customerPhone: string;
  totalPrice: string;
  paymentMethod: string;
  branchId: string;
  branchName: string;
  notes?: string | null;
};

type PendingCommissionItemDetail = {
  description: string;
  isPlainCloth: boolean;
  plainClothName?: string | null;
  soldAsUnit: string;
  lineTotal: string;
  colorName?: string | null;
};

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
  sale: PendingCommissionSaleDetail;
  item: PendingCommissionItemDetail;
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

type RawPendingLine = Omit<PendingLine, "sale" | "item"> & {
  sale?: PendingCommissionSaleDetail | null;
  item?: PendingCommissionItemDetail | null;
};

type RawPendingGroup = Omit<PendingGroup, "entries"> & {
  entries: RawPendingLine[];
};

function normalizePendingLine(entry: RawPendingLine): PendingLine {
  const soldPrice = Number(entry.soldPrice || 0);
  const quantitySold = Number(entry.quantitySold || 0);
  const fallbackLineTotal = (soldPrice * quantitySold).toFixed(2);

  const item: PendingCommissionItemDetail = entry.item ?? {
    description: entry.inventoryItemId || "Sale item",
    isPlainCloth: false,
    plainClothName: null,
    soldAsUnit: "METER",
    lineTotal: fallbackLineTotal,
    colorName: null,
  };

  const sale: PendingCommissionSaleDetail = entry.sale ?? {
    customerName: "—",
    customerPhone: "—",
    totalPrice: item.lineTotal,
    paymentMethod: "CASH",
    branchId: "",
    branchName: "—",
    notes: null,
  };

  return {
    ...entry,
    sale,
    item,
  };
}

function normalizePendingGroups(groups: RawPendingGroup[]): PendingGroup[] {
  return groups.map((group) => ({
    ...group,
    entries: (group.entries ?? []).map(normalizePendingLine),
  }));
}

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
      const response = await api.get<{ groups: RawPendingGroup[] }>("/commissions/pending");
      setGroups(normalizePendingGroups(response.data.groups || []));
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

  const unitLabel = (unit: string) =>
    unit === "PIECE" ? t("common.pieceSingular") : t("common.meterSingular");

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

                <div className="mt-4 space-y-3">
                  {group.entries.map((entry) => (
                    <div
                      key={entry.id}
                      className="rounded-xl border border-gray-200 bg-white p-4 text-sm"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1 space-y-2">
                          <div>
                            <div className="font-semibold text-black">
                              {entry.item.isPlainCloth
                                ? t("commissionPayouts.plainClothItem", {
                                    name: entry.item.description,
                                  })
                                : entry.item.description}
                            </div>
                            {!entry.item.isPlainCloth && entry.item.colorName && (
                              <div className="text-xs text-gray-500">
                                {t("commissionPayouts.colorLabel", { name: entry.item.colorName })}
                              </div>
                            )}
                          </div>

                          <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-700">
                            <div className="font-semibold text-gray-900">
                              {t("commissionPayouts.saleDetailTitle")}
                            </div>
                            <div className="mt-1">
                              {t("commissionPayouts.customerLine", {
                                name: entry.sale.customerName,
                                phone: entry.sale.customerPhone,
                              })}
                            </div>
                            <div>
                              {t("commissionPayouts.branchLine", {
                                branch: entry.sale.branchName || entry.sale.branchId,
                                total: formatCurrency(entry.sale.totalPrice),
                                payment: resolveSalePaymentLabel(
                                  t,
                                  entry.sale.paymentMethod,
                                  entry.sale.notes
                                ),
                              })}
                            </div>
                            <div>
                              {t("commissionPayouts.saleDateLine", {
                                date: new Date(entry.saleDate).toLocaleString(),
                              })}
                            </div>
                            <div className="mt-1">
                              {t("commissionPayouts.soldLine", {
                                qty: Number(entry.quantitySold).toFixed(2),
                                unit: unitLabel(entry.item.soldAsUnit),
                                unitPrice: formatCurrency(entry.soldPrice),
                                lineTotal: formatCurrency(entry.item.lineTotal),
                              })}
                            </div>
                            <Link
                              to={`/sales/${entry.saleId}`}
                              state={{ returnTo: "/commission-payouts" }}
                              className="mt-2 inline-block font-semibold text-magenta-600 hover:underline"
                            >
                              {t("commissionPayouts.viewSale")}
                            </Link>
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
                        <div className="whitespace-nowrap text-right">
                          <div className="text-xs text-gray-500">{t("nav.commission")}</div>
                          <div className="text-xl font-bold text-magenta-600">
                            {formatCurrency(entry.commissionAmount)}
                          </div>
                        </div>
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

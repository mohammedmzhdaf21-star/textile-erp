import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import api from "../lib/api";
import {
  readCommissionSettings,
  readItemMinimumPrices,
  saveCommissionSettings,
} from "../lib/dashboardSettings";
import { pushCommissionRateToServer } from "../lib/commissionSettingsApi";
import { formatCurrency, parsePriceInput, toPriceInput } from "../lib/currency";

type SaleItem = {
  inventoryItemId?: string | null;
  quantitySold: string | number;
  soldPrice: string | number;
};

type Sale = {
  id: string;
  employee?: { name: string; email?: string };
  employeeName?: string;
  items?: SaleItem[];
};

export default function SalesCommission() {
  const { t } = useTranslation();
  const initialSettings = readCommissionSettings();
  const [commissionRate, setCommissionRate] = useState(String(initialSettings.ratePercent));
  const [baseCommission, setBaseCommission] = useState(
    toPriceInput(initialSettings.baseAmountPerUnit)
  );
  const [commissionRows, setCommissionRows] = useState<
    Array<{ employee: string; saleId: string; itemId: string; commission: number }>
  >([]);
  const [commissionMessage, setCommissionMessage] = useState<string | null>(null);

  const commissionTotal = useMemo(
    () => commissionRows.reduce((sum, row) => sum + row.commission, 0),
    [commissionRows]
  );

  async function calculateCommissions() {
    const rate = Number(commissionRate);
    const baseAmount = parsePriceInput(baseCommission);
    if (!Number.isFinite(rate) || rate < 0) return alert(t("dashboard.enterValidCommission"));
    if (!Number.isFinite(Number(baseCommission)) || Number(baseCommission) < 0) {
      return alert(t("dashboard.enterValidBaseCommission"));
    }
    saveCommissionSettings({ ratePercent: rate, baseAmountPerUnit: baseAmount });
    try {
      await pushCommissionRateToServer(rate, baseAmount);
    } catch {
      // Rate saved locally; server sync can retry on next save
    }
    setCommissionMessage(null);

    try {
      const response = await api.get("/sales", { params: { pageSize: 200 } });
      const sales = (response.data?.sales || response.data?.items || []) as Sale[];
      const prices = readItemMinimumPrices();
      const rows: Array<{ employee: string; saleId: string; itemId: string; commission: number }> = [];
      const priceEps = 0.001;

      sales.forEach((sale) => {
        const employee = sale.employee?.name || sale.employeeName || t("common.unknownEmployee");
        (sale.items || []).forEach((item) => {
          if (!item.inventoryItemId) return;
          const savedPrice = prices[item.inventoryItemId];
          if (!savedPrice) return;
          const soldPrice = Number(item.soldPrice || 0);
          const quantity = Number(item.quantitySold || 0);
          const minimumPrice = savedPrice.minimumPrice;
          if (quantity <= 0 || soldPrice < minimumPrice - priceEps) return;

          const basePart = baseAmount * quantity;
          const margin = Math.max(0, soldPrice - minimumPrice);
          const marginPart = margin * quantity * (rate / 100);
          const commission = basePart + marginPart;

          if (commission > 0) {
            rows.push({
              employee,
              saleId: sale.id,
              itemId: item.inventoryItemId,
              commission,
            });
          }
        });
      });

      setCommissionRows(rows);
      setCommissionMessage(
        t("dashboard.calculatedLines", {
          count: rows.length,
          plural: rows.length === 1 ? "" : "s",
          rate,
          base: formatCurrency(baseAmount),
        })
      );
    } catch (error: unknown) {
      const body =
        error &&
        typeof error === "object" &&
        "response" in error &&
        error.response &&
        typeof error.response === "object" &&
        "data" in error.response
          ? (error.response.data as { error?: string; message?: string })
          : undefined;
      setCommissionMessage(body?.error ?? body?.message ?? t("dashboard.failedToCalculate"));
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-black">{t("nav.salesCommission")}</h1>
        <p className="mt-1 text-sm text-gray-600">{t("dashboard.commissionDescription")}</p>
      </div>

      <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <label className="block text-sm font-medium text-gray-700">
          {t("dashboard.commissionBaseAmount")}
        </label>
        <p className="mt-1 text-xs text-gray-500">
          {t("dashboard.commissionBaseAmountHint")} {t("common.thousandsHint")}
        </p>
        <input
          type="number"
          min="0"
          step="1"
          value={baseCommission}
          onChange={(event) => setBaseCommission(event.target.value)}
          className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
        />
        <label className="mt-4 block text-sm font-medium text-gray-700">{t("dashboard.commissionPercent")}</label>
        <p className="mt-1 text-xs text-gray-500">{t("dashboard.commissionPercentHint")}</p>
        <input
          type="number"
          min="0"
          step="0.1"
          value={commissionRate}
          onChange={(event) => setCommissionRate(event.target.value)}
          className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={calculateCommissions}
          className="mt-4 flex w-full items-center justify-between rounded-lg bg-black px-6 py-3 text-left font-semibold text-white shadow-md transition-all duration-200 hover:bg-gray-800"
        >
          <span>{t("dashboard.runCommission")}</span>
          <span aria-hidden="true">→</span>
        </button>
        {commissionMessage && <p className="mt-3 text-sm text-magenta-600">{commissionMessage}</p>}

        <div className="mt-6 rounded-2xl border-2 border-magenta-500 bg-white p-4 text-black">
          <div className="text-sm text-gray-500">{t("dashboard.totalCommission")}</div>
          <div className="mt-2 rounded-xl bg-black px-4 py-3 text-2xl font-bold leading-none text-white">
            {formatCurrency(commissionTotal)}
          </div>
        </div>

        <div className="mt-6 max-h-[28rem] space-y-2 overflow-auto pb-3 text-sm">
          {commissionRows.length === 0 ? (
            <p className="text-gray-500">{t("salesCommission.noResults")}</p>
          ) : (
            commissionRows.map((row) => (
              <div
                key={`${row.saleId}-${row.itemId}`}
                className="grid grid-cols-[1fr_auto] gap-3 rounded-xl bg-gray-50 p-3"
              >
                <div className="min-w-0">
                  <div className="break-words font-semibold text-black">{row.employee}</div>
                  <div className="break-all text-xs text-gray-500">{row.itemId}</div>
                </div>
                <div className="self-center whitespace-nowrap font-bold text-magenta-600">
                  {formatCurrency(row.commission)}
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import QrScanInput from "../components/QrScanInput";
import api from "../lib/api";
import {
  dashboardSections,
  getItemMinimumPrice,
  readCommissionSettings,
  readEmployeeAccessRules,
  readItemMinimumPrices,
  saveCommissionSettings,
  saveEmployeeAccessRule,
  saveItemMinimumPrice,
  type DashboardSectionKey,
} from "../lib/dashboardSettings";
import { getCurrentUser, logout } from "../lib/auth";

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

export default function Dashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = getCurrentUser();
  const [priceItemId, setPriceItemId] = useState("");
  const [priceUnit, setPriceUnit] = useState<"METER" | "PIECE">("METER");
  const [minimumPrice, setMinimumPrice] = useState("0");
  const [priceMessage, setPriceMessage] = useState<string | null>(null);
  const [employeeEmail, setEmployeeEmail] = useState("");
  const [assignedWork, setAssignedWork] = useState("");
  const [allowedSections, setAllowedSections] = useState<DashboardSectionKey[]>(
    dashboardSections.map((section) => section.key)
  );
  const [accessMessage, setAccessMessage] = useState<string | null>(null);
  const [commissionRate, setCommissionRate] = useState(String(readCommissionSettings().ratePercent));
  const [commissionRows, setCommissionRows] = useState<Array<{ employee: string; saleId: string; itemId: string; commission: number }>>([]);
  const [commissionMessage, setCommissionMessage] = useState<string | null>(null);
  const itemPrices = readItemMinimumPrices();
  const employeeAccessRules = readEmployeeAccessRules();

  const unitLabel = (unit: "METER" | "PIECE") =>
    unit === "PIECE" ? t("common.pieceSingular") : t("common.meterSingular");

  const commissionTotal = useMemo(
    () => commissionRows.reduce((sum, row) => sum + row.commission, 0),
    [commissionRows]
  );

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  async function loadItemForPrice(scannedItemId?: string) {
    const itemId = (scannedItemId ?? priceItemId).trim();
    if (!itemId) return alert(t("dashboard.enterItemIdFirst"));

    if (scannedItemId) {
      setPriceItemId(scannedItemId);
    }

    try {
      const response = await api.get(`/inventory/${encodeURIComponent(itemId)}`);
      const item = response.data as { type?: string };
      const unit = item.type === "PIECE" ? "PIECE" : "METER";
      const existing = getItemMinimumPrice(itemId);
      setPriceUnit(unit);
      if (existing) setMinimumPrice(String(existing.minimumPrice));
      setPriceMessage(
        t("dashboard.itemDetected", {
          type: item.type || "Item",
          unit: unitLabel(unit),
        })
      );
    } catch (error: any) {
      const body = error?.response?.data;
      setPriceMessage(body?.error ?? body?.message ?? error?.message ?? t("dashboard.itemNotFound"));
    }
  }

  function savePrice() {
    const itemId = priceItemId.trim();
    const parsedPrice = Number(minimumPrice);
    if (!itemId) return alert(t("dashboard.enterItemId"));
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) return alert(t("dashboard.enterValidMinimumPrice"));

    saveItemMinimumPrice({
      itemId,
      unit: priceUnit,
      minimumPrice: parsedPrice,
      updatedAt: new Date().toISOString(),
    });
    setPriceMessage(
      t("dashboard.savedMinimumPrice", {
        itemId,
        price: parsedPrice.toFixed(2),
        unit: unitLabel(priceUnit),
      })
    );
  }

  function toggleSection(section: DashboardSectionKey) {
    setAllowedSections((current) =>
      current.includes(section)
        ? current.filter((item) => item !== section)
        : [...current, section]
    );
  }

  function saveAccessRule() {
    const email = employeeEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) return alert(t("dashboard.enterValidEmail"));

    saveEmployeeAccessRule({
      email,
      sections: allowedSections,
      assignedWork,
      updatedAt: new Date().toISOString(),
    });
    setAccessMessage(t("dashboard.savedAccessFor", { email }));
  }

  async function calculateCommissions() {
    const rate = Number(commissionRate);
    if (!Number.isFinite(rate) || rate < 0) return alert(t("dashboard.enterValidCommission"));
    saveCommissionSettings({ ratePercent: rate });
    setCommissionMessage(null);

    try {
      const response = await api.get("/sales", { params: { pageSize: 200 } });
      const sales = (response.data?.sales || response.data?.items || []) as Sale[];
      const prices = readItemMinimumPrices();
      const rows: Array<{ employee: string; saleId: string; itemId: string; commission: number }> = [];

      sales.forEach((sale) => {
        const employee = sale.employee?.name || sale.employeeName || t("common.unknownEmployee");
        (sale.items || []).forEach((item) => {
          if (!item.inventoryItemId) return;
          const savedPrice = prices[item.inventoryItemId];
          if (!savedPrice) return;
          const soldPrice = Number(item.soldPrice || 0);
          const quantity = Number(item.quantitySold || 0);
          const margin = Math.max(0, soldPrice - savedPrice.minimumPrice);
          const commission = margin * quantity * (rate / 100);
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
        })
      );
    } catch (error: any) {
      const body = error?.response?.data;
      setCommissionMessage(body?.error ?? body?.message ?? error?.message ?? t("dashboard.failedToCalculate"));
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="card animate-fade-in">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-extrabold text-black">
                {t("dashboard.welcome", { name: user?.name })}
              </h1>
              <p className="text-gray-500 mt-1">{user?.email}</p>
            </div>
            <button onClick={handleLogout} className="btn-secondary">
              {t("common.signOut")}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
            <div className="bg-gradient-to-br from-magenta-500 to-magenta-700 text-white p-6 rounded-xl shadow-lg">
              <p className="text-sm opacity-80">{t("common.role")}</p>
              <p className="text-2xl font-bold mt-1">{user?.role}</p>
            </div>
            <div className="bg-black text-white p-6 rounded-xl shadow-lg">
              <p className="text-sm opacity-80">{t("common.status")}</p>
              <p className="text-2xl font-bold mt-1">{t("common.active")}</p>
            </div>
            <div className="bg-white border-2 border-magenta-500 text-black p-6 rounded-xl">
              <p className="text-sm text-gray-500">{t("common.login")}</p>
              <p className="text-2xl font-bold mt-1 text-magenta-500">{t("common.success")}</p>
            </div>
          </div>

          <div className="mt-8 p-6 bg-gradient-to-br from-gray-50 to-white border border-gray-200 rounded-xl">
            <h2 className="text-lg font-bold text-black mb-2">{t("dashboard.managementTitle")}</h2>
            <p className="text-gray-600">{t("dashboard.managementDescription")}</p>
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-3">
            <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-bold text-black">{t("dashboard.priceTitle")}</h2>
              <p className="mt-1 text-sm text-gray-600">{t("dashboard.priceDescription")}</p>
              <label className="mt-4 block text-sm font-medium text-gray-700">{t("dashboard.qrItemId")}</label>
              <QrScanInput
                className="mt-1"
                value={priceItemId}
                onChange={setPriceItemId}
                onScan={(value) => {
                  setPriceItemId(value);
                  void loadItemForPrice(value);
                }}
                placeholder={t("dashboard.qrPlaceholder")}
              />
              <button type="button" onClick={() => void loadItemForPrice()} className="btn-secondary mt-3 w-full">
                {t("common.detectItem")}
              </button>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">{t("common.unit")}</label>
                  <select
                    value={priceUnit}
                    onChange={(event) => setPriceUnit(event.target.value as "METER" | "PIECE")}
                    className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="METER">{t("common.meter")}</option>
                    <option value="PIECE">{t("common.piece")}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">{t("dashboard.minimumPrice")}</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={minimumPrice}
                    onChange={(event) => setMinimumPrice(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <button type="button" onClick={savePrice} className="btn-primary mt-4 w-full">
                {t("common.savePrice")}
              </button>
              {priceMessage && <p className="mt-3 text-sm text-magenta-600">{priceMessage}</p>}
              <div className="mt-4 max-h-40 space-y-2 overflow-auto text-sm">
                {Object.values(itemPrices).map((price) => (
                  <div key={price.itemId} className="rounded-xl bg-gray-50 p-3">
                    <div className="break-all font-semibold text-black">{price.itemId}</div>
                    <div className="text-gray-600">
                      {t("dashboard.pricePerUnit", {
                        price: price.minimumPrice.toFixed(2),
                        unit: unitLabel(price.unit),
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-bold text-black">{t("dashboard.employeeAccessTitle")}</h2>
              <p className="mt-1 text-sm text-gray-600">{t("dashboard.employeeAccessDescription")}</p>
              <label className="mt-4 block text-sm font-medium text-gray-700">{t("dashboard.employeeEmail")}</label>
              <input
                value={employeeEmail}
                onChange={(event) => setEmployeeEmail(event.target.value)}
                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                placeholder={t("dashboard.employeeEmailPlaceholder")}
              />
              <label className="mt-4 block text-sm font-medium text-gray-700">{t("dashboard.assignedWork")}</label>
              <textarea
                value={assignedWork}
                onChange={(event) => setAssignedWork(event.target.value)}
                className="mt-1 min-h-20 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                placeholder={t("dashboard.assignedWorkPlaceholder")}
              />
              <div className="mt-4 grid max-h-48 grid-cols-2 gap-2 overflow-auto pr-1">
                {dashboardSections.map((section) => (
                  <label key={section.key} className="flex items-center gap-2 rounded-xl bg-gray-50 p-2 text-sm">
                    <input
                      type="checkbox"
                      checked={allowedSections.includes(section.key)}
                      onChange={() => toggleSection(section.key)}
                    />
                    <span>{t(section.labelKey)}</span>
                  </label>
                ))}
              </div>
              <button type="button" onClick={saveAccessRule} className="btn-primary mt-4 w-full">
                {t("dashboard.saveEmployeeAccess")}
              </button>
              {accessMessage && <p className="mt-3 text-sm text-magenta-600">{accessMessage}</p>}
              <div className="mt-4 max-h-32 space-y-2 overflow-auto text-xs text-gray-600">
                {Object.values(employeeAccessRules).map((rule) => (
                  <div key={rule.email} className="rounded-xl bg-gray-50 p-2">
                    <div className="font-semibold text-black">{rule.email}</div>
                    <div>
                      {t("dashboard.sectionsCount", {
                        count: rule.sections.length,
                        work: rule.assignedWork || t("dashboard.noWorkNote"),
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-bold text-black">{t("dashboard.commissionTitle")}</h2>
              <p className="mt-1 text-sm text-gray-600">{t("dashboard.commissionDescription")}</p>
              <label className="mt-4 block text-sm font-medium text-gray-700">{t("dashboard.commissionPercent")}</label>
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
              <div className="mt-4 rounded-2xl border-2 border-magenta-500 bg-white p-4 text-black">
                <div className="text-sm text-gray-500">{t("dashboard.totalCommission")}</div>
                <div
                  key={commissionTotal.toFixed(2)}
                  className="mt-2 rounded-xl bg-black px-4 py-3 text-2xl font-bold leading-none text-white"
                >
                  {`$${commissionTotal.toFixed(2)}`}
                </div>
              </div>
              <div className="mt-4 max-h-44 space-y-2 overflow-auto pb-3 text-sm">
                {commissionRows.map((row) => (
                  <div
                    key={`${row.saleId}-${row.itemId}`}
                    className="grid grid-cols-[1fr_auto] gap-3 rounded-xl bg-gray-50 p-3"
                  >
                    <div className="min-w-0">
                      <div className="break-words font-semibold text-black">{row.employee}</div>
                      <div className="break-all text-xs text-gray-500">{row.itemId}</div>
                    </div>
                    <div className="self-center whitespace-nowrap font-bold text-magenta-600">
                      ${row.commission.toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

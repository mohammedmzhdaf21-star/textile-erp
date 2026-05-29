import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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

  const commissionTotal = useMemo(
    () => commissionRows.reduce((sum, row) => sum + row.commission, 0),
    [commissionRows]
  );

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  async function loadItemForPrice() {
    const itemId = priceItemId.trim();
    if (!itemId) return alert("Enter or scan an item ID first.");

    try {
      const response = await api.get(`/inventory/${encodeURIComponent(itemId)}`);
      const item = response.data as { type?: string };
      const unit = item.type === "PIECE" ? "PIECE" : "METER";
      const existing = getItemMinimumPrice(itemId);
      setPriceUnit(unit);
      if (existing) setMinimumPrice(String(existing.minimumPrice));
      setPriceMessage(`${item.type || "Item"} detected. Minimum price is per ${unit === "PIECE" ? "piece" : "meter"}.`);
    } catch (error: any) {
      const body = error?.response?.data;
      setPriceMessage(body?.error ?? body?.message ?? error?.message ?? "Item not found.");
    }
  }

  function savePrice() {
    const itemId = priceItemId.trim();
    const parsedPrice = Number(minimumPrice);
    if (!itemId) return alert("Enter or scan an item ID.");
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) return alert("Enter a valid minimum price.");

    saveItemMinimumPrice({
      itemId,
      unit: priceUnit,
      minimumPrice: parsedPrice,
      updatedAt: new Date().toISOString(),
    });
    setPriceMessage(`Saved ${itemId} minimum price: $${parsedPrice.toFixed(2)} per ${priceUnit === "PIECE" ? "piece" : "meter"}.`);
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
    if (!email || !email.includes("@")) return alert("Enter a valid employee email address.");

    saveEmployeeAccessRule({
      email,
      sections: allowedSections,
      assignedWork,
      updatedAt: new Date().toISOString(),
    });
    setAccessMessage(`Saved dashboard access for ${email}.`);
  }

  async function calculateCommissions() {
    const rate = Number(commissionRate);
    if (!Number.isFinite(rate) || rate < 0) return alert("Enter a valid commission percent.");
    saveCommissionSettings({ ratePercent: rate });
    setCommissionMessage(null);

    try {
      const response = await api.get("/sales", { params: { pageSize: 200 } });
      const sales = (response.data?.sales || response.data?.items || []) as Sale[];
      const prices = readItemMinimumPrices();
      const rows: Array<{ employee: string; saleId: string; itemId: string; commission: number }> = [];

      sales.forEach((sale) => {
        const employee = sale.employee?.name || sale.employeeName || "Unknown Employee";
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
      setCommissionMessage(`Calculated ${rows.length} commission line${rows.length === 1 ? "" : "s"} at ${rate}%.`);
    } catch (error: any) {
      const body = error?.response?.data;
      setCommissionMessage(body?.error ?? body?.message ?? error?.message ?? "Failed to calculate commissions.");
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="card animate-fade-in">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-extrabold text-black">
                Welcome, <span className="text-magenta-500">{user?.name}</span>!
              </h1>
              <p className="text-gray-500 mt-1">{user?.email}</p>
            </div>
            <button onClick={handleLogout} className="btn-secondary">
              Sign Out
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
            <div className="bg-gradient-to-br from-magenta-500 to-magenta-700 text-white p-6 rounded-xl shadow-lg">
              <p className="text-sm opacity-80">Role</p>
              <p className="text-2xl font-bold mt-1">{user?.role}</p>
            </div>
            <div className="bg-black text-white p-6 rounded-xl shadow-lg">
              <p className="text-sm opacity-80">Status</p>
              <p className="text-2xl font-bold mt-1">Active</p>
            </div>
            <div className="bg-white border-2 border-magenta-500 text-black p-6 rounded-xl">
              <p className="text-sm text-gray-500">Login</p>
              <p className="text-2xl font-bold mt-1 text-magenta-500">Success!</p>
            </div>
          </div>

          <div className="mt-8 p-6 bg-gradient-to-br from-gray-50 to-white border border-gray-200 rounded-xl">
            <h2 className="text-lg font-bold text-black mb-2">
              Dashboard management
            </h2>
            <p className="text-gray-600">
              Manage minimum item prices, employee work access, and commission calculations.
            </p>
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-3">
            <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-bold text-black">Price</h2>
              <p className="mt-1 text-sm text-gray-600">
                Scan or enter an item ID and save the minimum sale price per meter or piece.
              </p>
              <label className="mt-4 block text-sm font-medium text-gray-700">QR / Item ID</label>
              <input
                value={priceItemId}
                onChange={(event) => setPriceItemId(event.target.value)}
                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                placeholder="B001-001-REDR"
              />
              <button type="button" onClick={loadItemForPrice} className="btn-secondary mt-3 w-full">
                Detect item
              </button>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Unit</label>
                  <select
                    value={priceUnit}
                    onChange={(event) => setPriceUnit(event.target.value as "METER" | "PIECE")}
                    className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="METER">Meter</option>
                    <option value="PIECE">Piece</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Minimum price</label>
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
                Save price
              </button>
              {priceMessage && <p className="mt-3 text-sm text-magenta-600">{priceMessage}</p>}
              <div className="mt-4 max-h-40 space-y-2 overflow-auto text-sm">
                {Object.values(itemPrices).map((price) => (
                  <div key={price.itemId} className="rounded-xl bg-gray-50 p-3">
                    <div className="break-all font-semibold text-black">{price.itemId}</div>
                    <div className="text-gray-600">
                      ${price.minimumPrice.toFixed(2)} / {price.unit === "PIECE" ? "piece" : "meter"}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-bold text-black">Employee access</h2>
              <p className="mt-1 text-sm text-gray-600">
                Assign work and choose which dashboard sections an employee can see.
              </p>
              <label className="mt-4 block text-sm font-medium text-gray-700">Employee email</label>
              <input
                value={employeeEmail}
                onChange={(event) => setEmployeeEmail(event.target.value)}
                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                placeholder="employee@textile.com"
              />
              <label className="mt-4 block text-sm font-medium text-gray-700">Assigned work</label>
              <textarea
                value={assignedWork}
                onChange={(event) => setAssignedWork(event.target.value)}
                className="mt-1 min-h-20 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                placeholder="Sales floor, inventory checks, exchange desk..."
              />
              <div className="mt-4 grid max-h-48 grid-cols-2 gap-2 overflow-auto pr-1">
                {dashboardSections.map((section) => (
                  <label key={section.key} className="flex items-center gap-2 rounded-xl bg-gray-50 p-2 text-sm">
                    <input
                      type="checkbox"
                      checked={allowedSections.includes(section.key)}
                      onChange={() => toggleSection(section.key)}
                    />
                    <span>{section.label}</span>
                  </label>
                ))}
              </div>
              <button type="button" onClick={saveAccessRule} className="btn-primary mt-4 w-full">
                Save employee access
              </button>
              {accessMessage && <p className="mt-3 text-sm text-magenta-600">{accessMessage}</p>}
              <div className="mt-4 max-h-32 space-y-2 overflow-auto text-xs text-gray-600">
                {Object.values(employeeAccessRules).map((rule) => (
                  <div key={rule.email} className="rounded-xl bg-gray-50 p-2">
                    <div className="font-semibold text-black">{rule.email}</div>
                    <div>{rule.sections.length} section(s) · {rule.assignedWork || "No work note"}</div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-bold text-black">Commission</h2>
              <p className="mt-1 text-sm text-gray-600">
                Calculate employee commission from sales where sold price is above saved minimum item price.
              </p>
              <label className="mt-4 block text-sm font-medium text-gray-700">Commission percent</label>
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
                className="mt-4 flex w-full items-center justify-between rounded-lg bg-magenta-500 px-6 py-3 text-left font-semibold text-white shadow-md transition-all duration-200 hover:bg-magenta-600"
              >
                <span>Run commission</span>
                <span aria-hidden="true">→</span>
              </button>
              {commissionMessage && <p className="mt-3 text-sm text-magenta-600">{commissionMessage}</p>}
              <div className="mt-4 rounded-2xl border-2 border-magenta-500 bg-white p-4 text-black">
                <div className="text-sm text-gray-500">Total commission</div>
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

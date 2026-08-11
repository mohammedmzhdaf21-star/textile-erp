import { useState } from "react";
import { useTranslation } from "react-i18next";
import QrScanInput from "../components/QrScanInput";
import api from "../lib/api";
import {
  getItemMinimumPrice,
  readItemMinimumPrices,
  saveItemMinimumPrice,
} from "../lib/dashboardSettings";

export default function ItemPricing() {
  const { t } = useTranslation();
  const [priceItemId, setPriceItemId] = useState("");
  const [priceUnit, setPriceUnit] = useState<"METER" | "PIECE">("METER");
  const [minimumPrice, setMinimumPrice] = useState("0");
  const [priceMessage, setPriceMessage] = useState<string | null>(null);
  const itemPrices = readItemMinimumPrices();

  const unitLabel = (unit: "METER" | "PIECE") =>
    unit === "PIECE" ? t("common.pieceSingular") : t("common.meterSingular");

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
      setPriceMessage(body?.error ?? body?.message ?? t("dashboard.itemNotFound"));
    }
  }

  function savePrice() {
    const itemId = priceItemId.trim();
    const parsedPrice = Number(minimumPrice);
    if (!itemId) return alert(t("dashboard.enterItemId"));
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      return alert(t("dashboard.enterValidMinimumPrice"));
    }

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

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-black">{t("nav.itemPricing")}</h1>
        <p className="mt-1 text-sm text-gray-600">{t("dashboard.priceDescription")}</p>
      </div>

      <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <label className="block text-sm font-medium text-gray-700">{t("dashboard.qrItemId")}</label>
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

        <div className="mt-6 max-h-96 space-y-2 overflow-auto text-sm">
          <h2 className="text-sm font-semibold text-gray-800">{t("itemPricing.savedPrices")}</h2>
          {Object.values(itemPrices).length === 0 ? (
            <p className="text-gray-500">{t("itemPricing.noSavedPrices")}</p>
          ) : (
            Object.values(itemPrices).map((price) => (
              <div key={price.itemId} className="rounded-xl bg-gray-50 p-3">
                <div className="break-all font-semibold text-black">{price.itemId}</div>
                <div className="text-gray-600">
                  {t("dashboard.pricePerUnit", {
                    price: price.minimumPrice.toFixed(2),
                    unit: unitLabel(price.unit),
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

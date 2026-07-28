import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import QrScanInput from '../components/QrScanInput';
import api from '../lib/api';
import { getCurrentUser } from '../lib/auth';
import {
  aggregateDetailedStockBreakdown,
  aggregateFamilyStock,
  BRANCH_CODE_BY_ID,
  BRANCH_DESTINATIONS,
  BRANCH_ID_BY_CODE,
  formatDetailedStockBreakdownLine,
  formatStockAmountLabel,
  formatSubCode,
  formatTotalStockLabel,
  getItemTypeLabel,
  hasStockForRow,
  hasStockForType,
  parseInventoryItemId,
  type BranchDestinationCode,
  type BranchStockRow,
  type InventoryItemType,
  type InventoryStockItem,
} from '../lib/inventoryCodes';
import { printInventoryItemLabel } from '../lib/inventoryLabel';
import {
  formatInventoryPackageAmount,
  formatPackageStockSummary,
  formatPackageSummary,
  parsePackageComponents,
  resolvePackageComponentStock,
} from '../lib/piecePackages';

type Color = { id: string; name: string; hexCode?: string };
type InventoryItemView = InventoryStockItem & {
  costPrice?: number | string;
  branch?: { id: string; name: string };
  isPiecePackage?: boolean;
  packageComponents?: unknown;
  packageComponentStock?: unknown;
  version?: number;
};

type EditFormState = {
  code: string;
  subCode: string;
  colorId: string;
  meters: string;
  pieceLength: string;
  quantity: string;
};

const ITEM_TYPES: InventoryItemType[] = ['ROLL', 'PIECE', 'REMANENT'];

const InventoryView: React.FC = () => {
  const { t } = useTranslation();
  const currentUser = getCurrentUser();
  const canManageInventory =
    currentUser?.role === 'ADMIN' || currentUser?.role === 'MANAGER';

  const [branch, setBranch] = useState<BranchDestinationCode | null>(null);
  const [items, setItems] = useState<InventoryItemView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [colors, setColors] = useState<Color[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editItem, setEditItem] = useState<InventoryItemView | null>(null);
  const [editForm, setEditForm] = useState<EditFormState | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [printingItemId, setPrintingItemId] = useState<string | null>(null);

  const [scanQuery, setScanQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchFamilyCode, setSearchFamilyCode] = useState<number | null>(null);
  const [searchColor, setSearchColor] = useState<Color | null>(null);
  const [searchSubCode, setSearchSubCode] = useState<number | null>(null);
  const [searchScannedId, setSearchScannedId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<InventoryItemType>('ROLL');
  const [familyStock, setFamilyStock] = useState<BranchStockRow[]>([]);
  const [stockBreakdownTarget, setStockBreakdownTarget] = useState<'total' | string | null>(null);

  const loadItems = useCallback(() => {
    setLoading(true);
    setError(null);
    return api
      .get('/inventory', {
        params: branch ? { branchId: BRANCH_ID_BY_CODE[branch], pageSize: 200 } : { pageSize: 200 },
      })
      .then((res) => {
        const data = res.data;
        const list = Array.isArray(data) ? data : data?.items ?? data?.inventory ?? [];
        setItems(list as InventoryItemView[]);
      })
      .catch((err) => {
        const status = err?.response?.status;
        const body = err?.response?.data;
        setError(
          t('common.requestFailed', {
            status: status ? t('common.requestFailedStatus', { status }) : '',
            message: body?.error ?? body?.message ?? err?.message ?? t('inventory.failedToLoad'),
          })
        );
        console.error('Inventory load error:', err);
      })
      .finally(() => setLoading(false));
  }, [branch]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  useEffect(() => {
    if (!canManageInventory) return;
    api
      .get('/inventory/colors')
      .then((res) => setColors(Array.isArray(res.data) ? res.data : []))
      .catch(() => setColors([]));
  }, [canManageInventory]);

  const selectedItems = useMemo(
    () => items.filter((item) => selectedIds.includes(item.id)),
    [items, selectedIds]
  );

  const toggleSelected = (itemId: string) => {
    setSelectedIds((current) =>
      current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId]
    );
  };

  const openEditForItem = (item: InventoryItemView) => {
    setEditItem(item);
    setEditForm({
      code: String(item.code),
      subCode: String(item.subCode ?? item.costPrice ?? 0),
      colorId: item.colorId,
      meters: String(item.meters ?? 0),
      pieceLength: String(item.pieceLength ?? 0),
      quantity: String(item.quantity ?? 0),
    });
    setActionError(null);
    setActionMessage(null);
  };

  const closeEditModal = () => {
    setEditItem(null);
    setEditForm(null);
  };

  const handleReprintQr = async (item: InventoryItemView) => {
    setPrintingItemId(item.id);
    setActionError(null);
    try {
      const printed = await printInventoryItemLabel(item, t);
      if (!printed) {
        setActionError(t('errors.allowPopups'));
        return;
      }
      setActionMessage(t('inventory.reprintQrSent', { id: item.id }));
    } catch (printError) {
      console.error('Failed to print inventory QR label', printError);
      setActionError(t('inventory.reprintQrFailed'));
    } finally {
      setPrintingItemId(null);
    }
  };

  const findItemInFamilyStock = (itemId: string) =>
    familyStock.flatMap((row) => row.items).find((item) => item.id === itemId) ?? null;

  const removeSelectedItems = async () => {
    if (selectedItems.length === 0) return;
    const label =
      selectedItems.length === 1
        ? t('inventory.removeConfirmSingle', { id: selectedItems[0].id })
        : t('inventory.removeConfirmMultiple', { count: selectedItems.length });
    if (!window.confirm(`${label}\n\n${t('inventory.removeConfirmNote')}`)) return;

    setIsRemoving(true);
    setActionError(null);
    setActionMessage(null);

    try {
      for (const item of selectedItems) {
        await api.post(`/inventory/${encodeURIComponent(item.id)}/archive`);
      }
      setSelectedIds([]);
      setActionMessage(
        selectedItems.length === 1
          ? t('inventory.itemRemoved')
          : t('inventory.itemsRemoved', { count: selectedItems.length })
      );
      await loadItems();
    } catch (err: any) {
      const body = err?.response?.data;
      setActionError(body?.error ?? body?.message ?? err?.message ?? t('inventory.failedToRemove'));
    } finally {
      setIsRemoving(false);
    }
  };

  const saveEdit = async () => {
    if (!editItem || !editForm) return;

    const familyCode = Number(editForm.code);
    const subCode = Number(editForm.subCode);
    if (!Number.isFinite(familyCode) || familyCode <= 0) {
      setActionError(t('inventory.enterValidFamilyCode'));
      return;
    }
    if (!Number.isFinite(subCode) || subCode < 0) {
      setActionError(t('inventory.enterValidSubCode'));
      return;
    }
    if (!editForm.colorId) {
      setActionError(t('inventory.chooseColor'));
      return;
    }

    const payload: Record<string, unknown> = {
      version: editItem.version ?? 0,
      code: familyCode,
      subCode,
      colorId: editForm.colorId,
      costPrice: subCode,
    };

    if (editItem.type === 'ROLL' || editItem.type === 'REMANENT') {
      const meters = Number(editForm.meters);
      if (!Number.isFinite(meters) || meters <= 0) {
        setActionError(t('inventory.enterValidMeters'));
        return;
      }
      payload.meters = meters;
    }

    if (editItem.type === 'PIECE' && !editItem.isPiecePackage) {
      const pieceLength = Number(editForm.pieceLength);
      const quantity = Number(editForm.quantity);
      if (!Number.isFinite(pieceLength) || pieceLength <= 0) {
        setActionError(t('inventory.enterValidPieceLength'));
        return;
      }
      if (!Number.isFinite(quantity) || quantity < 0 || !Number.isInteger(quantity)) {
        setActionError(t('inventory.enterValidPieceQuantity'));
        return;
      }
      payload.pieceLength = pieceLength;
      payload.quantity = quantity;
    }

    if (editItem.type === 'PIECE' && editItem.isPiecePackage) {
      const quantity = Number(editForm.quantity);
      if (!Number.isFinite(quantity) || quantity < 0 || !Number.isInteger(quantity)) {
        setActionError(t('inventory.enterValidPackageQuantity'));
        return;
      }
      payload.quantity = quantity;
    }

    setIsSavingEdit(true);
    setActionError(null);

    try {
      const response = await api.patch(`/inventory/${encodeURIComponent(editItem.id)}`, payload);
      const updatedId = response.data?.item?.id ?? editItem.id;
      setActionMessage(
        updatedId === editItem.id
          ? t('inventory.updatedItem', { id: updatedId })
          : t('inventory.updatedItemNewId', { id: updatedId })
      );
      setSelectedIds((current) => current.map((id) => (id === editItem.id ? updatedId : id)));
      closeEditModal();
      await loadItems();
    } catch (err: any) {
      const body = err?.response?.data;
      setActionError(body?.error ?? body?.message ?? err?.message ?? t('inventory.failedToUpdate'));
    } finally {
      setIsSavingEdit(false);
    }
  };

  const runQrSearch = async (rawValue?: string) => {
    const query = (rawValue ?? scanQuery).trim();
    if (!query) {
      setSearchError(t('inventory.scanOrEnterQr'));
      return;
    }

    setSearchLoading(true);
    setSearchError(null);

    try {
      let familyCode: number | null = null;
      let colorId: string | null = null;
      let colorName: string | null = null;
      let subCode: number | null = null;
      let scannedType: InventoryItemType = 'ROLL';

      try {
        const itemResponse = await api.get(`/inventory/${encodeURIComponent(query)}`);
        const item = itemResponse.data as InventoryItemView;
        familyCode = Number(item.code);
        colorId = item.colorId;
        colorName = item.color?.name ?? null;
        subCode = Number(item.subCode ?? item.costPrice ?? 0);
        scannedType = (item.type as InventoryItemType) || 'ROLL';
        setSearchScannedId(item.id);
      } catch {
        const parsed = parseInventoryItemId(query);
        if (!parsed.familyCode) {
          throw new Error(t('inventory.couldNotReadFamilyCode'));
        }
        familyCode = parsed.familyCode;
        subCode = parsed.subCode ?? null;
        scannedType = parsed.type ?? 'ROLL';
        setSearchScannedId(query);

        const listResponse = await api.get('/inventory', {
          params: { code: familyCode, pageSize: 200 },
        });
        const list = Array.isArray(listResponse.data)
          ? listResponse.data
          : listResponse.data?.items ?? [];

        const colorMatches = (list as InventoryItemView[]).filter((item) => {
          if (!parsed.colorCode) return true;
          const colorLabel = item.color?.name
            ? item.color.name.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 3)
            : '';
          return colorLabel.startsWith(parsed.colorCode.slice(0, 1));
        });

        const matched = colorMatches[0] ?? (list as InventoryItemView[])[0];
        if (!matched) {
          throw new Error(t('inventory.noInventoryForFamily', { code: familyCode }));
        }
        colorId = matched.colorId;
        colorName = matched.color?.name ?? null;
      }

      if (!familyCode || !colorId) {
        throw new Error(t('inventory.couldNotDetermineScan'));
      }

      const stockResponse = await api.get('/inventory', {
        params: { code: familyCode, colorId, pageSize: 200 },
      });
      const stockItems = Array.isArray(stockResponse.data)
        ? stockResponse.data
        : stockResponse.data?.items ?? [];

      setSearchFamilyCode(familyCode);
      setSearchColor({ id: colorId, name: colorName ?? t('common.unknownColor') });
      setSearchSubCode(subCode);
      setSelectedType(scannedType);
      setFamilyStock(aggregateFamilyStock(stockItems as InventoryStockItem[], familyCode, colorId));
      setStockBreakdownTarget(null);
      setScanQuery(query);
    } catch (err: any) {
      const body = err?.response?.data;
      setSearchError(body?.error ?? err?.message ?? t('inventory.searchFailed'));
      setSearchFamilyCode(null);
      setSearchColor(null);
      setSearchSubCode(null);
      setSearchScannedId(null);
      setFamilyStock([]);
      setStockBreakdownTarget(null);
    } finally {
      setSearchLoading(false);
    }
  };

  const branchesWithStock = useMemo(
    () => familyStock.filter((row) => hasStockForRow(row, selectedType)),
    [familyStock, selectedType]
  );

  const clearSearch = () => {
    setScanQuery('');
    setSearchError(null);
    setSearchFamilyCode(null);
    setSearchColor(null);
    setSearchSubCode(null);
    setSearchScannedId(null);
    setFamilyStock([]);
                    setStockBreakdownTarget(null);
  };

  const overallHasStock = useMemo(
    () => hasStockForType(familyStock, selectedType),
    [familyStock, selectedType]
  );

  const activeStockBreakdown = useMemo(() => {
    if (!stockBreakdownTarget) return [];
    if (stockBreakdownTarget === 'total') {
      return aggregateDetailedStockBreakdown(familyStock, selectedType);
    }
    return aggregateDetailedStockBreakdown(familyStock, selectedType, stockBreakdownTarget);
  }, [familyStock, selectedType, stockBreakdownTarget]);

  const stockBreakdownTitle = useMemo(() => {
    if (stockBreakdownTarget === 'total') {
      return t('inventory.allBranchesTotal', {
        amount: formatTotalStockLabel(t, familyStock, selectedType),
      });
    }
    if (stockBreakdownTarget) {
      const branch = BRANCH_DESTINATIONS.find((entry) => entry.id === stockBreakdownTarget);
      const row = familyStock.find((entry) => entry.branchId === stockBreakdownTarget);
      const amount = row ? formatStockAmountLabel(t, row, selectedType) : '0';
      return t('inventory.branchAmount', {
        branch: t(branch?.labelKey ?? 'branches.labelLabel'),
        amount,
      });
    }
    return '';
  }, [familyStock, selectedType, stockBreakdownTarget, t]);

  const stockBreakdownHeading = useMemo(() => {
    if (selectedType === 'PIECE') return t('inventory.pieceBreakdown');
    if (selectedType === 'ROLL') return t('inventory.rollBreakdown');
    return t('inventory.remnantBreakdown');
  }, [selectedType, t]);

  const stockBreakdownHint = useMemo(() => {
    if (selectedType === 'PIECE') return t('inventory.pieceBreakdownHint');
    if (selectedType === 'ROLL') return t('inventory.rollBreakdownHint');
    return t('inventory.remnantBreakdownHint');
  }, [selectedType, t]);

  const packageStockRows = useMemo(() => {
    if (selectedType !== 'PIECE' || searchFamilyCode === null || !searchColor) return [];
    return familyStock.flatMap((row) =>
      row.items
        .filter((item) => item.isPiecePackage)
        .map((item) => ({
          branchId: row.branchId,
          branchLabel: t(row.branchLabelKey),
          branchCode: row.branchCode,
          item,
          packageSummary: formatPackageSummary(parsePackageComponents(item.packageComponents)),
          stockSummary: formatPackageStockSummary(
            resolvePackageComponentStock({
              packageComponents: item.packageComponents,
              packageComponentStock: item.packageComponentStock,
              quantity: Number(item.quantity ?? 0),
            })
          ),
        }))
    );
  }, [familyStock, searchColor, searchFamilyCode, selectedType]);

  const toggleStockBreakdown = (target: 'total' | string) => {
    setStockBreakdownTarget((current) => (current === target ? null : target));
  };

  return (
    <div className="p-4">
      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-black">{t('inventory.title')}</h2>
          <p className="text-sm text-gray-500">{t('inventory.subtitle')}</p>
        </div>
        <Link to="/item-input" className="btn-primary text-center">
          {t('nav.newItem')}
        </Link>
      </div>

      <section className="mb-6 rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-black">{t('inventory.qrSearchTitle')}</h3>
        <p className="mt-1 text-sm text-gray-500">{t('inventory.qrSearchTitleDescription')}</p>
        <form
          className="mt-4 flex flex-col gap-3 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            runQrSearch();
          }}
        >
          <QrScanInput
            className="flex-1"
            inputClassName="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm"
            value={scanQuery}
            onChange={setScanQuery}
            onScan={(value) => {
              setScanQuery(value);
              void runQrSearch(value);
            }}
            placeholder={t('inventory.scanPlaceholder')}
            autoFocus
          />
          <button type="submit" className="btn-primary" disabled={searchLoading}>
            {searchLoading ? t('common.searching') : t('common.search')}
          </button>
          {searchFamilyCode !== null && (
            <button
              type="button"
              className="rounded-xl border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-700"
              onClick={clearSearch}
            >
              {t('common.clear')}
            </button>
          )}
        </form>

        {searchError && (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {searchError}
          </div>
        )}

        {searchFamilyCode !== null && searchColor && (
          <div className="mt-5 rounded-2xl border border-gray-200 bg-gray-50 p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-black">
                  {t('inventory.familyColor', { code: searchFamilyCode, color: searchColor.name })}
                  {searchSubCode !== null ? t('inventory.subCodePrice', { price: formatSubCode(searchSubCode) }) : ''}
                </p>
                {searchScannedId && (
                  <p className="mt-1 break-all text-xs text-gray-500">{t('inventory.scanned', { id: searchScannedId })}</p>
                )}
              </div>
              <p className="text-sm text-gray-600">
                {t('inventory.totalType', { type: getItemTypeLabel(t, selectedType).toLowerCase() })}{' '}
                {overallHasStock ? (
                  <button
                    type="button"
                    onClick={() => toggleStockBreakdown('total')}
                    className="font-bold text-black underline decoration-dotted underline-offset-4 hover:text-magenta-600"
                  >
                    {formatTotalStockLabel(t, familyStock, selectedType)}
                  </button>
                ) : (
                  <strong>{formatTotalStockLabel(t, familyStock, selectedType)}</strong>
                )}
              </p>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {ITEM_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => {
                    setSelectedType(type);
                    setStockBreakdownTarget(null);
                  }}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                    selectedType === type
                      ? 'bg-black text-white'
                      : 'border border-gray-300 bg-white text-gray-700 hover:border-black'
                  }`}
                >
                  {getItemTypeLabel(t, type)}
                </button>
              ))}
            </div>

            {packageStockRows.length > 0 && selectedType === 'PIECE' && (
              <div className="mt-4 rounded-2xl border border-magenta-200 bg-magenta-50 p-4">
                <p className="text-sm font-semibold text-black">{t('inventory.piecePackageStock')}</p>
                <p className="mt-1 text-xs text-gray-600">{t('inventory.piecePackageStockDescription')}</p>
                <div className="mt-3 space-y-2">
                  {packageStockRows.map((entry) => (
                    <div
                      key={`${entry.branchId}-${entry.item.id}`}
                      className="rounded-xl border border-white bg-white px-4 py-3 text-sm"
                    >
                      <p className="font-semibold text-black">
                        {entry.branchLabel} · ${formatSubCode(Number(entry.item.subCode ?? entry.item.costPrice ?? 0))}
                      </p>
                      <p className="mt-1 text-gray-700">{t('inventory.setLabel', { summary: entry.packageSummary })}</p>
                      <p className="mt-1 text-gray-700">
                        {t('inventory.sealedPackages', {
                          count: Number(entry.item.quantity ?? 0),
                          stock: entry.stockSummary,
                        })}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {stockBreakdownTarget && activeStockBreakdown.length > 0 && (
              <div className="mt-4 rounded-2xl border border-black bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-black">{stockBreakdownHeading}</p>
                  <button
                    type="button"
                    className="text-xs font-semibold text-gray-500 hover:text-black"
                    onClick={() => setStockBreakdownTarget(null)}
                  >
                    {t('common.close')}
                  </button>
                </div>
                <p className="mt-1 text-xs text-gray-500">{stockBreakdownTitle}</p>
                <p className="mt-1 text-xs text-gray-500">{stockBreakdownHint}</p>
                <div className="mt-4 space-y-2">
                  {activeStockBreakdown.map((entry) => (
                    <div
                      key={entry.key}
                      className="flex flex-col gap-1 rounded-xl border border-gray-200 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                    >
                      <span className="font-medium text-gray-800">
                        {formatDetailedStockBreakdownLine(t, selectedType, entry)}
                      </span>
                      <div className="flex flex-col items-start gap-1 text-xs text-gray-500 sm:items-end">
                        {stockBreakdownTarget === 'total' && entry.branchCode && (
                          <span>
                            {entry.branchCode === 'S'
                              ? t('common.storage')
                              : t('branches.label', { code: entry.branchCode })}
                          </span>
                        )}
                        {entry.itemId && (
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="break-all font-mono">{entry.itemId}</span>
                            {(() => {
                              const stockItem = findItemInFamilyStock(entry.itemId);
                              if (!stockItem) return null;
                              return (
                                <button
                                  type="button"
                                  className="rounded border border-gray-300 px-2 py-0.5 text-[11px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                                  disabled={printingItemId === entry.itemId}
                                  onClick={() => void handleReprintQr(stockItem as InventoryItemView)}
                                >
                                  {printingItemId === entry.itemId
                                    ? t('common.loading')
                                    : t('inventory.reprintQr')}
                                </button>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {BRANCH_DESTINATIONS.map((destination) => {
                const row = familyStock.find((entry) => entry.branchId === destination.id);
                const amount = row ? formatStockAmountLabel(t, row, selectedType) : '0';
                const hasStock = row ? hasStockForRow(row, selectedType) : false;
                const isClickableStock = hasStock && row;

                return (
                  <div
                    key={destination.id}
                    className={`rounded-2xl border p-4 ${
                      hasStock ? 'border-black bg-white' : 'border-gray-200 bg-white/70'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-black">{t(destination.labelKey)}</p>
                        <p className="text-xs text-gray-500">
                          {destination.code === 'S'
                            ? t('common.storage')
                            : t('branches.label', { code: destination.code })}
                        </p>
                      </div>
                      <div className="text-right">
                        {isClickableStock ? (
                          <button
                            type="button"
                            onClick={() => toggleStockBreakdown(destination.id)}
                            className={`text-lg font-bold underline decoration-dotted underline-offset-4 ${
                              stockBreakdownTarget === destination.id
                                ? 'text-magenta-600'
                                : 'text-black hover:text-magenta-600'
                            }`}
                          >
                            {amount}
                          </button>
                        ) : (
                          <p className="text-lg font-bold text-black">{amount}</p>
                        )}
                        <p className="text-xs text-gray-500">{getItemTypeLabel(t, selectedType)}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {branchesWithStock.length === 0 && (
              <p className="mt-4 text-sm text-gray-500">
                {t('inventory.noStockFound', {
                  type: getItemTypeLabel(t, selectedType).toLowerCase(),
                  code: searchFamilyCode,
                  color: searchColor.name,
                })}
              </p>
            )}
          </div>
        )}
      </section>

      <section className="mb-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {BRANCH_DESTINATIONS.map((destination) => (
            <button
              key={destination.code}
              className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${
                branch === destination.code
                  ? 'bg-black text-white'
                  : 'border border-gray-200 bg-white text-gray-800 hover:border-black'
              }`}
              onClick={() => setBranch(branch === destination.code ? null : destination.code)}
            >
              {destination.code === 'S'
                ? t('common.storage')
                : t('branches.label', { code: destination.code })}
            </button>
          ))}
        </div>
        <p className="mt-2 text-sm text-gray-500">
          {t('common.tableFilter', {
            filter: branch ? t('branches.label', { code: branch }) : t('common.allBranches'),
          })}
        </p>
      </section>

      {loading && <div className="text-gray-600">{t('inventory.loadingInventory')}</div>}
      {error && <div className="mb-4 text-red-600">{t('common.error')}: {error}</div>}
      {actionMessage && (
        <div className="mb-4 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
          {actionMessage}
        </div>
      )}
      {actionError && (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {actionError}
        </div>
      )}

      {canManageInventory && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-600">
            {selectedIds.length === 0
              ? t('inventory.selectItemsHint')
              : t('inventory.itemsSelected', { count: selectedIds.length })}
          </p>
          <button
            type="button"
            className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-800 disabled:opacity-50"
            disabled={selectedIds.length !== 1 || isSavingEdit || isRemoving}
            onClick={() => {
              const item = selectedItems[0];
              if (item) openEditForItem(item);
            }}
          >
            {t('inventory.editSelected')}
          </button>
          <button
            type="button"
            className="rounded-xl border border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-50"
            disabled={selectedIds.length === 0 || isSavingEdit || isRemoving}
            onClick={removeSelectedItems}
          >
            {isRemoving ? t('common.removing') : t('inventory.removeSelected')}
          </button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full rounded-lg border border-gray-200 bg-white">
          <thead>
            <tr className="bg-gray-50">
              {canManageInventory && (
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">{t('common.select')}</th>
              )}
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">{t('common.id')}</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">{t('branches.labelLabel')}</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">{t('common.family')}</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">{t('common.subCode')}</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">{t('common.type')}</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">{t('common.color')}</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">{t('common.amount')}</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">{t('common.packagePieces')}</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">{t('inventory.qrLabel')}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const price = Number(item.subCode ?? item.costPrice ?? 0);
              const packageAmount = formatInventoryPackageAmount(item);
              const amount = packageAmount
                ? packageAmount
                : item.type === 'PIECE'
                  ? `${item.quantity ?? 0} pc × ${item.pieceLength ?? 0} m`
                  : `${item.meters ?? 0} m`;
              const packagePieces = item.isPiecePackage
                ? formatPackageSummary(parsePackageComponents(item.packageComponents))
                : '—';

              return (
                <tr
                  key={item.id}
                  className={`border-t transition-colors hover:bg-gray-50 ${
                    selectedIds.includes(item.id) ? 'bg-magenta-50' : ''
                  }`}
                >
                  {canManageInventory && (
                    <td className="px-4 py-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(item.id)}
                        onChange={() => toggleSelected(item.id)}
                        aria-label={`Select ${item.id}`}
                      />
                    </td>
                  )}
                  <td className="px-4 py-2 text-sm text-gray-800">{item.id}</td>
                  <td className="px-4 py-2 text-sm text-gray-800">
                    {BRANCH_CODE_BY_ID[item.branchId] ?? item.branch?.name ?? item.branchId}
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-800">{item.code}</td>
                  <td className="px-4 py-2 text-sm text-gray-800">${formatSubCode(price)}</td>
                  <td className="px-4 py-2 text-sm text-gray-800">
                    {getItemTypeLabel(t, item.type as InventoryItemType) ?? item.type}
                    {item.isPiecePackage ? t('inventory.packageSuffix') : ''}
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-800">{item.color?.name ?? '-'}</td>
                  <td className="px-4 py-2 text-sm text-gray-800">{amount}</td>
                  <td className="px-4 py-2 text-sm text-gray-800">{packagePieces}</td>
                  <td className="px-4 py-2">
                    <button
                      type="button"
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                      disabled={printingItemId === item.id}
                      onClick={() => void handleReprintQr(item)}
                    >
                      {printingItemId === item.id ? t('common.loading') : t('inventory.reprintQr')}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {items.length === 0 && !loading && (
        <div className="mt-4 text-center text-gray-500">
          {t('inventory.noItemsPrefix')}{' '}
          <Link to="/item-input" className="font-semibold text-magenta-600">{t('nav.newItem')}</Link>{' '}
          {t('inventory.noItemsSuffix')}
        </div>
      )}

      {editItem && editForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 shadow-xl">
            <h3 className="text-xl font-semibold text-black">{t('inventory.editItemTitle')}</h3>
            <p className="mt-1 break-all text-sm text-gray-500">{editItem.id}</p>
            <p className="mt-2 text-sm text-gray-600">{t('inventory.editItemDescription')}</p>

            <div className="mt-4 grid gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">{t('inventory.familyCode')}</label>
                <input
                  type="number"
                  min="1"
                  value={editForm.code}
                  onChange={(event) =>
                    setEditForm((current) => current && { ...current, code: event.target.value })
                  }
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">{t('inventory.subCodePriceLabel')}</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={editForm.subCode}
                  onChange={(event) =>
                    setEditForm((current) => current && { ...current, subCode: event.target.value })
                  }
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">{t('common.color')}</label>
                <select
                  value={editForm.colorId}
                  onChange={(event) =>
                    setEditForm((current) => current && { ...current, colorId: event.target.value })
                  }
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                >
                  {colors.map((color) => (
                    <option key={color.id} value={color.id}>
                      {color.name}
                    </option>
                  ))}
                </select>
              </div>

              {(editItem.type === 'ROLL' || editItem.type === 'REMANENT') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700">{t('common.meters')}</label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={editForm.meters}
                    onChange={(event) =>
                      setEditForm((current) => current && { ...current, meters: event.target.value })
                    }
                    className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
              )}

              {editItem.type === 'PIECE' && !editItem.isPiecePackage && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">{t('inventory.pieceLength')}</label>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={editForm.pieceLength}
                      onChange={(event) =>
                        setEditForm((current) =>
                          current && { ...current, pieceLength: event.target.value }
                        )
                      }
                      className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">{t('common.quantity')}</label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={editForm.quantity}
                      onChange={(event) =>
                        setEditForm((current) =>
                          current && { ...current, quantity: event.target.value }
                        )
                      }
                      className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                    />
                  </div>
                </>
              )}

              {editItem.type === 'PIECE' && editItem.isPiecePackage && (
                <div>
                  <label className="block text-sm font-medium text-gray-700">{t('inventory.packageQuantity')}</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={editForm.quantity}
                    onChange={(event) =>
                      setEditForm((current) =>
                        current && { ...current, quantity: event.target.value }
                      )
                    }
                    className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
              )}
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                className="btn-primary"
                disabled={isSavingEdit}
                onClick={saveEdit}
              >
                {isSavingEdit ? t('common.saving') : t('common.saveChanges')}
              </button>
              <button
                type="button"
                className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 disabled:opacity-50"
                disabled={isSavingEdit || printingItemId === editItem.id}
                onClick={() => void handleReprintQr(editItem)}
              >
                {printingItemId === editItem.id ? t('common.loading') : t('inventory.reprintQr')}
              </button>
              <button
                type="button"
                className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700"
                onClick={closeEditModal}
                disabled={isSavingEdit}
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InventoryView;

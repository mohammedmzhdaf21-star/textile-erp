import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { getCurrentUser } from '../lib/auth';
import {
  aggregateFamilyStock,
  aggregateStockBreakdown,
  BRANCH_CODE_BY_ID,
  BRANCH_DESTINATIONS,
  BRANCH_ID_BY_CODE,
  formatStockBreakdownLine,
  formatSubCode,
  hasStockForType,
  ITEM_TYPE_LABELS,
  parseInventoryItemId,
  stockAmountForType,
  totalStockForType,
  type BranchDestinationCode,
  type BranchStockRow,
  type InventoryItemType,
  type InventoryStockItem,
} from '../lib/inventoryCodes';
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
          `Request failed${status ? ` (status ${status})` : ''}: ${
            body?.error ?? body?.message ?? err?.message ?? 'Failed to load inventory'
          }`
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

  const removeSelectedItems = async () => {
    if (selectedItems.length === 0) return;
    const label =
      selectedItems.length === 1
        ? `Remove item ${selectedItems[0].id}?`
        : `Remove ${selectedItems.length} selected items?`;
    if (!window.confirm(`${label}\n\nThis archives the item(s) from inventory.`)) return;

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
          ? 'Item removed from inventory.'
          : `${selectedItems.length} items removed from inventory.`
      );
      await loadItems();
    } catch (err: any) {
      const body = err?.response?.data;
      setActionError(body?.error ?? body?.message ?? err?.message ?? 'Failed to remove item(s).');
    } finally {
      setIsRemoving(false);
    }
  };

  const saveEdit = async () => {
    if (!editItem || !editForm) return;

    const familyCode = Number(editForm.code);
    const subCode = Number(editForm.subCode);
    if (!Number.isFinite(familyCode) || familyCode <= 0) {
      setActionError('Enter a valid family code.');
      return;
    }
    if (!Number.isFinite(subCode) || subCode < 0) {
      setActionError('Enter a valid sub code price.');
      return;
    }
    if (!editForm.colorId) {
      setActionError('Choose a color.');
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
        setActionError('Enter valid meters.');
        return;
      }
      payload.meters = meters;
    }

    if (editItem.type === 'PIECE' && !editItem.isPiecePackage) {
      const pieceLength = Number(editForm.pieceLength);
      const quantity = Number(editForm.quantity);
      if (!Number.isFinite(pieceLength) || pieceLength <= 0) {
        setActionError('Enter valid piece length.');
        return;
      }
      if (!Number.isFinite(quantity) || quantity < 0 || !Number.isInteger(quantity)) {
        setActionError('Enter a valid whole piece quantity.');
        return;
      }
      payload.pieceLength = pieceLength;
      payload.quantity = quantity;
    }

    if (editItem.type === 'PIECE' && editItem.isPiecePackage) {
      const quantity = Number(editForm.quantity);
      if (!Number.isFinite(quantity) || quantity < 0 || !Number.isInteger(quantity)) {
        setActionError('Enter a valid whole package quantity.');
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
          ? `Updated item ${updatedId}.`
          : `Updated item. New ID: ${updatedId}`
      );
      setSelectedIds((current) => current.map((id) => (id === editItem.id ? updatedId : id)));
      closeEditModal();
      await loadItems();
    } catch (err: any) {
      const body = err?.response?.data;
      setActionError(body?.error ?? body?.message ?? err?.message ?? 'Failed to update item.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const runQrSearch = async (rawValue?: string) => {
    const query = (rawValue ?? scanQuery).trim();
    if (!query) {
      setSearchError('Scan or enter a QR item ID.');
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
          throw new Error('Could not read family code from this QR. Use a valid inventory item ID.');
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
          throw new Error(`No inventory found for family code ${familyCode}.`);
        }
        colorId = matched.colorId;
        colorName = matched.color?.name ?? null;
      }

      if (!familyCode || !colorId) {
        throw new Error('Could not determine family code and color from this scan.');
      }

      const stockResponse = await api.get('/inventory', {
        params: { code: familyCode, colorId, pageSize: 200 },
      });
      const stockItems = Array.isArray(stockResponse.data)
        ? stockResponse.data
        : stockResponse.data?.items ?? [];

      setSearchFamilyCode(familyCode);
      setSearchColor({ id: colorId, name: colorName ?? 'Unknown color' });
      setSearchSubCode(subCode);
      setSelectedType(scannedType);
      setFamilyStock(aggregateFamilyStock(stockItems as InventoryStockItem[], familyCode, colorId));
      setStockBreakdownTarget(null);
      setScanQuery(query);
    } catch (err: any) {
      const body = err?.response?.data;
      setSearchError(body?.error ?? err?.message ?? 'Search failed.');
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
    () => familyStock.filter((row) => stockAmountForType(row, selectedType) !== '0'),
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
      return aggregateStockBreakdown(familyStock, selectedType);
    }
    return aggregateStockBreakdown(familyStock, selectedType, stockBreakdownTarget);
  }, [familyStock, selectedType, stockBreakdownTarget]);

  const stockBreakdownTitle = useMemo(() => {
    if (stockBreakdownTarget === 'total') {
      return `All branches · ${totalStockForType(familyStock, selectedType)}`;
    }
    if (stockBreakdownTarget) {
      const branch = BRANCH_DESTINATIONS.find((entry) => entry.id === stockBreakdownTarget);
      const row = familyStock.find((entry) => entry.branchId === stockBreakdownTarget);
      const amount = row ? stockAmountForType(row, selectedType) : '0';
      return `${branch?.label ?? 'Branch'} · ${amount}`;
    }
    return '';
  }, [familyStock, selectedType, stockBreakdownTarget]);

  const stockBreakdownHeading = useMemo(() => {
    if (selectedType === 'PIECE') return 'Piece breakdown by length or package';
    if (selectedType === 'ROLL') return 'Roll breakdown by size';
    return 'Remnant breakdown by size';
  }, [selectedType]);

  const packageStockRows = useMemo(() => {
    if (selectedType !== 'PIECE' || searchFamilyCode === null || !searchColor) return [];
    return familyStock.flatMap((row) =>
      row.items
        .filter((item) => item.isPiecePackage)
        .map((item) => ({
          branchId: row.branchId,
          branchLabel: row.branchLabel,
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
          <h2 className="text-2xl font-bold text-black">Inventory</h2>
          <p className="text-sm text-gray-500">
            Scan a QR code to see roll, piece, and remnant stock for a family and color across all branches.
          </p>
        </div>
        <Link to="/item-input" className="btn-primary text-center">
          New Item
        </Link>
      </div>

      <section className="mb-6 rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-black">QR search</h3>
        <p className="mt-1 text-sm text-gray-500">
          Scan or paste an item QR code. The app will find the family and color, then show stock in every branch.
        </p>
        <form
          className="mt-4 flex flex-col gap-3 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            runQrSearch();
          }}
        >
          <input
            value={scanQuery}
            onChange={(event) => setScanQuery(event.target.value)}
            className="flex-1 rounded-xl border border-gray-300 px-4 py-3 text-sm"
            placeholder="Scan QR code or enter item ID"
            autoFocus
          />
          <button type="submit" className="btn-primary" disabled={searchLoading}>
            {searchLoading ? 'Searching...' : 'Search'}
          </button>
          {searchFamilyCode !== null && (
            <button
              type="button"
              className="rounded-xl border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-700"
              onClick={clearSearch}
            >
              Clear
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
                  Family {searchFamilyCode} · {searchColor.name}
                  {searchSubCode !== null ? ` · Sub code $${formatSubCode(searchSubCode)}` : ''}
                </p>
                {searchScannedId && (
                  <p className="mt-1 break-all text-xs text-gray-500">Scanned: {searchScannedId}</p>
                )}
              </div>
              <p className="text-sm text-gray-600">
                Total {ITEM_TYPE_LABELS[selectedType].toLowerCase()}:{' '}
                {overallHasStock ? (
                  <button
                    type="button"
                    onClick={() => toggleStockBreakdown('total')}
                    className="font-bold text-black underline decoration-dotted underline-offset-4 hover:text-magenta-600"
                  >
                    {totalStockForType(familyStock, selectedType)}
                  </button>
                ) : (
                  <strong>{totalStockForType(familyStock, selectedType)}</strong>
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
                  {ITEM_TYPE_LABELS[type]}
                </button>
              ))}
            </div>

            {packageStockRows.length > 0 && selectedType === 'PIECE' && (
              <div className="mt-4 rounded-2xl border border-magenta-200 bg-magenta-50 p-4">
                <p className="text-sm font-semibold text-black">Piece package stock</p>
                <p className="mt-1 text-xs text-gray-600">
                  Each row shows the package set and how many of each piece are in stock.
                </p>
                <div className="mt-3 space-y-2">
                  {packageStockRows.map((entry) => (
                    <div
                      key={`${entry.branchId}-${entry.item.id}`}
                      className="rounded-xl border border-white bg-white px-4 py-3 text-sm"
                    >
                      <p className="font-semibold text-black">
                        {entry.branchLabel} · ${formatSubCode(Number(entry.item.subCode ?? entry.item.costPrice ?? 0))}
                      </p>
                      <p className="mt-1 text-gray-700">Set: {entry.packageSummary}</p>
                      <p className="mt-1 text-gray-700">
                        {Number(entry.item.quantity ?? 0)} sealed package(s) · pieces in stock: {entry.stockSummary}
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
                    Close
                  </button>
                </div>
                <p className="mt-1 text-xs text-gray-500">{stockBreakdownTitle}</p>
                <div className="mt-4 space-y-2">
                  {activeStockBreakdown.map((entry) => (
                    <div
                      key={entry.sizeMeters}
                      className="flex flex-col gap-1 rounded-xl border border-gray-200 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                    >
                      <span className="font-medium text-gray-800">
                        {formatStockBreakdownLine(selectedType, entry)}
                      </span>
                      {stockBreakdownTarget === 'total' && entry.branches.length > 0 && (
                        <span className="text-xs text-gray-500">
                          {entry.branches
                            .map(
                              (branch) =>
                                `${branch.branchCode === 'S' ? 'Storage' : `Branch ${branch.branchCode}`}: ${branch.count}`
                            )
                            .join(' · ')}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {BRANCH_DESTINATIONS.map((destination) => {
                const row = familyStock.find((entry) => entry.branchId === destination.id);
                const amount = row ? stockAmountForType(row, selectedType) : '0';
                const hasStock = amount !== '0';
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
                        <p className="text-sm font-semibold text-black">{destination.label}</p>
                        <p className="text-xs text-gray-500">
                          {destination.code === 'S' ? 'Storage' : `Branch ${destination.code}`}
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
                        <p className="text-xs text-gray-500">{ITEM_TYPE_LABELS[selectedType]}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {branchesWithStock.length === 0 && (
              <p className="mt-4 text-sm text-gray-500">
                No {ITEM_TYPE_LABELS[selectedType].toLowerCase()} stock found for family {searchFamilyCode}{' '}
                in color {searchColor.name} across any branch.
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
              {destination.code === 'S' ? 'Storage' : `Branch ${destination.code}`}
            </button>
          ))}
        </div>
        <p className="mt-2 text-sm text-gray-500">Table filter: {branch ? `Branch ${branch}` : 'All branches'}</p>
      </section>

      {loading && <div className="text-gray-600">Loading inventory...</div>}
      {error && <div className="mb-4 text-red-600">Error: {error}</div>}
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
              ? 'Select item(s) in the table to edit or remove.'
              : `${selectedIds.length} item(s) selected`}
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
            Edit selected
          </button>
          <button
            type="button"
            className="rounded-xl border border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-50"
            disabled={selectedIds.length === 0 || isSavingEdit || isRemoving}
            onClick={removeSelectedItems}
          >
            {isRemoving ? 'Removing...' : 'Remove selected'}
          </button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full rounded-lg border border-gray-200 bg-white">
          <thead>
            <tr className="bg-gray-50">
              {canManageInventory && (
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Select</th>
              )}
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">ID</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Branch</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Family</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Sub code</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Type</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Color</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Amount</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Package pieces</th>
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
                    {ITEM_TYPE_LABELS[item.type as InventoryItemType] ?? item.type}
                    {item.isPiecePackage ? ' (package)' : ''}
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-800">{item.color?.name ?? '-'}</td>
                  <td className="px-4 py-2 text-sm text-gray-800">{amount}</td>
                  <td className="px-4 py-2 text-sm text-gray-800">{packagePieces}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {items.length === 0 && !loading && (
        <div className="mt-4 text-center text-gray-500">
          No inventory items found. Use <Link to="/item-input" className="font-semibold text-magenta-600">New Item</Link> to add stock.
        </div>
      )}

      {editItem && editForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 shadow-xl">
            <h3 className="text-xl font-semibold text-black">Edit inventory item</h3>
            <p className="mt-1 break-all text-sm text-gray-500">{editItem.id}</p>
            <p className="mt-2 text-sm text-gray-600">
              Fix family code, price, color, or stock details entered incorrectly in New Item.
              Changing code, price, or color may generate a new item ID.
            </p>

            <div className="mt-4 grid gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Family code</label>
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
                <label className="block text-sm font-medium text-gray-700">Sub code (price)</label>
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
                <label className="block text-sm font-medium text-gray-700">Color</label>
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
                  <label className="block text-sm font-medium text-gray-700">Meters</label>
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
                    <label className="block text-sm font-medium text-gray-700">Piece length (m)</label>
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
                    <label className="block text-sm font-medium text-gray-700">Quantity</label>
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
                  <label className="block text-sm font-medium text-gray-700">Package quantity</label>
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
                {isSavingEdit ? 'Saving...' : 'Save changes'}
              </button>
              <button
                type="button"
                className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700"
                onClick={closeEditModal}
                disabled={isSavingEdit}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InventoryView;

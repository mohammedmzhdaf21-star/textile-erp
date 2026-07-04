import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import {
  aggregateFamilyStock,
  BRANCH_CODE_BY_ID,
  BRANCH_DESTINATIONS,
  BRANCH_ID_BY_CODE,
  formatSubCode,
  ITEM_TYPE_LABELS,
  parseInventoryItemId,
  stockAmountForType,
  totalStockForType,
  type BranchDestinationCode,
  type BranchStockRow,
  type InventoryItemType,
  type InventoryStockItem,
} from '../lib/inventoryCodes';

type Color = { id: string; name: string; hexCode?: string };
type InventoryItemView = InventoryStockItem & {
  costPrice?: number | string;
  branch?: { id: string; name: string };
};

const ITEM_TYPES: InventoryItemType[] = ['ROLL', 'PIECE', 'REMANENT'];

const InventoryView: React.FC = () => {
  const [branch, setBranch] = useState<BranchDestinationCode | null>(null);
  const [items, setItems] = useState<InventoryItemView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [scanQuery, setScanQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchFamilyCode, setSearchFamilyCode] = useState<number | null>(null);
  const [searchColor, setSearchColor] = useState<Color | null>(null);
  const [searchSubCode, setSearchSubCode] = useState<number | null>(null);
  const [searchScannedId, setSearchScannedId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<InventoryItemType>('ROLL');
  const [familyStock, setFamilyStock] = useState<BranchStockRow[]>([]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
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
      setScanQuery(query);
    } catch (err: any) {
      const body = err?.response?.data;
      setSearchError(body?.error ?? err?.message ?? 'Search failed.');
      setSearchFamilyCode(null);
      setSearchColor(null);
      setSearchSubCode(null);
      setSearchScannedId(null);
      setFamilyStock([]);
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
                <strong>{totalStockForType(familyStock, selectedType)}</strong>
              </p>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {ITEM_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setSelectedType(type)}
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

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {BRANCH_DESTINATIONS.map((destination) => {
                const row = familyStock.find((entry) => entry.branchId === destination.id);
                const amount = row ? stockAmountForType(row, selectedType) : '0';
                const hasStock = amount !== '0';

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
                        <p className="text-lg font-bold text-black">{amount}</p>
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

      <div className="overflow-x-auto">
        <table className="w-full rounded-lg border border-gray-200 bg-white">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">ID</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Branch</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Family</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Sub code</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Type</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Color</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const price = Number(item.subCode ?? item.costPrice ?? 0);
              const amount =
                item.type === 'PIECE'
                  ? `${item.quantity ?? 0} pc × ${item.pieceLength ?? 0} m`
                  : `${item.meters ?? 0} m`;

              return (
                <tr key={item.id} className="border-t transition-colors hover:bg-gray-50">
                  <td className="px-4 py-2 text-sm text-gray-800">{item.id}</td>
                  <td className="px-4 py-2 text-sm text-gray-800">
                    {BRANCH_CODE_BY_ID[item.branchId] ?? item.branch?.name ?? item.branchId}
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-800">{item.code}</td>
                  <td className="px-4 py-2 text-sm text-gray-800">${formatSubCode(price)}</td>
                  <td className="px-4 py-2 text-sm text-gray-800">
                    {ITEM_TYPE_LABELS[item.type as InventoryItemType] ?? item.type}
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-800">{item.color?.name ?? '-'}</td>
                  <td className="px-4 py-2 text-sm text-gray-800">{amount}</td>
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
    </div>
  );
};

export default InventoryView;

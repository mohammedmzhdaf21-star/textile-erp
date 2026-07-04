import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import {
  BRANCH_CODE_BY_ID,
  BRANCH_DESTINATIONS,
  BRANCH_ID_BY_CODE,
  formatSubCode,
  ITEM_TYPE_LABELS,
  type BranchDestinationCode,
} from '../lib/inventoryCodes';

type Color = { id: string; name: string; hexCode?: string };
type InventoryItemView = {
  id: string;
  code: number;
  subCode?: number | string;
  costPrice?: number | string;
  branchId: string;
  color?: Color;
  type: 'ROLL' | 'PIECE' | 'REMANENT' | string;
  meters?: string | number;
  pieceLength?: string | number;
  quantity?: number;
  branch?: { id: string; name: string };
};

const InventoryView: React.FC = () => {
  const [branch, setBranch] = useState<BranchDestinationCode | null>(null);
  const [items, setItems] = useState<InventoryItemView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .get('/inventory', {
        params: branch ? { branchId: BRANCH_ID_BY_CODE[branch] } : {},
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

  return (
    <div className="p-4">
      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-black">Inventory</h2>
          <p className="text-sm text-gray-500">
            Items are grouped by family code, with sub codes as price tiers.
          </p>
        </div>
        <Link to="/item-input" className="btn-primary text-center">
          New Item
        </Link>
      </div>

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
        <p className="mt-2 text-sm text-gray-500">Filter: {branch ? `Branch ${branch}` : 'All branches'}</p>
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
                    {ITEM_TYPE_LABELS[item.type as keyof typeof ITEM_TYPE_LABELS] ?? item.type}
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

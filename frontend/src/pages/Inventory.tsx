import React, { useEffect, useState } from 'react';
import api from '../lib/api';

const branches = ['A', 'B', 'C', 'D', 'E', 'F'];
// Map UI branch codes to real backend branch IDs (seeded DB uses B001/B002/B003)
const BRANCH_MAP: Record<string, string> = {
  A: 'B001',
  B: 'B002',
  C: 'B003',
  D: 'B001',
  E: 'B001',
  F: 'B002',
};

type Color = { id: string; name: string; hexCode?: string };
type InventoryItemView = {
  id: string;
  code: number;
  branchId: string;
  color?: Color;
  type: 'ROLL' | 'PIECE' | 'REMANENT' | string;
  meters?: string;
  pieceLength?: string;
  quantity?: number;
  branch?: { id: string; name: string };
};

const InventoryView: React.FC = () => {
  const [branch, setBranch] = useState<string | null>(null);
  const [items, setItems] = useState<InventoryItemView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // fetch all when no branch selected, otherwise fetch by branch
    setLoading(true);
    setError(null);
    api
      .get('/inventory', {
        // translate UI branch code to backend ID
        params: branch ? { branchId: BRANCH_MAP[branch] ?? branch } : {},
      })
      .then((res) => {
        const data = res.data;
        const list = Array.isArray(data)
          ? data
          : data?.items ?? data?.inventory ?? [];
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
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold mb-4 text-black">Inventory</h2>
        <div className="text-sm text-gray-500">Branch: {branch ?? 'All'}</div>
      </div>

      <section className="mb-6">
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {branches.map((b) => (
            <button
              key={b}
              className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${
                branch === b
                  ? 'bg-magenta-500 text-white'
                  : 'bg-white border border-gray-200 text-gray-800 hover:bg-magenta-50'
              }`}
              onClick={() => setBranch(branch === b ? null : b)}
            >
              Branch {b}
            </button>
          ))}
        </div>
      </section>

      <div className="mb-4 flex gap-3">
        <button
          className="btn-primary"
          onClick={() => alert('Scan QR (scaffold) - implement scanner later')}
        >
          Scan QR to add to sale
        </button>
        <div className="text-sm text-gray-500 self-center">(scaffold)</div>
      </div>

      {loading && <div className="text-gray-600">Loading inventory...</div>}
      {error && <div className="text-red-600 mb-4">Error: {error}</div>}

      <div className="overflow-x-auto">
        <table className="w-full bg-white border border-gray-200 rounded-lg">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">ID</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Branch</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Code</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Type</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Color</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Meters</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Quantity</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t hover:bg-gray-50 transition-colors">
                <td className="px-4 py-2 text-sm text-gray-800">{item.id}</td>
                <td className="px-4 py-2 text-sm text-gray-800">{item.branch?.name ?? item.branchId}</td>
                <td className="px-4 py-2 text-sm text-gray-800">{item.code}</td>
                <td className="px-4 py-2 text-sm text-gray-800">{item.type}</td>
                <td className="px-4 py-2 text-sm text-gray-800">{item.color?.name ?? '-'}</td>
                <td className="px-4 py-2 text-sm text-gray-800">{item.meters ?? '-'}</td>
                <td className="px-4 py-2 text-sm text-gray-800">{item.quantity ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {items.length === 0 && !loading && (
        <div className="mt-4 text-center text-gray-500">No inventory items found for this branch.</div>
      )}
    </div>
  );
};

export default InventoryView;

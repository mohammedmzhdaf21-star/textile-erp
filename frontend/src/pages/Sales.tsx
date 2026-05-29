import React, { useMemo, useState } from 'react';
import api from '../lib/api';
import { getCurrentUser } from '../lib/auth';

type InventorySaleLine = {
  type: 'inventory';
  inventoryItemId: string;
  sourceBranch: string;
  description: string;
  quantity: number;
  price: number;
};

type PlainClothSaleLine = {
  type: 'plain';
  clothName: string;
  meters: number;
  pricePerMeter: number;
};

type SaleLine = InventorySaleLine | PlainClothSaleLine;

const branchOptions = ['A', 'B', 'C', 'E', 'F'];
// Map UI branch codes to backend IDs (match seeded branches)
const BRANCH_MAP: Record<string, string> = {
  A: 'B001',
  B: 'B002',
  C: 'B003',
  E: 'B001',
  F: 'B002',
};
const clothOptions = ['Silk', 'Velvet', 'Cotton', 'Linen'];

const SalesView: React.FC = () => {
  const [branch, setBranch] = useState<string>('A');
  const [cart, setCart] = useState<SaleLine[]>([]);
  const [customerName, setCustomerName] = useState('Walk-in');
  const [customerPhone, setCustomerPhone] = useState('0000000000');
  const [paymentStatus, setPaymentStatus] = useState<'FULL' | 'PARTIAL'>('FULL');
  const [amountPaid, setAmountPaid] = useState('0');
  const [plainCloth, setPlainCloth] = useState({ clothName: clothOptions[0], meters: 1, pricePerMeter: 20 });
  const [scanState, setScanState] = useState({ inventoryItemId: '', sourceBranch: branch, price: 15 });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const lineTotal = (line: SaleLine) => {
    if (line.type === 'inventory') return line.quantity * line.price;
    return line.meters * line.pricePerMeter;
  };

  const saleTotal = useMemo(
    () => cart.reduce((sum, line) => sum + lineTotal(line), 0),
    [cart]
  );

  const dueAmount = useMemo(() => {
    if (paymentStatus === 'FULL') return 0;
    return Math.max(0, saleTotal - Number(amountPaid || 0));
  }, [saleTotal, paymentStatus, amountPaid]);

  const addPlainClothLine = () => {
    setCart((current) => [
      ...current,
      {
        type: 'plain',
        clothName: plainCloth.clothName,
        meters: plainCloth.meters,
        pricePerMeter: plainCloth.pricePerMeter,
      },
    ]);
  };

  const addInventoryLine = () => {
    if (!scanState.inventoryItemId.trim()) {
      return alert('Enter an item ID to simulate a scanned inventory line.');
    }
    setCart((current) => [
      ...current,
      {
        type: 'inventory',
        inventoryItemId: scanState.inventoryItemId.trim(),
        sourceBranch: scanState.sourceBranch,
        description: `Item from Branch ${scanState.sourceBranch}`,
        quantity: 1,
        price: scanState.price,
      },
    ]);
    setScanState((current) => ({ ...current, inventoryItemId: '' }));
  };

  const removeLine = (index: number) => {
    setCart((current) => current.filter((_, idx) => idx !== index));
  };

  const createSale = async () => {
    if (!branch) return alert('Select a branch');
    if (cart.length === 0) return alert('Add at least one line to the sale');
    if (!customerName.trim() || !customerPhone.trim()) return alert('Provide customer name and phone');
    if (paymentStatus === 'PARTIAL' && Number(amountPaid) <= 0) return alert('Enter a partial payment amount');

    setIsSubmitting(true);
    setSuccessMessage(null);

    const currentUser = getCurrentUser();
    if (!currentUser) {
      setIsSubmitting(false);
      return alert('You must be logged in to create a sale');
    }

    try {
      // For inventory lines, fetch details to get a valid colorId and unit
      const resolvedItems: any[] = [];

      for (const line of cart) {
        if (line.type === 'inventory') {
          try {
            const res = await api.get(`/inventory/${line.inventoryItemId}`);
            const inv = res.data;
            const soldAsUnit = inv.type === 'PIECE' ? 'PIECE' : 'METER';
            resolvedItems.push({
              inventoryItemId: line.inventoryItemId,
              colorId: inv.colorId,
              soldAsUnit,
              quantitySold: line.quantity,
              soldPrice: line.price,
              lineDiscount: 0,
            });
          } catch (e: any) {
            const status = e?.response?.status;
            const body = e?.response?.data;
            alert(
              `Failed to resolve inventory item ${line.inventoryItemId}${status ? ` (status ${status})` : ''}: ${body?.error ?? body?.message ?? e?.message}`
            );
            throw e;
          }
        } else {
          resolvedItems.push({
            inventoryItemId: undefined,
            colorId: 'PLAIN',
            soldAsUnit: 'METER',
            quantitySold: line.meters,
            soldPrice: line.pricePerMeter,
            lineDiscount: 0,
            plainClothName: line.clothName,
            isPlainCloth: true,
          });
        }
      }

      const payload = {
        branchId: BRANCH_MAP[branch] ?? branch,
        employeeId: currentUser.id,
        customerName,
        customerPhone,
        items: resolvedItems,
        discount: 0,
        paymentMethod: paymentStatus === 'FULL' ? 'CASH' : 'CREDIT',
        notes: `Source branch: ${branch}. ${paymentStatus === 'PARTIAL' ? `Paid ${amountPaid} now, due ${dueAmount}.` : 'Fully paid.'}`,
      };

      console.debug('createSale payload', payload);

      // Retry once on server/network errors
      let attempt = 0;
      const maxAttempts = 2;
      while (attempt < maxAttempts) {
        try {
          await api.post('/sales', payload);
          break;
        } catch (postErr: any) {
          attempt += 1;
          const status = postErr?.response?.status;
          // retry on 5xx or network error
          if (attempt < maxAttempts && (!status || status >= 500)) {
            console.warn(`POST /sales failed (attempt ${attempt}), retrying...`, postErr);
            await new Promise((r) => setTimeout(r, 500));
            continue;
          }
          throw postErr;
        }
      }
      setSuccessMessage(`Sale created for branch ${branch}. Total ${saleTotal.toFixed(2)}`);
      setCart([]);
      setAmountPaid('0');
      setPaymentStatus('FULL');
    } catch (err: any) {
      const status = err?.response?.status;
      const body = err?.response?.data;
      const msg = body?.error ?? body?.message ?? err?.message ?? 'Failed to create sale';
      alert(`Request failed${status ? ` (status ${status})` : ''}: ${msg}`);
      console.error('Create sale error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-black">Sales</h2>
          <p className="text-sm text-gray-600 max-w-xl">
            Select a branch, add inventory or plain cloth lines, and create a sale.
          </p>
        </div>
        <div className="text-sm text-gray-500">Branch: {branch}</div>
      </div>

      <section className="mt-6 grid grid-cols-2 sm:grid-cols-5 gap-3">
        {branchOptions.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setBranch(option)}
            className={`rounded-2xl px-4 py-3 text-sm font-semibold transition ${
              branch === option
                ? 'bg-magenta-500 text-white border-magenta-500'
                : 'bg-white text-gray-800 border border-gray-200 hover:bg-magenta-50'
            }`}
          >
            Branch {option}
          </button>
        ))}
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-black">Inventory Item Scan</h3>
            <p className="text-sm text-gray-500 mb-4">
              Simulate scanning a QR inventory item. This line will include a source branch and inventoryItemId.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="block text-sm font-medium text-gray-700">Item ID</label>
                <input
                  value={scanState.inventoryItemId}
                  onChange={(e) => setScanState((s) => ({ ...s, inventoryItemId: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                  placeholder="INV-123"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Source Branch</label>
                <select
                  value={scanState.sourceBranch}
                  onChange={(e) => setScanState((s) => ({ ...s, sourceBranch: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                >
                  {branchOptions.map((option) => (
                    <option key={option} value={option}>Branch {option}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Unit Price</label>
                <input
                  type="number"
                  value={scanState.price}
                  onChange={(e) => setScanState((s) => ({ ...s, price: Number(e.target.value) }))}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <button
              type="button"
              className="btn-primary mt-4"
              onClick={addInventoryLine}
            >
              Add scanned item
            </button>
          </section>

          <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-black">Plain Cloth Line</h3>
            <p className="text-sm text-gray-500 mb-4">
              Add a plain cloth line item with meters and a per-meter price.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="block text-sm font-medium text-gray-700">Fabric</label>
                <select
                  value={plainCloth.clothName}
                  onChange={(e) => setPlainCloth((current) => ({ ...current, clothName: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                >
                  {clothOptions.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Meters</label>
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={plainCloth.meters}
                  onChange={(e) => setPlainCloth((current) => ({ ...current, meters: Number(e.target.value) }))}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Price / meter</label>
                <input
                  type="number"
                  min="1"
                  step="0.1"
                  value={plainCloth.pricePerMeter}
                  onChange={(e) => setPlainCloth((current) => ({ ...current, pricePerMeter: Number(e.target.value) }))}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <button
              type="button"
              className="btn-primary mt-4"
              onClick={addPlainClothLine}
            >
              Add plain cloth line
            </button>
          </section>
        </div>

        <aside className="space-y-6">
          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-black">Sale Summary</h3>
            <div className="mt-4 space-y-3 text-sm text-gray-700">
              <div className="flex justify-between">
                <span>Date</span>
                <span>{new Date().toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Branch</span>
                <span>{branch}</span>
              </div>
              <div className="flex justify-between">
                <span>Lines</span>
                <span>{cart.length}</span>
              </div>
              <div className="flex justify-between font-semibold">
                <span>Total</span>
                <span>${saleTotal.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-black">Customer & Payment</h3>
            <div className="space-y-3 mt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Customer Name</label>
                <input
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Customer Phone</label>
                <input
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Payment Status</label>
                <select
                  value={paymentStatus}
                  onChange={(e) => setPaymentStatus(e.target.value as 'FULL' | 'PARTIAL')}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="FULL">Fully paid</option>
                  <option value="PARTIAL">Partially paid</option>
                </select>
              </div>
              {paymentStatus === 'PARTIAL' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700">Amount paid now</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={amountPaid}
                    onChange={(e) => setAmountPaid(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                  />
                  <p className="mt-2 text-sm text-gray-500">Remaining due: ${dueAmount.toFixed(2)}</p>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <button
              type="button"
              className="btn-primary w-full"
              onClick={createSale}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Creating sale...' : 'Confirm Sale'}
            </button>
            {successMessage && (
              <p className="mt-4 text-sm text-green-600">{successMessage}</p>
            )}
          </div>
        </aside>
      </div>

      <section className="mt-8 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-black">Cart details</h3>
        {cart.length === 0 ? (
          <div className="mt-4 text-sm text-gray-500">No line items added yet.</div>
        ) : (
          <div className="mt-4 space-y-3">
            {cart.map((line, index) => (
              <div
                key={index}
                className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-4"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-black">
                      {line.type === 'inventory'
                        ? `Inventory item ${line.inventoryItemId}`
                        : `${line.clothName} (Plain cloth)`}
                    </p>
                    <p className="text-sm text-gray-500">
                      {line.type === 'inventory'
                        ? `Source branch ${line.sourceBranch}`
                        : `${line.meters} meters @ $${line.pricePerMeter}/m`}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="text-sm font-semibold text-red-600"
                    onClick={() => removeLine(index)}
                  >
                    Remove
                  </button>
                </div>
                <div className="flex items-center justify-between text-sm text-gray-700">
                  <span>Line total</span>
                  <span>${lineTotal(line).toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default SalesView;

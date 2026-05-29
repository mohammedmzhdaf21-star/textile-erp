import React, { useMemo, useState } from 'react';
import api from '../lib/api';
import { getCurrentUser } from '../lib/auth';

type BranchCode = 'A' | 'B' | 'C' | 'E' | 'F';

type ReturnedInventoryLine = {
  inventoryItemId: string;
  soldAsUnit: 'METER' | 'PIECE';
  amount: number;
  sourceBranch: BranchCode;
};

type PlainReturnLine = {
  clothName: string;
  meters: number;
  note: string;
};

type NewSaleInventoryLine = {
  type: 'inventory';
  inventoryItemId: string;
  sourceBranch: BranchCode;
  colorId: string;
  price: number;
  soldAsUnit: 'METER' | 'PIECE';
  quantity: number;
};

type NewSalePlainLine = {
  type: 'plain';
  clothName: string;
  meters: number;
  pricePerMeter: number;
};

type NewSaleLine = NewSaleInventoryLine | NewSalePlainLine;

const branchOptions: BranchCode[] = ['A', 'B', 'C', 'E', 'F'];
const BRANCH_MAP: Record<BranchCode, string> = {
  A: 'B001',
  B: 'B002',
  C: 'B003',
  E: 'B001',
  F: 'B002',
};

const ExchangePage: React.FC = () => {
  const [selectedBranch, setSelectedBranch] = useState<BranchCode>('F');
  const [customerName, setCustomerName] = useState('Exchange Customer');
  const [customerPhone, setCustomerPhone] = useState('0000000000');
  const [returnedInventory, setReturnedInventory] = useState<ReturnedInventoryLine[]>([]);
  const [returnedPlain, setReturnedPlain] = useState<PlainReturnLine[]>([]);
  const [newSaleLines, setNewSaleLines] = useState<NewSaleLine[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [returnedScan, setReturnedScan] = useState({
    inventoryItemId: '',
    sourceBranch: selectedBranch,
    amount: 0,
  });
  const [newScan, setNewScan] = useState({
    inventoryItemId: '',
    sourceBranch: selectedBranch,
    price: 15,
    amount: 0,
  });
  const [plainReturn, setPlainReturn] = useState({
    clothName: 'Plain Cloth',
    meters: 1,
    note: '',
  });
  const [plainSale, setPlainSale] = useState({
    clothName: 'Plain Cloth',
    meters: 1,
    pricePerMeter: 20,
  });

  const totalReturnedQuantity = useMemo(
    () => returnedInventory.reduce((sum, item) => sum + item.amount, 0),
    [returnedInventory]
  );

  const totalNewSaleAmount = useMemo(
    () =>
      newSaleLines.reduce((sum, line) => {
        if (line.type === 'inventory') {
          return sum + line.quantity * line.price;
        }
        return sum + line.meters * line.pricePerMeter;
      }, 0),
    [newSaleLines]
  );

  const addReturnedInventory = async () => {
    const inventoryItemId = returnedScan.inventoryItemId.trim();
    if (!inventoryItemId) {
      return alert('Enter a returned inventory item ID.');
    }
    if (returnedScan.amount <= 0) {
      return alert('Enter returned meters or quantity.');
    }

    try {
      const response = await api.get(`/inventory/${inventoryItemId}`);
      const item = response.data;
      const soldAsUnit = item.type === 'PIECE' ? 'PIECE' : 'METER';

      setReturnedInventory((current) => [
        ...current,
        {
          inventoryItemId,
          soldAsUnit,
          amount: returnedScan.amount,
          sourceBranch: returnedScan.sourceBranch,
        },
      ]);
      setReturnedScan((current) => ({ ...current, inventoryItemId: '', amount: 0 }));
    } catch (error: any) {
      const status = error?.response?.status;
      const body = error?.response?.data;
      alert(
        `Unable to load returned inventory item${status ? ` (status ${status})` : ''}: ${
          body?.error ?? body?.message ?? error?.message
        }`
      );
    }
  };

  const addNewSaleLine = async () => {
    const inventoryItemId = newScan.inventoryItemId.trim();
    if (!inventoryItemId) {
      return alert('Enter a new sale inventory item ID.');
    }
    if (newScan.amount <= 0 || newScan.price <= 0) {
      return alert('Enter a valid amount and price for the new sale item.');
    }

    try {
      const response = await api.get(`/inventory/${inventoryItemId}`);
      const item = response.data;
      const soldAsUnit = item.type === 'PIECE' ? 'PIECE' : 'METER';

      setNewSaleLines((current) => [
        ...current,
        {
          type: 'inventory',
          inventoryItemId,
          sourceBranch: newScan.sourceBranch,
          colorId: item.colorId,
          price: newScan.price,
          soldAsUnit,
          quantity: newScan.amount,
        },
      ]);
      setNewScan((current) => ({ ...current, inventoryItemId: '', amount: 0 }));
    } catch (error: any) {
      const status = error?.response?.status;
      const body = error?.response?.data;
      alert(
        `Unable to load sale inventory item${status ? ` (status ${status})` : ''}: ${
          body?.error ?? body?.message ?? error?.message
        }`
      );
    }
  };

  const addPlainReturnLine = () => {
    if (plainReturn.meters <= 0) {
      return alert('Enter returned plain cloth meters.');
    }
    setReturnedPlain((current) => [
      ...current,
      {
        clothName: plainReturn.clothName,
        meters: plainReturn.meters,
        note: plainReturn.note,
      },
    ]);
    setPlainReturn((current) => ({ ...current, meters: 1, note: '' }));
  };

  const addPlainSaleLine = () => {
    if (plainSale.meters <= 0 || plainSale.pricePerMeter <= 0) {
      return alert('Enter valid plain cloth meters and price.');
    }
    setNewSaleLines((current) => [
      ...current,
      {
        type: 'plain',
        clothName: plainSale.clothName,
        meters: plainSale.meters,
        pricePerMeter: plainSale.pricePerMeter,
      },
    ]);
    setPlainSale((current) => ({ ...current, meters: 1, pricePerMeter: 20 }));
  };

  const removeReturnedInventory = (index: number) => {
    setReturnedInventory((current) => current.filter((_, idx) => idx !== index));
  };

  const removeReturnedPlain = (index: number) => {
    setReturnedPlain((current) => current.filter((_, idx) => idx !== index));
  };

  const removeNewSaleLine = (index: number) => {
    setNewSaleLines((current) => current.filter((_, idx) => idx !== index));
  };

  const processExchange = async () => {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      return alert('You must be logged in to process an exchange.');
    }
    if (!customerName.trim() || !customerPhone.trim()) {
      return alert('Provide customer name and phone.');
    }
    if (returnedInventory.length === 0 && returnedPlain.length === 0 && newSaleLines.length === 0) {
      return alert('Add returned items or new sale lines before processing.');
    }

    setIsProcessing(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      // Restock returned inventory items first
      for (const returned of returnedInventory) {
        const itemResponse = await api.get(`/inventory/${returned.inventoryItemId}`);
        const existing = itemResponse.data;
        const isPiece = returned.soldAsUnit === 'PIECE';

        const updatePayload: any = {
          version: existing.version,
        };

        if (isPiece) {
          updatePayload.quantity = existing.quantity + Math.floor(returned.amount);
        } else {
          updatePayload.meters = Number((Number(existing.meters ?? 0) + returned.amount).toFixed(2));
        }

        await api.patch(`/inventory/${returned.inventoryItemId}`, updatePayload);
      }

      let createdSale: any = null;
      if (newSaleLines.length > 0) {
        const saleItems = newSaleLines.map((line) => {
          if (line.type === 'inventory') {
            return {
              inventoryItemId: line.inventoryItemId,
              colorId: line.colorId,
              soldAsUnit: line.soldAsUnit,
              quantitySold: line.quantity,
              soldPrice: line.price,
            };
          }
          return {
            colorId: 'PLAIN',
            soldAsUnit: 'METER',
            quantitySold: line.meters,
            soldPrice: line.pricePerMeter,
            isPlainCloth: true,
            plainClothName: line.clothName,
          };
        });

        const salePayload = {
          branchId: BRANCH_MAP[selectedBranch],
          employeeId: currentUser.id,
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          items: saleItems,
          discount: 0,
          paymentMethod: 'CASH',
          notes: `Exchange at branch ${selectedBranch}. Returned inventory: ${returnedInventory.length}. Returned plain cloth lines: ${returnedPlain.length}.`,
        };

        const saleResponse = await api.post('/sales', salePayload);
        createdSale = saleResponse.data.sale;
      }

      setSuccessMessage(
        `Exchange processed. ${returnedInventory.length} returned inventory item(s), ${returnedPlain.length} returned plain cloth line(s), ${newSaleLines.length} new sale item(s).` +
          (createdSale ? ` New sale ID: ${createdSale.id}` : '')
      );
      setReturnedInventory([]);
      setReturnedPlain([]);
      setNewSaleLines([]);
    } catch (error: any) {
      const status = error?.response?.status;
      const body = error?.response?.data;
      setErrorMessage(
        `Exchange failed${status ? ` (status ${status})` : ''}: ${
          body?.error ?? body?.message ?? error?.message ?? 'Unexpected error'
        }`
      );
      console.error('Exchange error:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-black">Exchange</h2>
          <p className="text-sm text-gray-600 max-w-2xl">
            Process product exchanges with returned inventory, returned plain cloth items, and new sale items in one workflow.
          </p>
        </div>
        <div className="text-sm text-gray-500">Current branch: {selectedBranch}</div>
      </div>

      <section className="mt-6 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-black mb-4">Select exchange branch</h3>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
          {branchOptions.map((branch) => (
            <button
              type="button"
              key={branch}
              className={`rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                selectedBranch === branch
                  ? 'bg-magenta-500 text-white'
                  : 'bg-white text-gray-800 border border-gray-200 hover:bg-magenta-50'
              }`}
              onClick={() => {
                setSelectedBranch(branch);
                setReturnedScan((current) => ({ ...current, sourceBranch: branch }));
                setNewScan((current) => ({ ...current, sourceBranch: branch }));
              }}
            >
              Branch {branch}
            </button>
          ))}
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-black">New exchange sale</h3>
            <p className="text-sm text-gray-500 mb-4">
              Add the replacement items the customer is taking. These items will be deducted from inventory and recorded as a normal sale.
            </p>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="block text-sm font-medium text-gray-700">Scan QR / Item ID</label>
                <input
                  value={newScan.inventoryItemId}
                  onChange={(e) => setNewScan((current) => ({ ...current, inventoryItemId: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                  placeholder="INV-123 or QR code"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Amount (meters or pieces)</label>
                <input
                  type="number"
                  min="0"
                  value={newScan.amount}
                  onChange={(e) => setNewScan((current) => ({ ...current, amount: Number(e.target.value) }))}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Price per unit</label>
                <input
                  type="number"
                  min="0"
                  value={newScan.price}
                  onChange={(e) => setNewScan((current) => ({ ...current, price: Number(e.target.value) }))}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <button type="button" className="btn-primary mt-4" onClick={addNewSaleLine}>
              Add replacement item
            </button>

            <div className="mt-6 rounded-3xl border border-gray-200 bg-gray-50 p-4">
              <h4 className="text-base font-semibold text-black mb-3">Add plain cloth replacement</h4>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Plain cloth name</label>
                  <input
                    value={plainSale.clothName}
                    onChange={(e) => setPlainSale((current) => ({ ...current, clothName: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Meters</label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={plainSale.meters}
                    onChange={(e) => setPlainSale((current) => ({ ...current, meters: Number(e.target.value) }))}
                    className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Price / meter</label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={plainSale.pricePerMeter}
                    onChange={(e) => setPlainSale((current) => ({ ...current, pricePerMeter: Number(e.target.value) }))}
                    className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <button type="button" className="btn-secondary mt-4" onClick={addPlainSaleLine}>
                Add plain cloth replacement
              </button>
            </div>

            <div className="mt-6 border-t border-gray-200 pt-4">
              <h4 className="text-base font-semibold text-black">Replacement lines</h4>
              {newSaleLines.length === 0 ? (
                <div className="mt-3 text-sm text-gray-500">No replacement items added yet.</div>
              ) : (
                <div className="mt-3 space-y-3">
                  {newSaleLines.map((line, index) => (
                    <div key={index} className="flex items-center justify-between rounded-2xl border border-gray-200 bg-gray-50 p-3">
                      <div>
                        <p className="font-semibold text-black">
                          {line.type === 'inventory' ? `Inventory ${line.inventoryItemId}` : `${line.clothName} (Plain cloth)`}
                        </p>
                        <p className="text-sm text-gray-600">
                          {line.type === 'inventory'
                            ? `${line.quantity} ${line.soldAsUnit.toLowerCase()} @ $${line.price}/unit`
                            : `${line.meters} meters @ $${line.pricePerMeter}/m`}
                        </p>
                      </div>
                      <button type="button" className="text-red-600 font-semibold" onClick={() => removeNewSaleLine(index)}>
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-black">Returned inventory</h3>
            <p className="text-sm text-gray-500 mb-4">
              Scan or enter the original sold item to restock it. Returned pieces and rolls are handled separately.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="block text-sm font-medium text-gray-700">Returned item ID</label>
                <input
                  value={returnedScan.inventoryItemId}
                  onChange={(e) => setReturnedScan((current) => ({ ...current, inventoryItemId: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                  placeholder="INV-123 or scanned code"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Amount returned</label>
                <input
                  type="number"
                  min="0"
                  value={returnedScan.amount}
                  onChange={(e) => setReturnedScan((current) => ({ ...current, amount: Number(e.target.value) }))}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Returned from branch</label>
                <select
                  value={returnedScan.sourceBranch}
                  onChange={(e) => setReturnedScan((current) => ({ ...current, sourceBranch: e.target.value as BranchCode }))}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                >
                  {branchOptions.map((branch) => (
                    <option key={branch} value={branch}>
                      Branch {branch}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button type="button" className="btn-primary mt-4" onClick={addReturnedInventory}>
              Add returned inventory
            </button>
            <div className="mt-6 border-t border-gray-200 pt-4">
              <h4 className="text-base font-semibold text-black">Returned lines</h4>
              {returnedInventory.length === 0 ? (
                <div className="mt-3 text-sm text-gray-500">No returned inventory added yet.</div>
              ) : (
                <div className="mt-3 space-y-3">
                  {returnedInventory.map((line, index) => (
                    <div key={index} className="flex items-center justify-between rounded-2xl border border-gray-200 bg-gray-50 p-3">
                      <div>
                        <p className="font-semibold text-black">Returned {line.inventoryItemId}</p>
                        <p className="text-sm text-gray-600">
                          {line.amount} {line.soldAsUnit.toLowerCase()} from branch {line.sourceBranch}
                        </p>
                      </div>
                      <button type="button" className="text-red-600 font-semibold" onClick={() => removeReturnedInventory(index)}>
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-black">Returned plain cloth</h3>
            <p className="text-sm text-gray-500 mb-4">
              Record returned plain cloth pieces or meters separately so the exchange workflow tracks them.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="block text-sm font-medium text-gray-700">Plain cloth name</label>
                <input
                  value={plainReturn.clothName}
                  onChange={(e) => setPlainReturn((current) => ({ ...current, clothName: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Meters returned</label>
                <input
                  type="number"
                  min="0"
                  value={plainReturn.meters}
                  onChange={(e) => setPlainReturn((current) => ({ ...current, meters: Number(e.target.value) }))}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Note</label>
                <input
                  value={plainReturn.note}
                  onChange={(e) => setPlainReturn((current) => ({ ...current, note: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Why plain cloth was returned"
                />
              </div>
            </div>
            <button type="button" className="btn-primary mt-4" onClick={addPlainReturnLine}>
              Add returned plain cloth
            </button>
            <div className="mt-6 border-t border-gray-200 pt-4">
              <h4 className="text-base font-semibold text-black">Returned plain cloth lines</h4>
              {returnedPlain.length === 0 ? (
                <div className="mt-3 text-sm text-gray-500">No returned plain cloth recorded yet.</div>
              ) : (
                <div className="mt-3 space-y-3">
                  {returnedPlain.map((line, index) => (
                    <div key={index} className="flex items-center justify-between rounded-2xl border border-gray-200 bg-gray-50 p-3">
                      <div>
                        <p className="font-semibold text-black">{line.clothName}</p>
                        <p className="text-sm text-gray-600">{line.meters} meters returned</p>
                        {line.note && <p className="text-sm text-gray-500">{line.note}</p>}
                      </div>
                      <button type="button" className="text-red-600 font-semibold" onClick={() => removeReturnedPlain(index)}>
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-black">Exchange summary</h3>
            <div className="mt-4 space-y-3 text-sm text-gray-700">
              <div className="flex justify-between">
                <span>Returned inventory lines</span>
                <span>{returnedInventory.length}</span>
              </div>
              <div className="flex justify-between">
                <span>Returned plain cloth lines</span>
                <span>{returnedPlain.length}</span>
              </div>
              <div className="flex justify-between">
                <span>New replacement lines</span>
                <span>{newSaleLines.length}</span>
              </div>
              <div className="flex justify-between font-semibold">
                <span>Replacement value</span>
                <span>${totalNewSaleAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Returned inventory total</span>
                <span>{totalReturnedQuantity}</span>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-black">Customer details</h3>
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Customer Name</label>
                <input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Customer Phone</label>
                <input
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <button
              type="button"
              className="btn-primary w-full"
              onClick={processExchange}
              disabled={isProcessing}
            >
              {isProcessing ? 'Processing exchange...' : 'Process Exchange'}
            </button>
            {successMessage && <p className="mt-4 text-sm text-green-600">{successMessage}</p>}
            {errorMessage && <p className="mt-4 text-sm text-red-600">{errorMessage}</p>}
          </div>
        </aside>
      </div>
    </div>
  );
};

export default ExchangePage;

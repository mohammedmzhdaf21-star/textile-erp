import React, { useMemo, useState } from 'react';
import api from '../lib/api';
import { getCurrentUser } from '../lib/auth';

type BranchCode = 'A' | 'B' | 'C' | 'E' | 'F';

type ReturnedInventoryLine = {
  inventoryItemId: string;
  itemType: 'ROLL' | 'PIECE' | 'REMANENT';
  soldAsUnit: 'METER' | 'PIECE';
  amount: number;
  returnPrice: number;
  sourceBranch: BranchCode;
};

type PlainReturnLine = {
  clothName: string;
  meters: number;
  returnPricePerMeter: number;
  note: string;
};

type NewSaleInventoryLine = {
  type: 'inventory';
  inventoryItemId: string;
  sourceBranch: BranchCode;
  colorId: string;
  itemType: 'ROLL' | 'PIECE' | 'REMANENT';
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

type InventoryLookupItem = {
  id: string;
  branchId: string;
  colorId: string;
  type: 'ROLL' | 'PIECE' | 'REMANENT';
  meters?: string | number | null;
  quantity: number;
};

const branchOptions: BranchCode[] = ['A', 'B', 'C', 'E', 'F'];
const BRANCH_MAP: Record<BranchCode, string> = {
  A: 'B001',
  B: 'B002',
  C: 'B003',
  E: 'B001',
  F: 'B002',
};

const soldAsUnitForItem = (item: InventoryLookupItem): 'METER' | 'PIECE' =>
  item.type === 'PIECE' ? 'PIECE' : 'METER';

const amountLabelForUnit = (unit?: 'METER' | 'PIECE') =>
  unit === 'PIECE' ? 'Quantity (pieces)' : 'Meters';

const ExchangePage: React.FC = () => {
  const [selectedBranch, setSelectedBranch] = useState<BranchCode>('F');
  const [customerName, setCustomerName] = useState('Exchange Customer');
  const [customerPhone, setCustomerPhone] = useState('0000000000');
  const [returnedInventory, setReturnedInventory] = useState<ReturnedInventoryLine[]>([]);
  const [returnedPlain, setReturnedPlain] = useState<PlainReturnLine[]>([]);
  const [newSaleLines, setNewSaleLines] = useState<NewSaleLine[]>([]);
  const [paymentStatus, setPaymentStatus] = useState<'FULL' | 'PARTIAL'>('FULL');
  const [amountPaid, setAmountPaid] = useState('0');
  const [isProcessing, setIsProcessing] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [returnedScan, setReturnedScan] = useState({
    inventoryItemId: '',
    sourceBranch: selectedBranch,
    amount: 0,
    returnPrice: 0,
  });
  const [newScan, setNewScan] = useState({
    inventoryItemId: '',
    sourceBranch: selectedBranch,
    price: 15,
    amount: 0,
  });
  const [detectedReturnedItem, setDetectedReturnedItem] = useState<InventoryLookupItem | null>(null);
  const [detectedNewItem, setDetectedNewItem] = useState<InventoryLookupItem | null>(null);
  const [returnedScanMessage, setReturnedScanMessage] = useState<string | null>(null);
  const [newScanMessage, setNewScanMessage] = useState<string | null>(null);
  const [plainReturn, setPlainReturn] = useState({
    clothName: 'Plain Cloth',
    meters: 1,
    returnPricePerMeter: 10,
    note: '',
  });
  const [plainSale, setPlainSale] = useState({
    clothName: 'Plain Cloth',
    meters: 1,
    pricePerMeter: 20,
  });

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

  const totalReturnedValue = useMemo(
    () =>
      returnedInventory.reduce((sum, item) => sum + item.amount * item.returnPrice, 0) +
      returnedPlain.reduce((sum, item) => sum + item.meters * item.returnPricePerMeter, 0),
    [returnedInventory, returnedPlain]
  );

  const netDue = useMemo(
    () => Number((totalNewSaleAmount - totalReturnedValue).toFixed(2)),
    [totalNewSaleAmount, totalReturnedValue]
  );

  const dueAmount = useMemo(() => {
    if (netDue <= 0 || paymentStatus === 'FULL') return 0;
    return Math.max(0, netDue - Number(amountPaid || 0));
  }, [amountPaid, netDue, paymentStatus]);

  const resolveInventoryItem = async (rawCode: string, sourceBranch: BranchCode) => {
    const code = rawCode.trim();
    if (!code) return null;

    try {
      const response = await api.get(`/inventory/${encodeURIComponent(code)}`);
      return response.data as InventoryLookupItem;
    } catch (error: any) {
      if (error?.response?.status !== 404 || !/^\d+$/.test(code)) {
        throw error;
      }
    }

    const response = await api.get('/inventory', {
      params: {
        branchId: BRANCH_MAP[sourceBranch],
        code,
        pageSize: 1,
      },
    });
    const item = response.data?.items?.[0];
    if (!item) throw new Error(`Inventory code ${code} was not found for branch ${sourceBranch}`);
    return item as InventoryLookupItem;
  };

  const detectReturnedItem = async () => {
    const item = await resolveInventoryItem(returnedScan.inventoryItemId, returnedScan.sourceBranch);
    setDetectedReturnedItem(item);
    if (item) {
      const unit = soldAsUnitForItem(item);
      setReturnedScanMessage(
        `${item.type} detected: enter ${unit === 'PIECE' ? 'piece quantity' : 'decimal meters'}.`
      );
    }
    return item;
  };

  const detectNewItem = async () => {
    const item = await resolveInventoryItem(newScan.inventoryItemId, newScan.sourceBranch);
    setDetectedNewItem(item);
    if (item) {
      const unit = soldAsUnitForItem(item);
      setNewScanMessage(
        `${item.type} detected: enter ${unit === 'PIECE' ? 'piece quantity' : 'decimal meters'}.`
      );
    }
    return item;
  };

  const addReturnedInventory = async () => {
    const inventoryItemId = returnedScan.inventoryItemId.trim();
    if (!inventoryItemId) {
      return alert('Enter a returned inventory item ID.');
    }
    if (returnedScan.amount <= 0) {
      return alert('Enter returned meters or quantity.');
    }
    if (returnedScan.returnPrice < 0) {
      return alert('Returned price cannot be negative.');
    }

    try {
      const item =
        detectedReturnedItem?.id === inventoryItemId
          ? detectedReturnedItem
          : await detectReturnedItem();
      if (!item) return;
      const soldAsUnit = soldAsUnitForItem(item);
      const amount = soldAsUnit === 'PIECE' ? Math.floor(returnedScan.amount) : returnedScan.amount;

      if (amount <= 0) {
        return alert('Enter at least one piece or more than 0 meters.');
      }

      setReturnedInventory((current) => [
        ...current,
        {
          inventoryItemId: item.id,
          itemType: item.type,
          soldAsUnit,
          amount,
          returnPrice: returnedScan.returnPrice,
          sourceBranch: returnedScan.sourceBranch,
        },
      ]);
      setReturnedScan((current) => ({
        ...current,
        inventoryItemId: '',
        amount: 0,
        returnPrice: 0,
      }));
      setDetectedReturnedItem(null);
      setReturnedScanMessage(null);
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
      const item = detectedNewItem?.id === inventoryItemId ? detectedNewItem : await detectNewItem();
      if (!item) return;
      const soldAsUnit = soldAsUnitForItem(item);
      const quantity = soldAsUnit === 'PIECE' ? Math.floor(newScan.amount) : newScan.amount;

      if (quantity <= 0) {
        return alert('Enter at least one piece or more than 0 meters.');
      }

      setNewSaleLines((current) => [
        ...current,
        {
          type: 'inventory',
          inventoryItemId: item.id,
          sourceBranch: newScan.sourceBranch,
          colorId: item.colorId,
          itemType: item.type,
          price: newScan.price,
          soldAsUnit,
          quantity,
        },
      ]);
      setNewScan((current) => ({ ...current, inventoryItemId: '', amount: 0 }));
      setDetectedNewItem(null);
      setNewScanMessage(null);
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
    if (plainReturn.returnPricePerMeter < 0) {
      return alert('Returned plain cloth price cannot be negative.');
    }
    setReturnedPlain((current) => [
      ...current,
      {
        clothName: plainReturn.clothName,
        meters: plainReturn.meters,
        returnPricePerMeter: plainReturn.returnPricePerMeter,
        note: plainReturn.note,
      },
    ]);
    setPlainReturn((current) => ({ ...current, meters: 1, returnPricePerMeter: 10, note: '' }));
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
    if (netDue > 0 && paymentStatus === 'PARTIAL' && Number(amountPaid) <= 0) {
      return alert('Enter the amount paid now for a partial exchange payment.');
    }
    if (netDue > 0 && paymentStatus === 'PARTIAL' && Number(amountPaid) >= netDue) {
      return alert('Use Fully paid when the customer pays the full net amount.');
    }

    setIsProcessing(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      const replacementItems = newSaleLines.map((line) => {
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

      const exchangePayload = {
        branchId: BRANCH_MAP[selectedBranch],
        employeeId: currentUser.id,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        returnedInventory: returnedInventory.map((line) => ({
          inventoryItemId: line.inventoryItemId,
          soldAsUnit: line.soldAsUnit,
          quantityReturned: line.amount,
          returnPrice: line.returnPrice,
        })),
        returnedPlain: returnedPlain.map((line) => ({
          clothName: line.clothName,
          meters: line.meters,
          returnPricePerMeter: line.returnPricePerMeter,
          note: line.note,
        })),
        replacementItems,
        paymentStatus: netDue > 0 ? paymentStatus : 'FULL',
        amountPaid: netDue > 0 && paymentStatus === 'PARTIAL' ? Number(amountPaid) : undefined,
        notes: `Exchange at branch ${selectedBranch}. Returned inventory: ${returnedInventory.length}. Returned plain cloth lines: ${returnedPlain.length}.`,
      };

      const exchangeResponse = await api.post('/sales/exchange', exchangePayload);
      const createdSale = exchangeResponse.data.sale;
      const summary = exchangeResponse.data.summary;

      setSuccessMessage(
        `Exchange processed. Replacement $${summary.replacementTotal.toFixed(2)}, returned $${summary.returnedTotal.toFixed(2)}, net $${summary.netDue.toFixed(2)}.` +
          (createdSale ? ` New sale ID: ${createdSale.id}` : '')
      );
      setReturnedInventory([]);
      setReturnedPlain([]);
      setNewSaleLines([]);
      setAmountPaid('0');
      setPaymentStatus('FULL');
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
                setDetectedReturnedItem(null);
                setDetectedNewItem(null);
                setReturnedScanMessage(null);
                setNewScanMessage(null);
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

            <div className="grid gap-3 sm:grid-cols-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Scan QR / Item ID</label>
                <input
                  value={newScan.inventoryItemId}
                  onBlur={() => {
                    if (newScan.inventoryItemId.trim()) {
                      detectNewItem().catch((error: any) => {
                        const status = error?.response?.status;
                        const body = error?.response?.data;
                        setNewScanMessage(
                          `Not found${status ? ` (${status})` : ''}: ${
                            body?.error ?? body?.message ?? error?.message
                          }`
                        );
                      });
                    }
                  }}
                  onChange={(e) => {
                    setDetectedNewItem(null);
                    setNewScanMessage(null);
                    setNewScan((current) => ({ ...current, inventoryItemId: e.target.value }));
                  }}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Item ID, QR, or numeric code"
                />
                {newScanMessage && <p className="mt-2 text-xs text-gray-500">{newScanMessage}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  {amountLabelForUnit(detectedNewItem ? soldAsUnitForItem(detectedNewItem) : undefined)}
                </label>
                <input
                  type="number"
                  min={detectedNewItem && soldAsUnitForItem(detectedNewItem) === 'PIECE' ? '1' : '0.01'}
                  step={detectedNewItem && soldAsUnitForItem(detectedNewItem) === 'PIECE' ? '1' : '0.01'}
                  value={newScan.amount}
                  onChange={(e) => setNewScan((current) => ({ ...current, amount: Number(e.target.value) }))}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Price per unit</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={newScan.price}
                  onChange={(e) => setNewScan((current) => ({ ...current, price: Number(e.target.value) }))}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Source Branch</label>
                <select
                  value={newScan.sourceBranch}
                  onChange={(e) => {
                    setDetectedNewItem(null);
                    setNewScanMessage(null);
                    setNewScan((current) => ({ ...current, sourceBranch: e.target.value as BranchCode }));
                  }}
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
                            ? `${line.itemType}: ${line.quantity} ${line.soldAsUnit === 'PIECE' ? 'pieces' : 'meters'} @ $${line.price}/unit`
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
            <div className="grid gap-3 sm:grid-cols-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Returned item ID</label>
                <input
                  value={returnedScan.inventoryItemId}
                  onBlur={() => {
                    if (returnedScan.inventoryItemId.trim()) {
                      detectReturnedItem().catch((error: any) => {
                        const status = error?.response?.status;
                        const body = error?.response?.data;
                        setReturnedScanMessage(
                          `Not found${status ? ` (${status})` : ''}: ${
                            body?.error ?? body?.message ?? error?.message
                          }`
                        );
                      });
                    }
                  }}
                  onChange={(e) => {
                    setDetectedReturnedItem(null);
                    setReturnedScanMessage(null);
                    setReturnedScan((current) => ({ ...current, inventoryItemId: e.target.value }));
                  }}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Item ID, QR, or numeric code"
                />
                {returnedScanMessage && <p className="mt-2 text-xs text-gray-500">{returnedScanMessage}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  {amountLabelForUnit(
                    detectedReturnedItem ? soldAsUnitForItem(detectedReturnedItem) : undefined
                  )}{' '}
                  returned
                </label>
                <input
                  type="number"
                  min={detectedReturnedItem && soldAsUnitForItem(detectedReturnedItem) === 'PIECE' ? '1' : '0.01'}
                  step={detectedReturnedItem && soldAsUnitForItem(detectedReturnedItem) === 'PIECE' ? '1' : '0.01'}
                  value={returnedScan.amount}
                  onChange={(e) => setReturnedScan((current) => ({ ...current, amount: Number(e.target.value) }))}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Return price / unit</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={returnedScan.returnPrice}
                  onChange={(e) => setReturnedScan((current) => ({ ...current, returnPrice: Number(e.target.value) }))}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Returned from branch</label>
                <select
                  value={returnedScan.sourceBranch}
                  onChange={(e) => {
                    setDetectedReturnedItem(null);
                    setReturnedScanMessage(null);
                    setReturnedScan((current) => ({ ...current, sourceBranch: e.target.value as BranchCode }));
                  }}
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
                          {line.itemType}: {line.amount} {line.soldAsUnit === 'PIECE' ? 'pieces' : 'meters'} @ ${line.returnPrice}/unit from branch {line.sourceBranch}
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
            <div className="grid gap-3 sm:grid-cols-4">
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
                  step="0.01"
                  value={plainReturn.meters}
                  onChange={(e) => setPlainReturn((current) => ({ ...current, meters: Number(e.target.value) }))}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Return price / meter</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={plainReturn.returnPricePerMeter}
                  onChange={(e) => setPlainReturn((current) => ({ ...current, returnPricePerMeter: Number(e.target.value) }))}
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
                        <p className="text-sm text-gray-600">
                          {line.meters} meters @ ${line.returnPricePerMeter}/m returned
                        </p>
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
                <span>Returned credit</span>
                <span>${totalReturnedValue.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-base font-bold">
                <span>{netDue > 0 ? 'Customer pays' : netDue < 0 ? 'Refund customer' : 'Even exchange'}</span>
                <span>${Math.abs(netDue).toFixed(2)}</span>
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
              {netDue > 0 ? (
                <>
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
                </>
              ) : (
                <p className="rounded-2xl bg-gray-50 p-3 text-sm text-gray-600">
                  {netDue < 0
                    ? `Return credit is higher. Pay back $${Math.abs(netDue).toFixed(2)} to the customer.`
                    : 'No extra payment is needed for this exchange.'}
                </p>
              )}
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

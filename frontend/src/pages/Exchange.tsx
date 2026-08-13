import React, { useEffect, useMemo, useState } from 'react';
import api from '../lib/api';
import { getCurrentUser } from '../lib/auth';
import { useTranslation } from 'react-i18next';
import { formatCurrency, parsePriceInput, toPriceInputNumber } from '../lib/currency';
import { fetchPlainClothTypes, type PlainClothType } from '../lib/plainClothApi';
import QrScanInput from '../components/QrScanInput';
import { resolveInventoryItem } from '../lib/inventoryLookup';
import { BRANCH_ID_BY_CODE } from '../lib/inventoryCodes';

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
const soldAsUnitForItem = (item: InventoryLookupItem): 'METER' | 'PIECE' =>
  item.type === 'PIECE' ? 'PIECE' : 'METER';

const amountLabelForUnit = (unit?: 'METER' | 'PIECE') =>
  unit === 'PIECE' ? 'Quantity (pieces)' : 'Meters';

const ExchangePage: React.FC = () => {
  const { t } = useTranslation();
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
    clothName: '',
    meters: 1,
    pricePerMeter: 0,
  });
  const [plainClothTypes, setPlainClothTypes] = useState<PlainClothType[]>([]);

  useEffect(() => {
    void fetchPlainClothTypes()
      .then((items) => {
        setPlainClothTypes(items);
        if (items.length > 0) {
          const first = items[0];
          setPlainReturn((current) => ({
            ...current,
            clothName: current.clothName === 'Plain Cloth' ? first.name : current.clothName || first.name,
            returnPricePerMeter:
              current.returnPricePerMeter > 0
                ? current.returnPricePerMeter
                : toPriceInputNumber(first.pricePerM),
          }));
          setPlainSale((current) => ({
            ...current,
            clothName: current.clothName === 'Plain Cloth' ? first.name : current.clothName || first.name,
            pricePerMeter:
              current.pricePerMeter > 0
                ? current.pricePerMeter
                : toPriceInputNumber(first.pricePerM),
          }));
        }
      })
      .catch(() => setPlainClothTypes([]));
  }, []);

  const applyPlainClothToSale = (clothName: string) => {
    const selected = plainClothTypes.find((item) => item.name === clothName);
    setPlainSale((current) => ({
      ...current,
      clothName,
      pricePerMeter: selected ? toPriceInputNumber(selected.pricePerM) : current.pricePerMeter,
    }));
  };

  const applyPlainClothToReturn = (clothName: string) => {
    const selected = plainClothTypes.find((item) => item.name === clothName);
    setPlainReturn((current) => ({
      ...current,
      clothName,
      returnPricePerMeter: selected
        ? toPriceInputNumber(selected.pricePerM)
        : current.returnPricePerMeter,
    }));
  };

  const totalNewSaleAmount = useMemo(
    () =>
      newSaleLines.reduce((sum, line) => {
        if (line.type === 'inventory') {
          return sum + line.quantity * parsePriceInput(line.price);
        }
        return sum + line.meters * parsePriceInput(line.pricePerMeter);
      }, 0),
    [newSaleLines]
  );

  const totalReturnedValue = useMemo(
    () =>
      returnedInventory.reduce(
        (sum, item) => sum + item.amount * parsePriceInput(item.returnPrice),
        0
      ) +
      returnedPlain.reduce(
        (sum, item) => sum + item.meters * parsePriceInput(item.returnPricePerMeter),
        0
      ),
    [returnedInventory, returnedPlain]
  );

  const netDue = useMemo(
    () => Number((totalNewSaleAmount - totalReturnedValue).toFixed(2)),
    [totalNewSaleAmount, totalReturnedValue]
  );

  const dueAmount = useMemo(() => {
    if (netDue <= 0 || paymentStatus === 'FULL') return 0;
    return Math.max(0, netDue - parsePriceInput(amountPaid || 0));
  }, [amountPaid, netDue, paymentStatus]);

  const detectReturnedItemForCode = async (inventoryItemId: string, sourceBranch: BranchCode) => {
    const item = await resolveInventoryItem<InventoryLookupItem>(inventoryItemId, sourceBranch, BRANCH_ID_BY_CODE);
    setDetectedReturnedItem(item);
    if (item) {
      const unit = soldAsUnitForItem(item);
      setReturnedScanMessage(
        t('exchange.itemDetected', {
          type: item.type,
          unit: unit === 'PIECE' ? t('sales.pieceQuantity') : t('sales.decimalMeters'),
        })
      );
    }
    return item;
  };

  const detectNewItemForCode = async (inventoryItemId: string, sourceBranch: BranchCode) => {
    const item = await resolveInventoryItem<InventoryLookupItem>(inventoryItemId, sourceBranch, BRANCH_ID_BY_CODE);
    setDetectedNewItem(item);
    if (item) {
      const unit = soldAsUnitForItem(item);
      setNewScanMessage(
        t('exchange.itemDetected', {
          type: item.type,
          unit: unit === 'PIECE' ? t('sales.pieceQuantity') : t('sales.decimalMeters'),
        })
      );
    }
    return item;
  };

  const detectReturnedItem = () =>
    detectReturnedItemForCode(returnedScan.inventoryItemId, returnedScan.sourceBranch);

  const detectNewItem = () => detectNewItemForCode(newScan.inventoryItemId, newScan.sourceBranch);

  const handleReturnedScanLookupError = (error: unknown) => {
    const apiError = error as { response?: { status?: number; data?: { error?: string; message?: string } }; message?: string };
    const status = apiError?.response?.status;
    const body = apiError?.response?.data;
    setReturnedScanMessage(
      t('common.notFound', {
        status: status ? t('common.notFoundStatus', { status }) : '',
        message: body?.error ?? body?.message ?? apiError?.message,
      })
    );
  };

  const handleNewScanLookupError = (error: unknown) => {
    const apiError = error as { response?: { status?: number; data?: { error?: string; message?: string } }; message?: string };
    const status = apiError?.response?.status;
    const body = apiError?.response?.data;
    setNewScanMessage(
      t('common.notFound', {
        status: status ? t('common.notFoundStatus', { status }) : '',
        message: body?.error ?? body?.message ?? apiError?.message,
      })
    );
  };

  const addReturnedInventory = async () => {
    const inventoryItemId = returnedScan.inventoryItemId.trim();
    if (!inventoryItemId) {
      return alert(t('exchange.enterReturnedItemId'));
    }
    if (returnedScan.amount <= 0) {
      return alert(t('exchange.enterReturnedAmount'));
    }
    if (returnedScan.returnPrice < 0) {
      return alert(t('exchange.returnPriceNegative'));
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
        return alert(t('exchange.enterQuantityOrMeters'));
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
        t('exchange.unableToLoadReturned', {
          status: status ? t('common.requestFailedStatus', { status }) : '',
          message: body?.error ?? body?.message ?? error?.message,
        })
      );
    }
  };

  const addNewSaleLine = async () => {
    const inventoryItemId = newScan.inventoryItemId.trim();
    if (!inventoryItemId) {
      return alert(t('exchange.enterNewSaleItemId'));
    }
    if (newScan.amount <= 0 || newScan.price <= 0) {
      return alert(t('exchange.enterValidAmountPrice'));
    }

    try {
      const item = detectedNewItem?.id === inventoryItemId ? detectedNewItem : await detectNewItem();
      if (!item) return;
      const soldAsUnit = soldAsUnitForItem(item);
      const quantity = soldAsUnit === 'PIECE' ? Math.floor(newScan.amount) : newScan.amount;

      if (quantity <= 0) {
        return alert(t('exchange.enterQuantityOrMeters'));
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
        t('exchange.unableToLoadSaleItem', {
          status: status ? t('common.requestFailedStatus', { status }) : '',
          message: body?.error ?? body?.message ?? error?.message,
        })
      );
    }
  };

  const addPlainReturnLine = () => {
    if (plainReturn.meters <= 0) {
      return alert(t('exchange.enterReturnedMeters'));
    }
    if (plainReturn.returnPricePerMeter < 0) {
      return alert(t('exchange.returnedPlainPriceNegative'));
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
      return alert(t('exchange.enterValidPlainCloth'));
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
      return alert(t('exchange.mustBeLoggedIn'));
    }
    if (!customerName.trim() || !customerPhone.trim()) {
      return alert(t('exchange.provideCustomer'));
    }
    if (returnedInventory.length === 0 && returnedPlain.length === 0 && newSaleLines.length === 0) {
      return alert(t('exchange.addItemsFirst'));
    }
    if (netDue > 0 && paymentStatus === 'PARTIAL' && parsePriceInput(amountPaid) <= 0) {
      return alert(t('exchange.enterPartialPayment'));
    }
    if (netDue > 0 && paymentStatus === 'PARTIAL' && parsePriceInput(amountPaid) >= netDue) {
      return alert(t('exchange.useFullyPaid'));
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
            soldPrice: parsePriceInput(line.price),
          };
        }
        return {
          colorId: 'PLAIN',
          soldAsUnit: 'METER',
          quantitySold: line.meters,
          soldPrice: parsePriceInput(line.pricePerMeter),
          isPlainCloth: true,
          plainClothName: line.clothName,
        };
      });

      const exchangePayload = {
        branchId: BRANCH_ID_BY_CODE[selectedBranch],
        employeeId: currentUser.id,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        returnedInventory: returnedInventory.map((line) => ({
          inventoryItemId: line.inventoryItemId,
          soldAsUnit: line.soldAsUnit,
          quantityReturned: line.amount,
          returnPrice: parsePriceInput(line.returnPrice),
        })),
        returnedPlain: returnedPlain.map((line) => ({
          clothName: line.clothName,
          meters: line.meters,
          returnPricePerMeter: parsePriceInput(line.returnPricePerMeter),
          note: line.note,
        })),
        replacementItems,
        paymentStatus: netDue > 0 ? paymentStatus : 'FULL',
        amountPaid: netDue > 0 && paymentStatus === 'PARTIAL' ? parsePriceInput(amountPaid) : undefined,
        notes: `Exchange at branch ${selectedBranch}. Returned inventory: ${returnedInventory.length}. Returned plain cloth lines: ${returnedPlain.length}.`,
      };

      const exchangeResponse = await api.post('/sales/exchange', exchangePayload);
      const createdSale = exchangeResponse.data.sale;
      const summary = exchangeResponse.data.summary;

      setSuccessMessage(
        t('exchange.exchangeProcessed', {
          replacement: formatCurrency(summary.replacementTotal),
          returned: formatCurrency(summary.returnedTotal),
          net: formatCurrency(summary.netDue),
        }) + (createdSale ? t('exchange.newSaleId', { id: createdSale.id }) : '')
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
        t('exchange.exchangeFailed', {
          status: status ? t('common.requestFailedStatus', { status }) : '',
          message: body?.error ?? body?.message ?? error?.message ?? t('errors.unexpected'),
        })
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
          <h2 className="text-2xl font-bold text-black">{t('exchange.title')}</h2>
          <p className="text-sm text-gray-600 max-w-2xl">
            {t('exchange.subtitle')}
          </p>
        </div>
        <div className="text-sm text-gray-500">{t('exchange.currentBranch', { branch: selectedBranch })}</div>
      </div>

      <section className="mt-6 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-black mb-4">{t('exchange.selectBranchTitle')}</h3>
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
            <h3 className="text-lg font-semibold text-black">{t('exchange.newExchangeSale')}</h3>
            <p className="text-sm text-gray-500 mb-4">
              {t('exchange.newExchangeDescription')}
            </p>

            <div className="grid gap-3 sm:grid-cols-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">{t('exchange.scanQrItemId')}</label>
                <QrScanInput
                  className="mt-1"
                  value={newScan.inventoryItemId}
                  onChange={(value) => {
                    setDetectedNewItem(null);
                    setNewScanMessage(null);
                    setNewScan((current) => ({ ...current, inventoryItemId: value }));
                  }}
                  onScan={(value) => {
                    setDetectedNewItem(null);
                    setNewScanMessage(null);
                    setNewScan((current) => ({ ...current, inventoryItemId: value }));
                    detectNewItemForCode(value, newScan.sourceBranch).catch(handleNewScanLookupError);
                  }}
                  placeholder={t('exchange.itemIdPlaceholder')}
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
                <label className="block text-sm font-medium text-gray-700">{t('exchange.pricePerUnit')}</label>
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
                <label className="block text-sm font-medium text-gray-700">{t('exchange.sourceBranch')}</label>
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
              <h4 className="text-base font-semibold text-black mb-3">{t('exchange.plainClothReplacement')}</h4>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">{t('exchange.plainClothName')}</label>
                  {plainClothTypes.length > 0 ? (
                    <select
                      value={plainSale.clothName}
                      onChange={(e) => applyPlainClothToSale(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                    >
                      {plainClothTypes.map((item) => (
                        <option key={item.id} value={item.name}>{item.name}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={plainSale.clothName}
                      onChange={(e) => setPlainSale((current) => ({ ...current, clothName: e.target.value }))}
                      className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                    />
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">{t('exchange.meters')}</label>
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
                  <label className="block text-sm font-medium text-gray-700">{t('exchange.pricePerMeter')}</label>
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
              <h4 className="text-base font-semibold text-black">{t('exchange.replacementLines')}</h4>
              {newSaleLines.length === 0 ? (
                <div className="mt-3 text-sm text-gray-500">{t('exchange.noReplacementItems')}</div>
              ) : (
                <div className="mt-3 space-y-3">
                  {newSaleLines.map((line, index) => (
                    <div key={index} className="flex items-center justify-between rounded-2xl border border-gray-200 bg-gray-50 p-3">
                      <div>
                        <p className="font-semibold text-black">
                          {line.type === 'inventory' ? t('exchange.inventoryLine', { id: line.inventoryItemId }) : t('exchange.plainClothParen', { name: line.clothName })}
                        </p>
                        <p className="text-sm text-gray-600">
                          {line.type === 'inventory'
                            ? `${line.itemType}: ${line.quantity} ${line.soldAsUnit === 'PIECE' ? 'pieces' : 'meters'} @ ${formatCurrency(parsePriceInput(line.price))}/unit`
                            : `${line.meters} meters @ ${formatCurrency(parsePriceInput(line.pricePerMeter))}/m`}
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
            <h3 className="text-lg font-semibold text-black">{t('exchange.returnedInventory')}</h3>
            <p className="text-sm text-gray-500 mb-4">
              {t('exchange.returnedInventoryDescription')}
            </p>
            <div className="grid gap-3 sm:grid-cols-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">{t('exchange.returnedItemId')}</label>
                <QrScanInput
                  className="mt-1"
                  value={returnedScan.inventoryItemId}
                  onChange={(value) => {
                    setDetectedReturnedItem(null);
                    setReturnedScanMessage(null);
                    setReturnedScan((current) => ({ ...current, inventoryItemId: value }));
                  }}
                  onScan={(value) => {
                    setDetectedReturnedItem(null);
                    setReturnedScanMessage(null);
                    setReturnedScan((current) => ({ ...current, inventoryItemId: value }));
                    detectReturnedItemForCode(value, returnedScan.sourceBranch).catch(handleReturnedScanLookupError);
                  }}
                  placeholder={t('exchange.itemIdPlaceholder')}
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
                <label className="block text-sm font-medium text-gray-700">{t('exchange.returnPricePerUnit')}</label>
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
                <label className="block text-sm font-medium text-gray-700">{t('exchange.returnedFromBranch')}</label>
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
              <h4 className="text-base font-semibold text-black">{t('exchange.returnedLines')}</h4>
              {returnedInventory.length === 0 ? (
                <div className="mt-3 text-sm text-gray-500">{t('exchange.noReturnedInventory')}</div>
              ) : (
                <div className="mt-3 space-y-3">
                  {returnedInventory.map((line, index) => (
                    <div key={index} className="flex items-center justify-between rounded-2xl border border-gray-200 bg-gray-50 p-3">
                      <div>
                        <p className="font-semibold text-black">{t('exchange.returnedItem', { id: line.inventoryItemId })}</p>
                        <p className="text-sm text-gray-600">
                          {line.itemType}: {line.amount} {line.soldAsUnit === 'PIECE' ? 'pieces' : 'meters'} @ {formatCurrency(parsePriceInput(line.returnPrice))}/unit from branch {line.sourceBranch}
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
            <h3 className="text-lg font-semibold text-black">{t('exchange.returnedPlainCloth')}</h3>
            <p className="text-sm text-gray-500 mb-4">
              {t('exchange.returnedPlainDescription')}
            </p>
            <div className="grid gap-3 sm:grid-cols-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">{t('exchange.plainClothName')}</label>
                {plainClothTypes.length > 0 ? (
                  <select
                    value={plainReturn.clothName}
                    onChange={(e) => applyPlainClothToReturn(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                  >
                    {plainClothTypes.map((item) => (
                      <option key={item.id} value={item.name}>{item.name}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={plainReturn.clothName}
                    onChange={(e) => setPlainReturn((current) => ({ ...current, clothName: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                  />
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">{t('exchange.metersReturned')}</label>
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
                <label className="block text-sm font-medium text-gray-700">{t('exchange.returnPricePerMeter')}</label>
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
                <label className="block text-sm font-medium text-gray-700">{t('common.note')}</label>
                <input
                  value={plainReturn.note}
                  onChange={(e) => setPlainReturn((current) => ({ ...current, note: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                  placeholder={t('exchange.notePlaceholder')}
                />
              </div>
            </div>
            <button type="button" className="btn-primary mt-4" onClick={addPlainReturnLine}>
              Add returned plain cloth
            </button>
            <div className="mt-6 border-t border-gray-200 pt-4">
              <h4 className="text-base font-semibold text-black">{t('exchange.returnedPlainLines')}</h4>
              {returnedPlain.length === 0 ? (
                <div className="mt-3 text-sm text-gray-500">{t('exchange.noReturnedPlain')}</div>
              ) : (
                <div className="mt-3 space-y-3">
                  {returnedPlain.map((line, index) => (
                    <div key={index} className="flex items-center justify-between rounded-2xl border border-gray-200 bg-gray-50 p-3">
                      <div>
                        <p className="font-semibold text-black">{line.clothName}</p>
                        <p className="text-sm text-gray-600">
                          {line.meters} meters @ {formatCurrency(parsePriceInput(line.returnPricePerMeter))}/m returned
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
            <h3 className="text-lg font-semibold text-black">{t('exchange.exchangeSummary')}</h3>
            <div className="mt-4 space-y-3 text-sm text-gray-700">
              <div className="flex justify-between">
                <span>{t('exchange.returnedInventoryLines')}</span>
                <span>{returnedInventory.length}</span>
              </div>
              <div className="flex justify-between">
                <span>{t('exchange.returnedPlainLines')}</span>
                <span>{returnedPlain.length}</span>
              </div>
              <div className="flex justify-between">
                <span>{t('exchange.newReplacementLines')}</span>
                <span>{newSaleLines.length}</span>
              </div>
              <div className="flex justify-between font-semibold">
                <span>{t('exchange.replacementValue')}</span>
                <span>{formatCurrency(totalNewSaleAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span>{t('exchange.returnedCredit')}</span>
                <span>{formatCurrency(totalReturnedValue)}</span>
              </div>
              <div className="flex justify-between text-base font-bold">
                <span>
                  {netDue > 0
                    ? t('exchange.customerPays')
                    : netDue < 0
                      ? t('exchange.refundCustomer')
                      : t('exchange.evenExchange')}
                </span>
                <span>{formatCurrency(Math.abs(netDue))}</span>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-black">{t('exchange.customerDetails')}</h3>
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">{t('exchange.customerName')}</label>
                <input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">{t('exchange.customerPhone')}</label>
                <input
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              {netDue > 0 ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">{t('exchange.paymentStatus')}</label>
                    <select
                      value={paymentStatus}
                      onChange={(e) => setPaymentStatus(e.target.value as 'FULL' | 'PARTIAL')}
                      className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                    >
                      <option value="FULL">{t('paymentStatus.fullyPaid')}</option>
                      <option value="PARTIAL">{t('paymentStatus.partiallyPaid')}</option>
                    </select>
                  </div>
                  {paymentStatus === 'PARTIAL' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700">{t('exchange.amountPaidNow')}</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={amountPaid}
                        onChange={(e) => setAmountPaid(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                      />
                      <p className="mt-2 text-sm text-gray-500">{t('exchange.remainingDue', { amount: formatCurrency(dueAmount) })}</p>
                    </div>
                  )}
                </>
              ) : (
                <p className="rounded-2xl bg-gray-50 p-3 text-sm text-gray-600">
                  {netDue < 0
                    ? t('exchange.refundHigher', { amount: formatCurrency(Math.abs(netDue)) })
                    : t('exchange.noExtraPayment')}
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
              {isProcessing ? t('common.processingExchange') : t('exchange.processExchange')}
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

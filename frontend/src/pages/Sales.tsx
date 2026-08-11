import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import QrScanInput from '../components/QrScanInput';
import api from '../lib/api';
import { getCurrentUser } from '../lib/auth';
import { getItemMinimumPrice } from '../lib/dashboardSettings';
import { formatCurrency, parsePriceInput, toPriceInputNumber } from '../lib/currency';
import { completeCuttingTasksAfterRollToPiece, maybeCreateCuttingTaskAfterPieceSale } from '../lib/cuttingTasks';
import { sellCutPiece } from '../lib/cutAndSell';
import { getColorLabel } from '../lib/colorLabels';
import { resolveInventoryItem } from '../lib/inventoryLookup';
import { isBelowRemnantThreshold } from '../lib/inventoryRules';
import { printPieceInventoryLabel } from '../lib/pieceLabel';
import {
  cutRollToPieceStock,
  itemSubCode,
  type RollInventoryItem,
} from '../lib/rollToPiece';
import type { BranchCode } from '../lib/taskSettings';
import {
  formatPackageComponentsSold,
  formatPackageStockSummary,
  formatPackageSummary,
  parsePackageComponents,
  resolvePackageComponentStock,
  type PackageComponent,
  type PackageComponentSold,
} from '../lib/piecePackages';

type PackageSaleMode = 'FULL' | 'PARTIAL';

type InventorySaleLine = {
  type: 'inventory';
  inventoryItemId: string;
  sourceBranch: string;
  description: string;
  colorId: string;
  soldAsUnit: 'METER' | 'PIECE';
  quantity: number;
  price: number;
  sourceItemId?: string | null;
  code?: number;
  colorName?: string;
  isPiecePackage?: boolean;
  packageSaleMode?: PackageSaleMode;
  packagesSold?: number;
  packageComponentsSold?: PackageComponentSold[];
  packageSummary?: string;
};

type PlainClothSaleLine = {
  type: 'plain';
  clothName: string;
  meters: number;
  pricePerMeter: number;
};

type SaleLine = InventorySaleLine | PlainClothSaleLine;

type InventoryLookupItem = {
  id: string;
  branchId: string;
  colorId: string;
  type: 'ROLL' | 'PIECE' | 'REMANENT';
  meters?: string | number | null;
  quantity: number;
  code?: number;
  subCode?: number | string;
  costPrice?: number | string;
  color?: { name?: string };
  sourceItemId?: string | null;
  isPiecePackage?: boolean;
  packageComponents?: PackageComponent[];
  packageComponentStock?: Record<string, number>;
};

import type { TFunction } from 'i18next';

const packagePriceLabel = (t: TFunction, isPiecePackage?: boolean, mode?: PackageSaleMode) => {
  if (isPiecePackage && mode === 'FULL') return t('sales.pricePerPackage');
  if (isPiecePackage && mode === 'PARTIAL') return t('sales.salePriceTotal');
  return t('sales.unitPrice');
};

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

const soldAsUnitForItem = (item: InventoryLookupItem): 'METER' | 'PIECE' =>
  item.type === 'PIECE' ? 'PIECE' : 'METER';

const amountLabelForUnit = (
  t: TFunction,
  unit?: 'METER' | 'PIECE',
  isPiecePackage?: boolean,
  mode?: PackageSaleMode
) => {
  if (isPiecePackage && mode === 'FULL') return t('sales.packages');
  if (isPiecePackage && mode === 'PARTIAL') return t('sales.selectedPieces');
  return unit === 'PIECE' ? t('sales.quantityPieces') : t('common.meters');
};

const buildInitialPackageSelection = (components: PackageComponent[]): PackageComponentSold[] =>
  components.map((component) => ({ name: component.name, quantity: 0 }));

const SalesView: React.FC = () => {
  const { t } = useTranslation();
  const [branch, setBranch] = useState<string>('A');
  const [cart, setCart] = useState<SaleLine[]>([]);
  const [customerName, setCustomerName] = useState('Walk-in');
  const [customerPhone, setCustomerPhone] = useState('0000000000');
  const [paymentStatus, setPaymentStatus] = useState<'FULL' | 'PARTIAL'>('FULL');
  const [amountPaid, setAmountPaid] = useState('0');
  const [plainCloth, setPlainCloth] = useState({ clothName: clothOptions[0], meters: 1, pricePerMeter: 20 });
  const [scanState, setScanState] = useState({ inventoryItemId: '', sourceBranch: branch, amount: 1, price: 15 });
  const [detectedScanItem, setDetectedScanItem] = useState<InventoryLookupItem | null>(null);
  const [packageSaleMode, setPackageSaleMode] = useState<PackageSaleMode>('FULL');
  const [packageComponentsSold, setPackageComponentsSold] = useState<PackageComponentSold[]>([]);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [minimumPriceMessage, setMinimumPriceMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [rollCutScan, setRollCutScan] = useState({ rollId: '', cutMeters: 2.25, price: 15 });
  const [rollCutSource, setRollCutSource] = useState<RollInventoryItem | null>(null);
  const [isCuttingRoll, setIsCuttingRoll] = useState(false);
  const [cutSaleSummary, setCutSaleSummary] = useState<{
    pieceItemId: string;
    qrCodeDataUrl: string;
    rollSourceId: string;
    labelPrinted: boolean;
  } | null>(null);

  const detectedPackageComponents = useMemo(
    () => parsePackageComponents(detectedScanItem?.packageComponents),
    [detectedScanItem]
  );

  const detectedPackageStock = useMemo(() => {
    if (!detectedScanItem?.isPiecePackage) return {};
    return resolvePackageComponentStock({
      packageComponents: detectedScanItem.packageComponents,
      packageComponentStock: detectedScanItem.packageComponentStock,
      quantity: detectedScanItem.quantity,
    });
  }, [detectedScanItem]);

  const selectedPackagePieces = useMemo(
    () => packageComponentsSold.reduce((sum, component) => sum + component.quantity, 0),
    [packageComponentsSold]
  );

  const remainingPackagePreview = useMemo(() => {
    if (!detectedScanItem?.isPiecePackage || packageSaleMode !== 'PARTIAL') return null;
    const nextStock = { ...detectedPackageStock };
    for (const component of packageComponentsSold) {
      if (component.quantity <= 0) continue;
      nextStock[component.name] = Math.max(0, (nextStock[component.name] ?? 0) - component.quantity);
      if (nextStock[component.name] === 0) delete nextStock[component.name];
    }
    return nextStock;
  }, [
    detectedPackageStock,
    detectedScanItem?.isPiecePackage,
    packageComponentsSold,
    packageSaleMode,
  ]);

  const lineTotal = (line: SaleLine) => {
    if (line.type === 'inventory') return line.quantity * parsePriceInput(line.price);
    return line.meters * parsePriceInput(line.pricePerMeter);
  };

  const saleTotal = useMemo(
    () => cart.reduce((sum, line) => sum + lineTotal(line), 0),
    [cart]
  );

  const dueAmount = useMemo(() => {
    if (paymentStatus === 'FULL') return 0;
    return Math.max(0, saleTotal - parsePriceInput(amountPaid || 0));
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

  const detectScanItemForCode = async (inventoryItemId: string, sourceBranch: string) => {
    const item = await resolveInventoryItem<InventoryLookupItem>(inventoryItemId, sourceBranch, BRANCH_MAP);
    setDetectedScanItem(item);
    if (item) {
      const unit = soldAsUnitForItem(item);
      const components = parsePackageComponents(item.packageComponents);
      const savedPrice = getItemMinimumPrice(item.id);
      if (savedPrice) {
        setScanState((current) => ({
          ...current,
          price: Math.max(current.price, toPriceInputNumber(savedPrice.minimumPrice)),
        }));
        setMinimumPriceMessage(
          t('sales.minimumPriceFor', {
            id: item.id,
            price: formatCurrency(savedPrice.minimumPrice),
            unit: savedPrice.unit === 'PIECE' ? t('common.piece') : t('common.meter'),
          })
        );
      } else {
        setMinimumPriceMessage(null);
      }

      if (item.isPiecePackage && components.length > 0) {
        setPackageSaleMode('FULL');
        setPackageComponentsSold(buildInitialPackageSelection(components));
        const stock = resolvePackageComponentStock({
          packageComponents: item.packageComponents,
          packageComponentStock: item.packageComponentStock,
          quantity: item.quantity,
        });
        setScanMessage(
          t('sales.piecePackageDetected', {
            summary: formatPackageSummary(components),
            stock: formatPackageStockSummary(stock),
          })
        );
      } else {
        setPackageSaleMode('FULL');
        setPackageComponentsSold([]);
        setScanMessage(
          t('sales.itemDetected', {
            type: item.type,
            unit:
              unit === 'PIECE' ? t('sales.pieceQuantity') : t('sales.decimalMeters'),
          })
        );
      }
    }
    return item;
  };

  const detectScanItem = () =>
    detectScanItemForCode(scanState.inventoryItemId, scanState.sourceBranch);

  const handleScanLookupError = (error: unknown, scannedCode?: string) => {
    const apiError = error as { response?: { status?: number; data?: { error?: string; message?: string } }; message?: string };
    const status = apiError?.response?.status;
    const body = apiError?.response?.data;
    const baseMessage = body?.error ?? body?.message ?? apiError?.message;
    setScanMessage(
      scannedCode
        ? t('qrScanner.lookupFailedWithCode', { code: scannedCode, message: baseMessage ?? t('qrScanner.itemNotFound') })
        : t('common.notFound', {
            status: status ? t('common.notFoundStatus', { status }) : '',
            message: baseMessage,
          })
    );
  };

  const updatePackagePieceSold = (name: string, quantity: number) => {
    setPackageComponentsSold((current) =>
      current.map((component) =>
        component.name === name
          ? { ...component, quantity: Math.max(0, Math.floor(quantity)) }
          : component
      )
    );
  };

  const addInventoryLine = async () => {
    const inventoryItemId = scanState.inventoryItemId.trim();
    if (!inventoryItemId) {
      return alert(t('sales.enterItemId'));
    }
    if (scanState.price <= 0) {
      return alert(t('sales.enterValidPrice'));
    }

    try {
      const item = detectedScanItem?.id === inventoryItemId ? detectedScanItem : await detectScanItem();
      if (!item) return;
      const soldAsUnit = soldAsUnitForItem(item);
      const savedPrice = getItemMinimumPrice(item.id);
      const components = parsePackageComponents(item.packageComponents);
      const isPiecePackage = Boolean(item.isPiecePackage && components.length > 0);

      let quantity = soldAsUnit === 'PIECE' ? Math.floor(scanState.amount) : scanState.amount;
      const price = scanState.price;
      let description = t('sales.descriptionInventory', { type: item.type, branch: scanState.sourceBranch });
      let packageSummary = '';
      let linePackageMode: PackageSaleMode | undefined;
      let packagesSold: number | undefined;
      let componentsSold: PackageComponentSold[] | undefined;

      if (isPiecePackage) {
        if (packageSaleMode === 'FULL') {
          packagesSold = Math.floor(scanState.amount);
          if (packagesSold <= 0) return alert(t('sales.enterOnePackage'));
          quantity = packagesSold;
          linePackageMode = 'FULL';
          packageSummary = t('sales.fullPackagesSummary', { count: packagesSold, summary: formatPackageSummary(components) });
          description = t('sales.descriptionPackage', { branch: scanState.sourceBranch });
        } else {
          componentsSold = packageComponentsSold.filter((component) => component.quantity > 0);
          if (componentsSold.length === 0) {
            return alert(t('sales.selectPackagePiece'));
          }
          quantity = 1;
          linePackageMode = 'PARTIAL';
          packageSummary = formatPackageComponentsSold(componentsSold);
          description = t('sales.descriptionPartial', { branch: scanState.sourceBranch });
        }
      } else if (quantity <= 0) {
        return alert(t('sales.enterQuantityOrMeters'));
      }

      if (savedPrice && parsePriceInput(price) < savedPrice.minimumPrice) {
        return alert(t('sales.minimumPriceAlert', { price: formatCurrency(savedPrice.minimumPrice) }));
      }

      setCart((current) => [
        ...current,
        {
          type: 'inventory',
          inventoryItemId: item.id,
          sourceBranch: scanState.sourceBranch,
          description,
          colorId: item.colorId,
          soldAsUnit,
          quantity,
          price,
          sourceItemId: item.sourceItemId,
          code: item.code,
          colorName: item.color?.name,
          isPiecePackage,
          packageSaleMode: linePackageMode,
          packagesSold,
          packageComponentsSold: componentsSold,
          packageSummary,
        },
      ]);
      setScanState((current) => ({ ...current, inventoryItemId: '', amount: 1 }));
      setDetectedScanItem(null);
      setPackageSaleMode('FULL');
      setPackageComponentsSold([]);
      setScanMessage(null);
      setMinimumPriceMessage(null);
    } catch (error: any) {
      const status = error?.response?.status;
      const body = error?.response?.data;
      alert(
        t('sales.unableToLoadItem', {
          status: status ? t('common.requestFailedStatus', { status }) : '',
          message: body?.error ?? body?.message ?? error?.message,
        })
      );
    }
  };

  const removeLine = (index: number) => {
    setCart((current) => current.filter((_, idx) => idx !== index));
  };

  const loadRollForSaleCut = async (scannedRollId?: string) => {
    const rollId = (scannedRollId ?? rollCutScan.rollId).trim();
    if (!rollId) {
      return alert(t('itemConversion.enterItemIdFirst'));
    }

    if (scannedRollId) {
      setRollCutScan((current) => ({ ...current, rollId: scannedRollId }));
    }

    try {
      const response = await api.get(`/inventory/${encodeURIComponent(rollId)}`);
      const item = response.data as RollInventoryItem;
      if (item.type !== 'ROLL' && item.type !== 'REMANENT') {
        return alert(t('itemConversion.onlyRollsRemnants'));
      }
      setRollCutSource(item);
      setRollCutScan((current) => ({
        ...current,
        price: itemSubCode(item),
      }));
      setCutSaleSummary(null);
    } catch (error: any) {
      const status = error?.response?.status;
      const body = error?.response?.data;
      alert(
        t('sales.unableToLoadItem', {
          status: status ? t('common.requestFailedStatus', { status }) : '',
          message: body?.error ?? body?.message ?? error?.message,
        })
      );
    }
  };

  const cutRollSellAndPrint = async () => {
    if (!rollCutSource) {
      return alert(t('itemConversion.loadRollFirst'));
    }
    const meters = Number(rollCutScan.cutMeters);
    const price = Number(rollCutScan.price);
    if (!Number.isFinite(meters) || meters <= 0) {
      return alert(t('itemConversion.enterValidMetersToCut'));
    }
    if (isBelowRemnantThreshold(meters)) {
      return alert(t('sales.cutOnlyPieces'));
    }
    if (!Number.isFinite(price) || price <= 0) {
      return alert(t('sales.enterValidPrice'));
    }
    if (!customerName.trim() || !customerPhone.trim()) {
      return alert(t('sales.provideCustomer'));
    }
    const currentUser = getCurrentUser();
    if (!currentUser) {
      return alert(t('sales.mustBeLoggedIn'));
    }
    if (meters > Number(rollCutSource.meters ?? 0)) {
      return alert(t('itemConversion.cutExceedsRoll'));
    }

    setIsCuttingRoll(true);
    setSuccessMessage(null);
    setCutSaleSummary(null);

    try {
      const result = await cutRollToPieceStock(rollCutSource, meters, { uniquePiece: true });
      await sellCutPiece({
        pieceItemId: result.pieceItemId,
        colorId: rollCutSource.colorId,
        branchId: rollCutSource.branchId,
        employeeId: currentUser.id,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        soldPrice: parsePriceInput(price),
        rollSourceId: rollCutSource.id,
        qrCodeValue: result.pieceItemId,
        qrCodeDataUrl: result.qrCodeDataUrl,
      });

      const labelPrinted = printPieceInventoryLabel({
        t,
        itemId: result.pieceItemId,
        qrDataUrl: result.qrCodeDataUrl,
        familyCode: rollCutSource.code,
        subCode: itemSubCode(rollCutSource),
        type: 'PIECE',
        pieceLength: result.pieceLength,
        colorName: rollCutSource.color?.name,
        branchId: rollCutSource.branchId,
      });

      completeCuttingTasksAfterRollToPiece({
        rollItemId: rollCutSource.id,
        branchId: rollCutSource.branchId,
        code: rollCutSource.code,
        colorName: rollCutSource.color?.name,
        newPieceId: result.pieceItemId,
      });

      const refreshed = await api.get(`/inventory/${encodeURIComponent(rollCutSource.id)}`);
      setRollCutSource(refreshed.data as RollInventoryItem);
      setCutSaleSummary({
        pieceItemId: result.pieceItemId,
        qrCodeDataUrl: result.qrCodeDataUrl,
        rollSourceId: rollCutSource.id,
        labelPrinted,
      });
      setSuccessMessage(
        labelPrinted ? t('sales.cutSellPrintComplete') : t('sales.cutSellComplete')
      );
    } catch (error: any) {
      const status = error?.response?.status;
      const body = error?.response?.data;
      alert(
        t('sales.cutSellFailed', {
          status: status ? t('common.requestFailedStatus', { status }) : '',
          message: body?.error ?? body?.message ?? error?.message ?? t('itemConversion.failedToCut'),
        })
      );
    } finally {
      setIsCuttingRoll(false);
    }
  };

  const reprintCutSaleLabel = () => {
    if (!cutSaleSummary || !rollCutSource) return;
    const printed = printPieceInventoryLabel({
      t,
      itemId: cutSaleSummary.pieceItemId,
      qrDataUrl: cutSaleSummary.qrCodeDataUrl,
      familyCode: rollCutSource.code,
      subCode: itemSubCode(rollCutSource),
      type: 'PIECE',
      pieceLength: Number(rollCutScan.cutMeters),
      colorName: rollCutSource.color?.name,
      branchId: rollCutSource.branchId,
    });
    if (!printed) alert(t('errors.allowPopups'));
  };

  const createSale = async () => {
    if (!branch) return alert(t('sales.selectBranch'));
    if (cart.length === 0) return alert(t('sales.addLine'));
    if (!customerName.trim() || !customerPhone.trim()) return alert(t('sales.provideCustomer'));
    if (paymentStatus === 'PARTIAL' && parsePriceInput(amountPaid) <= 0) return alert(t('sales.enterPartialPayment'));

    setIsSubmitting(true);
    setSuccessMessage(null);

    const currentUser = getCurrentUser();
    if (!currentUser) {
      setIsSubmitting(false);
      return alert(t('sales.mustBeLoggedIn'));
    }

    try {
      const resolvedItems: any[] = [];

      for (const line of cart) {
        if (line.type === 'inventory') {
          const payload: Record<string, unknown> = {
            inventoryItemId: line.inventoryItemId,
            colorId: line.colorId,
            soldAsUnit: line.soldAsUnit,
            quantitySold: line.quantity,
            soldPrice: parsePriceInput(line.price),
            lineDiscount: 0,
          };
          if (line.isPiecePackage) {
            payload.isPiecePackage = true;
            payload.packageSaleMode = line.packageSaleMode;
            if (line.packageSaleMode === 'FULL') {
              payload.packagesSold = line.packagesSold ?? line.quantity;
            } else {
              payload.packageComponentsSold = line.packageComponentsSold ?? [];
            }
          }
          resolvedItems.push(payload);
        } else {
          resolvedItems.push({
            inventoryItemId: undefined,
            colorId: 'PLAIN',
            soldAsUnit: 'METER',
            quantitySold: line.meters,
            soldPrice: parsePriceInput(line.pricePerMeter),
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
        notes: `Source branch: ${branch}. ${paymentStatus === 'PARTIAL' ? `Paid ${formatCurrency(parsePriceInput(amountPaid))} now, due ${formatCurrency(dueAmount)}.` : 'Fully paid.'}`,
      };

      console.debug('createSale payload', payload);

      // Retry once on server/network errors
      let attempt = 0;
      const maxAttempts = 2;
      let saleId: string | undefined;
      while (attempt < maxAttempts) {
        try {
          const saleResponse = await api.post('/sales', payload);
          saleId = saleResponse.data?.sale?.id;
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
      let cuttingTasksCreated = 0;
      for (const line of cart) {
        if (line.type !== 'inventory' || line.soldAsUnit !== 'PIECE') continue;
        try {
          const task = await maybeCreateCuttingTaskAfterPieceSale({
            soldItemId: line.inventoryItemId,
            saleId,
            branchCode: (line.sourceBranch as BranchCode) || (branch as BranchCode),
            assignedTo: 'Inventory team',
          });
          if (task) cuttingTasksCreated += 1;
        } catch (taskError) {
          console.warn('Failed to evaluate cutting task after piece sale', taskError);
        }
      }
      setSuccessMessage(
        cuttingTasksCreated > 0
          ? t('sales.saleCreatedWithTasks', { branch, total: formatCurrency(saleTotal), count: cuttingTasksCreated })
          : t('sales.saleCreated', { branch, total: formatCurrency(saleTotal) })
      );
      setCart([]);
      setAmountPaid('0');
      setPaymentStatus('FULL');
    } catch (err: any) {
      const status = err?.response?.status;
      const body = err?.response?.data;
      const msg = body?.error ?? body?.message ?? err?.message ?? t('sales.failedToCreate');
      alert(t('common.requestFailed', { status: status ? t('common.requestFailedStatus', { status }) : '', message: msg }));
      console.error('Create sale error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-black">{t('sales.title')}</h2>
          <p className="text-sm text-gray-600 max-w-xl">
            {t('sales.subtitle')}
          </p>
        </div>
        <div className="text-sm text-gray-500">{t('sales.currentBranch', { branch })}</div>
      </div>

      <section className="mt-6 grid grid-cols-2 sm:grid-cols-5 gap-3">
        {branchOptions.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => {
              setBranch(option);
              setScanState((current) => ({ ...current, sourceBranch: option }));
              setDetectedScanItem(null);
              setPackageSaleMode('FULL');
              setPackageComponentsSold([]);
              setScanMessage(null);
              setMinimumPriceMessage(null);
            }}
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
            <h3 className="text-lg font-semibold text-black">{t('sales.inventoryScanTitle')}</h3>
            <p className="text-sm text-gray-500 mb-4">
              {t('sales.inventoryScanDescription')}
            </p>
            <div className="grid gap-3 sm:grid-cols-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">{t('sales.itemId')}</label>
                <QrScanInput
                  className="mt-1"
                  value={scanState.inventoryItemId}
                  onChange={(value) => {
                    setDetectedScanItem(null);
                    setScanMessage(null);
                    setMinimumPriceMessage(null);
                    setScanState((s) => ({ ...s, inventoryItemId: value }));
                  }}
                  onScan={(value) => {
                    setDetectedScanItem(null);
                    setScanMessage(null);
                    setMinimumPriceMessage(null);
                    setScanState((s) => ({ ...s, inventoryItemId: value }));
                    detectScanItemForCode(value, scanState.sourceBranch).catch((error) =>
                      handleScanLookupError(error, value)
                    );
                  }}
                  placeholder={t('sales.itemIdPlaceholder')}
                />
                {scanMessage && <p className="mt-2 text-xs text-gray-500">{scanMessage}</p>}
                {minimumPriceMessage && (
                  <p className="mt-1 text-xs font-semibold text-magenta-600">{minimumPriceMessage}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">{t('sales.sourceBranch')}</label>
                <select
                  value={scanState.sourceBranch}
                  onChange={(e) => {
                    setDetectedScanItem(null);
                    setScanMessage(null);
                    setMinimumPriceMessage(null);
                    setScanState((s) => ({ ...s, sourceBranch: e.target.value }));
                  }}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                >
                  {branchOptions.map((option) => (
                    <option key={option} value={option}>{t('common.branchLabel', { code: option })}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  {amountLabelForUnit(
                    t,
                    detectedScanItem ? soldAsUnitForItem(detectedScanItem) : undefined,
                    detectedScanItem?.isPiecePackage,
                    packageSaleMode
                  )}
                </label>
                {detectedScanItem?.isPiecePackage && packageSaleMode === 'PARTIAL' ? (
                  <div className="mt-1 rounded-xl border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                    {t('sales.piecesSelected', { count: selectedPackagePieces })}
                  </div>
                ) : (
                  <input
                    type="number"
                    min={detectedScanItem && soldAsUnitForItem(detectedScanItem) === 'PIECE' ? '1' : '0.01'}
                    step={detectedScanItem && soldAsUnitForItem(detectedScanItem) === 'PIECE' ? '1' : '0.01'}
                    value={scanState.amount}
                    onChange={(e) => setScanState((s) => ({ ...s, amount: Number(e.target.value) }))}
                    className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                  />
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  {packagePriceLabel(t, detectedScanItem?.isPiecePackage, packageSaleMode)}
                </label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={scanState.price}
                  onChange={(e) => setScanState((s) => ({ ...s, price: Number(e.target.value) }))}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
            </div>

            {detectedScanItem?.isPiecePackage && detectedPackageComponents.length > 0 && (
              <section className="mt-5 rounded-2xl border border-magenta-200 bg-magenta-50 p-4">
                <p className="text-sm font-semibold text-black">{t('sales.piecePackageSale')}</p>
                <p className="mt-1 text-sm text-gray-600">
                  {t('sales.packageSet', { summary: formatPackageSummary(detectedPackageComponents) })}
                </p>
                <p className="mt-1 text-sm text-gray-600">
                  {t('sales.availableStock', { stock: formatPackageStockSummary(detectedPackageStock) })}
                </p>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setPackageSaleMode('FULL')}
                    className={`rounded-full px-4 py-2 text-xs font-semibold ${
                      packageSaleMode === 'FULL'
                        ? 'bg-black text-white'
                        : 'border border-gray-300 bg-white text-gray-700'
                    }`}
                  >
                    Sell full package(s)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPackageSaleMode('PARTIAL')}
                    className={`rounded-full px-4 py-2 text-xs font-semibold ${
                      packageSaleMode === 'PARTIAL'
                        ? 'bg-black text-white'
                        : 'border border-gray-300 bg-white text-gray-700'
                    }`}
                  >
                    Sell selected pieces only
                  </button>
                </div>

                {packageSaleMode === 'PARTIAL' && (
                  <div className="mt-4 space-y-2">
                    <p className="text-sm font-semibold text-gray-800">
                      {t('sales.choosePackagePieces')}
                    </p>
                    {packageComponentsSold.map((component) => (
                      <div
                        key={component.name}
                        className="grid grid-cols-[1fr_120px_100px] items-center gap-2 rounded-xl border border-white bg-white px-3 py-2"
                      >
                        <span className="text-sm font-medium text-gray-800">{component.name}</span>
                        <span className="text-xs text-gray-500">
                          {t('sales.inStock', { count: detectedPackageStock[component.name] ?? 0 })}
                        </span>
                        <input
                          type="number"
                          min="0"
                          max={detectedPackageStock[component.name] ?? 0}
                          value={component.quantity}
                          onChange={(event) =>
                            updatePackagePieceSold(component.name, Number(event.target.value))
                          }
                          className="rounded-lg border border-gray-300 px-2 py-1 text-sm"
                        />
                      </div>
                    ))}
                    {remainingPackagePreview && (
                      <p className="text-sm text-gray-700">
                        {t('sales.leftoverPieces')}{' '}
                        <strong>
                          {Object.keys(remainingPackagePreview).length > 0
                            ? formatPackageStockSummary(remainingPackagePreview)
                            : t('common.none')}
                        </strong>
                      </p>
                    )}
                  </div>
                )}
              </section>
            )}

            <button
              type="button"
              className="btn-primary mt-4"
              onClick={addInventoryLine}
            >
              {t('sales.addScannedItem')}
            </button>
          </section>

          <section className="rounded-3xl border border-magenta-200 bg-magenta-50 p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-black">{t('sales.cutFromRollTitle')}</h3>
            <p className="mb-4 text-sm text-gray-600">{t('sales.cutFromRollDescription')}</p>
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700">{t('sales.rollId')}</label>
                <div className="mt-1 grid gap-2 sm:grid-cols-[1fr_auto]">
                  <QrScanInput
                    value={rollCutScan.rollId}
                    onChange={(value) => {
                      setRollCutScan((current) => ({ ...current, rollId: value }));
                      setRollCutSource(null);
                    }}
                    onScan={(value) => {
                      setRollCutScan((current) => ({ ...current, rollId: value }));
                      setRollCutSource(null);
                      void loadRollForSaleCut(value);
                    }}
                    placeholder={t('sales.rollIdPlaceholder')}
                  />
                  <button type="button" className="btn-secondary" onClick={() => void loadRollForSaleCut()}>
                    {t('sales.loadRoll')}
                  </button>
                </div>
                {rollCutSource && (
                  <p className="mt-2 break-all text-xs text-gray-600">
                    {rollCutSource.id} · {rollCutSource.type} ·{' '}
                    {getColorLabel(t, rollCutSource.color?.name) || rollCutSource.colorId}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">{t('sales.metersToCut')}</label>
                <input
                  type="number"
                  min="2"
                  step="0.01"
                  value={rollCutScan.cutMeters}
                  onChange={(e) =>
                    setRollCutScan((current) => ({ ...current, cutMeters: Number(e.target.value) }))
                  }
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">{t('sales.unitPrice')}</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={rollCutScan.price}
                  onChange={(e) =>
                    setRollCutScan((current) => ({ ...current, price: Number(e.target.value) }))
                  }
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <button
              type="button"
              className="btn-primary mt-4"
              onClick={cutRollSellAndPrint}
              disabled={isCuttingRoll}
            >
              {isCuttingRoll ? t('sales.cuttingRoll') : t('sales.cutSellAndPrint')}
            </button>

            {cutSaleSummary && (
              <div className="mt-5 rounded-2xl border border-green-200 bg-white p-4">
                <p className="text-sm font-semibold text-green-800">{t('sales.saleRecordedForPiece')}</p>
                {cutSaleSummary.labelPrinted && (
                  <p className="mt-1 text-sm text-green-700">{t('sales.labelSentToPrinter')}</p>
                )}
                <div className="mt-4 grid gap-4 md:grid-cols-[220px_1fr]">
                  <div className="rounded-2xl bg-gray-50 p-3">
                    <img
                      src={cutSaleSummary.qrCodeDataUrl}
                      alt={t('itemConversion.qrAlt', { id: cutSaleSummary.pieceItemId })}
                      className="h-44 w-44"
                    />
                  </div>
                  <div className="text-sm">
                    <div className="font-semibold text-black">{t('itemConversion.newQrItem')}</div>
                    <div className="break-all text-gray-700">{cutSaleSummary.pieceItemId}</div>
                    <div className="mt-3 font-semibold text-black">{t('itemConversion.linkedSourceLabel')}</div>
                    <div className="break-all text-gray-700">{cutSaleSummary.rollSourceId}</div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={reprintCutSaleLabel}
                        className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white"
                      >
                        {t('itemInput.printLabel')}
                      </button>
                      <a
                        className="inline-flex rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700"
                        href={cutSaleSummary.qrCodeDataUrl}
                        download={`${cutSaleSummary.pieceItemId}-qr.png`}
                      >
                        {t('itemConversion.downloadQr')}
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>

          <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-black">{t('sales.plainClothTitle')}</h3>
            <p className="text-sm text-gray-500 mb-4">
              {t('sales.plainClothDescription')}
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="block text-sm font-medium text-gray-700">{t('common.fabric')}</label>
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
                <label className="block text-sm font-medium text-gray-700">{t('common.meters')}</label>
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
                <label className="block text-sm font-medium text-gray-700">{t('sales.pricePerMeter')}</label>
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
            <h3 className="text-lg font-semibold text-black">{t('sales.saleSummary')}</h3>
            <div className="mt-4 space-y-3 text-sm text-gray-700">
              <div className="flex justify-between">
                <span>{t('common.date')}</span>
                <span>{new Date().toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>{t('common.branch')}</span>
                <span>{branch}</span>
              </div>
              <div className="flex justify-between">
                <span>{t('common.lines')}</span>
                <span className="font-semibold text-black">{String(cart.length)}</span>
              </div>
              <div className="flex justify-between font-semibold">
                <span>{t('common.total')}</span>
                <span>{formatCurrency(saleTotal)}</span>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-black">{t('sales.customerAndPayment')}</h3>
            <div className="space-y-3 mt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">{t('sales.customerName')}</label>
                <input
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">{t('sales.customerPhone')}</label>
                <input
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">{t('sales.paymentStatus')}</label>
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
                  <label className="block text-sm font-medium text-gray-700">{t('sales.amountPaidNow')}</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={amountPaid}
                    onChange={(e) => setAmountPaid(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                  />
                  <p className="mt-2 text-sm text-gray-500">{t('sales.remainingDue', { amount: formatCurrency(dueAmount) })}</p>
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
              {isSubmitting ? t('common.creatingSale') : t('common.confirmSale')}
            </button>
            {successMessage && (
              <p className="mt-4 text-sm text-green-600">{successMessage}</p>
            )}
          </div>
        </aside>
      </div>

      <section className="mt-8 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-black">{t('sales.cartDetails')}</h3>
        {cart.length === 0 ? (
          <div className="mt-4 text-sm text-gray-500">{t('sales.noLineItems')}</div>
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
                        ? t('sales.inventoryItemLine', { id: line.inventoryItemId })
                        : t('sales.plainClothParen', { name: line.clothName })}
                    </p>
                    <p className="text-sm text-gray-500">
                      {line.type === 'inventory'
                        ? line.isPiecePackage
                          ? `${line.description}: ${line.packageSummary ?? 'package sale'} — ${formatCurrency(lineTotal(line))}`
                          : `${line.description}: ${line.quantity} ${line.soldAsUnit === 'PIECE' ? 'pieces' : 'meters'} @ ${formatCurrency(parsePriceInput(line.price))}/unit`
                        : `${line.meters} meters @ ${formatCurrency(parsePriceInput(line.pricePerMeter))}/m`}
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
                  <span>{t('common.lineTotal')}</span>
                  <span>{formatCurrency(lineTotal(line))}</span>
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

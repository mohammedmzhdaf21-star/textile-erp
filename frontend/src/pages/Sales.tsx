import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import QrScanInput from '../components/QrScanInput';
import api from '../lib/api';
import { getCurrentUser } from '../lib/auth';
import { getCachedItemMinimumPrice } from '../lib/commissionSettingsApi';
import { formatCurrency, parsePriceInput, toPriceInputNumber } from '../lib/currency';
import { fetchPlainClothTypes, type PlainClothType } from '../lib/plainClothApi';
import type { SalePaymentChannel } from '../lib/paymentMethod';
import {
  availableMetersForScanItem,
  cutPieceForSale,
} from '../lib/pieceCut';
import { completeCuttingTasksAfterRollToPiece, maybeCreateCuttingTaskAfterPieceSale } from '../lib/cuttingTasks';
import { getColorLabel } from '../lib/colorLabels';
import { resolveInventoryItem } from '../lib/inventoryLookup';
import { BRANCH_ID_BY_CODE, resolveBranchId } from '../lib/inventoryCodes';
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
  linePrice: number;
  sourceItemId?: string | null;
  code?: number;
  colorName?: string;
  isPiecePackage?: boolean;
  packageSaleMode?: PackageSaleMode;
  packagesSold?: number;
  packageComponentsSold?: PackageComponentSold[];
  packageSummary?: string;
  qrCodeValue?: string;
  qrCodeDataUrl?: string;
};

type PlainClothSaleLine = {
  type: 'plain';
  clothName: string;
  meters: number;
  linePrice: number;
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
  version?: number;
};

const branchOptions = ['A', 'B', 'C', 'E', 'F'];
const soldAsUnitForItem = (item: InventoryLookupItem): 'METER' | 'PIECE' => {
  if (item.type === 'PIECE' && !item.isPiecePackage) return 'PIECE';
  if (item.type === 'REMANENT') return 'METER';
  return item.type === 'PIECE' ? 'PIECE' : 'METER';
};

const buildInitialPackageSelection = (components: PackageComponent[]): PackageComponentSold[] =>
  components.map((component) => ({ name: component.name, quantity: 0 }));

const plainClothLinePriceShorthand = (pricePerM: number, meters: number) =>
  toPriceInputNumber(pricePerM * meters);

const lineUnitPrice = (linePriceShorthand: number, quantity: number) => {
  if (quantity <= 0) return 0;
  return parsePriceInput(linePriceShorthand) / quantity;
};

const plainClothPricePerMeter = (linePriceShorthand: number, meters: number) =>
  lineUnitPrice(linePriceShorthand, meters);

type SalesInputSection = 'pieceScan' | 'rollScan' | 'plainCloth';

type PieceCutSummary = {
  soldPieceItemId: string;
  soldQrCodeDataUrl: string;
  soldType: 'PIECE' | 'REMANENT';
  soldMeters: number;
  remnantPieceItemId: string;
  remnantQrCodeDataUrl: string;
  remnantMeters: number;
  familyCode: number;
  subCode: number;
  colorName?: string;
  branchId: string;
};

type RollCutSummary = {
  pieceItemId: string;
  qrCodeDataUrl: string;
  rollSourceId: string;
  createAsRemnant: boolean;
  pieceLength: number;
};

function SalesCollapsibleSection({
  title,
  expanded,
  onToggle,
  accent = false,
  children,
}: {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  accent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`rounded-2xl border shadow-sm ${
        accent ? 'border-magenta-200 bg-magenta-50' : 'border-gray-200 bg-white'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left sm:px-5 sm:py-4"
      >
        <span className="text-base font-semibold text-black sm:text-lg">{title}</span>
        <span
          className={`shrink-0 text-sm text-gray-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
          aria-hidden
        >
          ▾
        </span>
      </button>
      {expanded && (
        <div
          className={`border-t px-4 pb-5 pt-4 sm:px-6 sm:pb-6 ${
            accent ? 'border-magenta-200/80' : 'border-gray-200/80'
          }`}
        >
          {children}
        </div>
      )}
    </section>
  );
}

const SalesView: React.FC = () => {
  const { t } = useTranslation();
  const [branch, setBranch] = useState<string>('A');
  const [cart, setCart] = useState<SaleLine[]>([]);
  const [customerName, setCustomerName] = useState('Walk-in');
  const [customerPhone, setCustomerPhone] = useState('0000000000');
  const [paymentStatus, setPaymentStatus] = useState<'FULL' | 'PARTIAL'>('FULL');
  const [paymentChannel, setPaymentChannel] = useState<SalePaymentChannel>('CASH');
  const [amountPaid, setAmountPaid] = useState('0');
  const [plainCloth, setPlainCloth] = useState({ clothName: '', meters: 1, linePrice: 0 });
  const [plainClothTypes, setPlainClothTypes] = useState<PlainClothType[]>([]);
  const [scanState, setScanState] = useState({
    inventoryItemId: '',
    sourceBranch: branch,
    soldMeters: 1,
    linePrice: 15,
  });
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
  const [cutSaleSummary, setCutSaleSummary] = useState<RollCutSummary | null>(null);
  const [pieceCutSummary, setPieceCutSummary] = useState<PieceCutSummary | null>(null);
  const [expandedSection, setExpandedSection] = useState<SalesInputSection | null>(null);

  const toggleSection = (section: SalesInputSection) => {
    setExpandedSection((current) => (current === section ? null : section));
  };

  useEffect(() => {
    void fetchPlainClothTypes()
      .then((items) => {
        setPlainClothTypes(items);
        if (items.length > 0) {
          setPlainCloth((current) => ({
            ...current,
            clothName: current.clothName || items[0].name,
            linePrice:
              current.linePrice > 0
                ? current.linePrice
                : plainClothLinePriceShorthand(items[0].pricePerM, current.meters || 1),
          }));
        }
      })
      .catch(() => setPlainClothTypes([]));
  }, []);

  const applyPlainClothSelection = (clothName: string) => {
    const selected = plainClothTypes.find((item) => item.name === clothName);
    setPlainCloth((current) => ({
      ...current,
      clothName,
      linePrice: selected
        ? plainClothLinePriceShorthand(selected.pricePerM, current.meters)
        : current.linePrice,
    }));
  };

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
    if (line.type === 'inventory') return parsePriceInput(line.linePrice);
    return parsePriceInput(line.linePrice);
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
    if (!plainCloth.clothName.trim()) return alert(t('plainClothPricing.enterName'));
    if (plainCloth.meters <= 0 || plainCloth.linePrice <= 0) {
      return alert(t('sales.enterValidPlainCloth'));
    }
    setCart((current) => [
      ...current,
      {
        type: 'plain',
        clothName: plainCloth.clothName.trim(),
        meters: plainCloth.meters,
        linePrice: plainCloth.linePrice,
      },
    ]);
    setExpandedSection(null);
  };

  const detectScanItemForCode = async (inventoryItemId: string, sourceBranch: string) => {
    const item = await resolveInventoryItem<InventoryLookupItem>(inventoryItemId, sourceBranch, BRANCH_ID_BY_CODE);
    if (item && item.type === 'ROLL') {
      setDetectedScanItem(null);
      setScanMessage(t('sales.onlyPieceOrRemnant'));
      return null;
    }
    if (item && item.type !== 'PIECE' && item.type !== 'REMANENT') {
      setDetectedScanItem(null);
      setScanMessage(t('sales.onlyPieceOrRemnant'));
      return null;
    }
    setDetectedScanItem(item);
    if (item) {
      const availableMeters = availableMetersForScanItem(item);
      const unit = soldAsUnitForItem(item);
      const components = parsePackageComponents(item.packageComponents);
      const savedPrice = getCachedItemMinimumPrice(item.id);
      if (savedPrice) {
        setScanState((current) => {
          const meters = availableMeters > 0 ? availableMeters : Math.max(current.soldMeters || 1, 0.01);
          return {
            ...current,
            soldMeters: meters,
            linePrice: Math.max(
              current.linePrice,
              toPriceInputNumber(savedPrice.minimumPrice * (unit === 'PIECE' ? 1 : meters))
            ),
          };
        });
        setMinimumPriceMessage(
          t('sales.minimumPriceFor', {
            id: item.id,
            price: formatCurrency(savedPrice.minimumPrice),
            unit: savedPrice.unit === 'PIECE' ? t('common.piece') : t('common.meter'),
          })
        );
      } else {
        setMinimumPriceMessage(null);
        if (availableMeters > 0) {
          setScanState((current) => ({ ...current, soldMeters: availableMeters }));
        }
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
    if (scanState.linePrice <= 0) {
      return alert(t('sales.enterValidPrice'));
    }

    if (scanState.sourceBranch !== branch) {
      return alert(t('sales.branchMismatch', { saleBranch: branch, itemBranch: scanState.sourceBranch }));
    }

    try {
      const item = detectedScanItem?.id === inventoryItemId ? detectedScanItem : await detectScanItem();
      if (!item) return;
      if (item.type === 'ROLL') {
        return alert(t('sales.onlyPieceOrRemnant'));
      }
      if (item.branchId && item.branchId !== resolveBranchId(branch)) {
        return alert(t('sales.inventoryBranchMismatch', { saleBranch: branch, itemBranch: scanState.sourceBranch }));
      }

      const components = parsePackageComponents(item.packageComponents);
      const isPiecePackage = Boolean(item.isPiecePackage && components.length > 0);
      const linePrice = scanState.linePrice;
      let description = t('sales.descriptionInventory', { type: item.type, branch: scanState.sourceBranch });
      let packageSummary = '';
      let linePackageMode: PackageSaleMode | undefined;
      let packagesSold: number | undefined;
      let componentsSold: PackageComponentSold[] | undefined;
      let cartItemId = item.id;
      let soldAsUnit: 'METER' | 'PIECE' = soldAsUnitForItem(item);
      let quantity = 1;
      let qrCodeValue: string | undefined;
      let qrCodeDataUrl: string | undefined;
      let splitMessage: string | null = null;

      if (isPiecePackage) {
        if (packageSaleMode === 'FULL') {
          packagesSold = Math.floor(scanState.soldMeters);
          if (packagesSold <= 0) return alert(t('sales.enterOnePackage'));
          quantity = packagesSold;
          soldAsUnit = 'PIECE';
          linePackageMode = 'FULL';
          packageSummary = t('sales.fullPackagesSummary', {
            count: packagesSold,
            summary: formatPackageSummary(components),
          });
          description = t('sales.descriptionPackage', { branch: scanState.sourceBranch });
        } else {
          componentsSold = packageComponentsSold.filter((component) => component.quantity > 0);
          if (componentsSold.length === 0) {
            return alert(t('sales.selectPackagePiece'));
          }
          quantity = 1;
          soldAsUnit = 'PIECE';
          linePackageMode = 'PARTIAL';
          packageSummary = formatPackageComponentsSold(componentsSold);
          description = t('sales.descriptionPartial', { branch: scanState.sourceBranch });
        }
      } else {
        const availableMeters = availableMetersForScanItem(item);
        const soldMeters = Number(scanState.soldMeters);
        if (!Number.isFinite(soldMeters) || soldMeters <= 0) {
          return alert(t('sales.enterQuantityOrMeters'));
        }
        if (soldMeters > availableMeters + 0.001) {
          return alert(t('sales.soldMetersExceedsAvailable', { available: availableMeters.toFixed(2) }));
        }

        if (item.version === undefined) {
          const refreshed = await api.get(`/inventory/${encodeURIComponent(item.id)}`);
          item.version = (refreshed.data as InventoryLookupItem).version;
        }

        const cutResult = await cutPieceForSale({
          pieceId: item.id,
          version: item.version ?? 0,
          soldMeters,
        });

        cartItemId = cutResult.soldPieceItemId;
        qrCodeValue = cutResult.soldQrCodeValue;
        qrCodeDataUrl = cutResult.soldQrCodeDataUrl ?? undefined;
        soldAsUnit = cutResult.soldType === 'REMANENT' ? 'METER' : 'PIECE';
        quantity = cutResult.soldType === 'REMANENT' ? cutResult.soldMeters : 1;
        description = t('sales.descriptionPieceCut', {
          type: cutResult.soldType,
          meters: cutResult.soldMeters.toFixed(2),
          branch: scanState.sourceBranch,
        });

        if (cutResult.split && cutResult.remnantPieceItemId) {
          splitMessage = t('sales.pieceSplitCreated', {
            soldId: cutResult.soldPieceItemId,
            remnantId: cutResult.remnantPieceItemId,
            remnantMeters: (cutResult.remnantMeters ?? 0).toFixed(2),
          });
          setPieceCutSummary({
            soldPieceItemId: cutResult.soldPieceItemId,
            soldQrCodeDataUrl: cutResult.soldQrCodeDataUrl ?? '',
            soldType: cutResult.soldType,
            soldMeters: cutResult.soldMeters,
            remnantPieceItemId: cutResult.remnantPieceItemId,
            remnantQrCodeDataUrl: cutResult.remnantQrCodeDataUrl ?? '',
            remnantMeters: cutResult.remnantMeters ?? 0,
            familyCode: item.code ?? 0,
            subCode: Number(item.subCode ?? item.costPrice ?? 0),
            colorName: item.color?.name,
            branchId: item.branchId,
          });
        } else {
          setPieceCutSummary(null);
        }
      }

      setCart((current) => [
        ...current,
        {
          type: 'inventory',
          inventoryItemId: cartItemId,
          sourceBranch: scanState.sourceBranch,
          description,
          colorId: item.colorId,
          soldAsUnit,
          quantity,
          linePrice,
          sourceItemId: item.sourceItemId,
          code: item.code,
          colorName: item.color?.name,
          isPiecePackage,
          packageSaleMode: linePackageMode,
          packagesSold,
          packageComponentsSold: componentsSold,
          packageSummary,
          qrCodeValue,
          qrCodeDataUrl,
        },
      ]);
      setScanState((current) => ({ ...current, inventoryItemId: '', soldMeters: 1 }));
      setDetectedScanItem(null);
      setPackageSaleMode('FULL');
      setPackageComponentsSold([]);
      setScanMessage(splitMessage);
      setMinimumPriceMessage(null);
      setExpandedSection(null);
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
      if (item.type !== 'ROLL') {
        return alert(t('sales.onlyRollItems'));
      }
      setRollCutSource(item);
      setRollCutScan((current) => ({
        ...current,
        price: current.price > 0 ? current.price : 0,
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

  const cutRollAndAddToCart = async () => {
    if (!rollCutSource) {
      return alert(t('itemConversion.loadRollFirst'));
    }
    if (rollCutSource.branchId !== resolveBranchId(branch)) {
      return alert(t('sales.inventoryBranchMismatch', { saleBranch: branch, itemBranch: branch }));
    }
    const meters = Number(rollCutScan.cutMeters);
    const totalPrice = Number(rollCutScan.price);
    if (!Number.isFinite(meters) || meters <= 0) {
      return alert(t('itemConversion.enterValidMetersToCut'));
    }
    if (!Number.isFinite(totalPrice) || totalPrice <= 0) {
      return alert(t('sales.enterValidPrice'));
    }
    if (meters > Number(rollCutSource.meters ?? 0)) {
      return alert(t('itemConversion.cutExceedsRoll'));
    }

    setIsCuttingRoll(true);
    setSuccessMessage(null);
    setCutSaleSummary(null);

    try {
      const result = await cutRollToPieceStock(rollCutSource, meters, { uniquePiece: true });

      await completeCuttingTasksAfterRollToPiece({
        rollItemId: rollCutSource.id,
        branchId: rollCutSource.branchId,
        code: rollCutSource.code,
        colorName: rollCutSource.color?.name,
        newPieceId: result.pieceItemId,
      });

      setCart((current) => [
        ...current,
        {
          type: 'inventory',
          inventoryItemId: result.pieceItemId,
          sourceBranch: branch,
          description: t('sales.descriptionRollCut', {
            meters: meters.toFixed(2),
            branch,
            rollId: rollCutSource.id,
          }),
          colorId: rollCutSource.colorId,
          soldAsUnit: result.createAsRemnant ? 'METER' : 'PIECE',
          quantity: result.createAsRemnant ? meters : 1,
          linePrice: totalPrice,
          sourceItemId: rollCutSource.id,
          code: rollCutSource.code,
          colorName: rollCutSource.color?.name,
          qrCodeValue: result.pieceItemId,
          qrCodeDataUrl: result.qrCodeDataUrl,
        },
      ]);

      const refreshed = result.roll
        ? ({ ...rollCutSource, ...result.roll } as RollInventoryItem)
        : ((await api.get(`/inventory/${encodeURIComponent(rollCutSource.id)}`)).data as RollInventoryItem);
      setRollCutSource(refreshed);
      setCutSaleSummary({
        pieceItemId: result.pieceItemId,
        qrCodeDataUrl: result.qrCodeDataUrl,
        rollSourceId: rollCutSource.id,
        createAsRemnant: result.createAsRemnant,
        pieceLength: result.pieceLength ?? meters,
      });
      setExpandedSection(null);
      setScanMessage(
        t('sales.rollCutAddedToCart', {
          pieceId: result.pieceItemId,
          meters: meters.toFixed(2),
        })
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

  const printRollCutLabel = () => {
    if (!cutSaleSummary || !rollCutSource) return;
    const printed = printPieceInventoryLabel({
      t,
      itemId: cutSaleSummary.pieceItemId,
      qrDataUrl: cutSaleSummary.qrCodeDataUrl,
      familyCode: rollCutSource.code,
      subCode: itemSubCode(rollCutSource),
      type: cutSaleSummary.createAsRemnant ? 'REMANENT' : 'PIECE',
      pieceLength: cutSaleSummary.pieceLength,
      colorName: rollCutSource.color?.name,
      branchId: rollCutSource.branchId,
    });
    if (!printed) alert(t('errors.allowPopups'));
  };

  const printPieceStoreRemnantLabel = () => {
    if (!pieceCutSummary) return;
    const printed = printPieceInventoryLabel({
      t,
      itemId: pieceCutSummary.remnantPieceItemId,
      qrDataUrl: pieceCutSummary.remnantQrCodeDataUrl,
      familyCode: pieceCutSummary.familyCode,
      subCode: pieceCutSummary.subCode,
      type: 'REMANENT',
      pieceLength: pieceCutSummary.remnantMeters,
      colorName: pieceCutSummary.colorName,
      branchId: pieceCutSummary.branchId,
    });
    if (!printed) alert(t('errors.allowPopups'));
  };

  const printPieceCustomerLabel = () => {
    if (!pieceCutSummary) return;
    const printed = printPieceInventoryLabel({
      t,
      itemId: pieceCutSummary.soldPieceItemId,
      qrDataUrl: pieceCutSummary.soldQrCodeDataUrl,
      familyCode: pieceCutSummary.familyCode,
      subCode: pieceCutSummary.subCode,
      type: pieceCutSummary.soldType === 'REMANENT' ? 'REMANENT' : 'PIECE',
      pieceLength: pieceCutSummary.soldMeters,
      colorName: pieceCutSummary.colorName,
      branchId: pieceCutSummary.branchId,
    });
    if (!printed) alert(t('errors.allowPopups'));
  };

  const printBothPieceCutLabels = () => {
    printPieceStoreRemnantLabel();
    printPieceCustomerLabel();
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

    const branchMismatch = cart.find(
      (line) => line.type === 'inventory' && line.sourceBranch !== branch
    );
    if (branchMismatch) {
      setIsSubmitting(false);
      return alert(
        t('sales.branchMismatch', {
          saleBranch: branch,
          itemBranch: branchMismatch.type === 'inventory' ? branchMismatch.sourceBranch : branch,
        })
      );
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
            soldPrice: lineUnitPrice(line.linePrice, line.quantity),
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
          if (line.qrCodeValue) payload.qrCodeValue = line.qrCodeValue;
          if (line.qrCodeDataUrl) payload.qrCodeDataUrl = line.qrCodeDataUrl;
          resolvedItems.push(payload);
        } else {
          const soldPricePerMeter = plainClothPricePerMeter(line.linePrice, line.meters);
          resolvedItems.push({
            inventoryItemId: undefined,
            colorId: 'PLAIN',
            soldAsUnit: 'METER',
            quantitySold: line.meters,
            soldPrice: soldPricePerMeter,
            lineDiscount: 0,
            plainClothName: line.clothName,
            isPlainCloth: true,
          });
        }
      }

      const channelLabel = paymentChannel === 'FIB' ? 'FIB' : 'Cash';
      const idempotencyKey =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const payload = {
        branchId: resolveBranchId(branch),
        employeeId: currentUser.id,
        customerName,
        customerPhone,
        items: resolvedItems,
        discount: 0,
        paymentMethod: paymentStatus === 'FULL' ? paymentChannel : 'CREDIT',
        amountPaid:
          paymentStatus === 'PARTIAL' ? parsePriceInput(amountPaid) : undefined,
        idempotencyKey,
        notes: `Source branch: ${branch}. ${
          paymentStatus === 'PARTIAL'
            ? `Paid ${formatCurrency(parsePriceInput(amountPaid))} now via ${channelLabel}, due ${formatCurrency(dueAmount)}.`
            : `Fully paid via ${channelLabel}.`
        }`,
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
      setPaymentChannel('CASH');
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
          <SalesCollapsibleSection
            title={t('sales.pieceScanTitle')}
            expanded={expandedSection === 'pieceScan'}
            onToggle={() => toggleSection('pieceScan')}
          >
            <p className="text-sm text-gray-500 mb-4">
              {t('sales.pieceScanDescription')}
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
                    setPieceCutSummary(null);
                    setScanState((s) => ({ ...s, inventoryItemId: value }));
                  }}
                  onScan={(value) => {
                    setDetectedScanItem(null);
                    setScanMessage(null);
                    setMinimumPriceMessage(null);
                    setPieceCutSummary(null);
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
                  {detectedScanItem?.isPiecePackage && packageSaleMode === 'FULL'
                    ? t('sales.packages')
                    : detectedScanItem?.isPiecePackage && packageSaleMode === 'PARTIAL'
                    ? t('sales.selectedPieces')
                    : t('sales.metersToSell')}
                </label>
                {detectedScanItem?.isPiecePackage && packageSaleMode === 'PARTIAL' ? (
                  <div className="mt-1 rounded-xl border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                    {t('sales.piecesSelected', { count: selectedPackagePieces })}
                  </div>
                ) : (
                  <input
                    type="number"
                    min={
                      detectedScanItem?.isPiecePackage
                        ? '1'
                        : detectedScanItem
                        ? '0.01'
                        : '0.01'
                    }
                    step={detectedScanItem?.isPiecePackage ? '1' : '0.01'}
                    value={scanState.soldMeters}
                    onChange={(e) =>
                      setScanState((s) => ({ ...s, soldMeters: Number(e.target.value) }))
                    }
                    className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                  />
                )}
                {detectedScanItem &&
                  !detectedScanItem.isPiecePackage &&
                  availableMetersForScanItem(detectedScanItem) > 0 && (
                    <p className="mt-1 text-xs text-gray-500">
                      {t('sales.availableMeters', {
                        meters: availableMetersForScanItem(detectedScanItem).toFixed(2),
                      })}
                    </p>
                  )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  {t('sales.salePriceTotal')}
                </label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={scanState.linePrice}
                  onChange={(e) => setScanState((s) => ({ ...s, linePrice: Number(e.target.value) }))}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                />
                <p className="mt-1 text-xs text-gray-500">{t('currency.thousandsHint')}</p>
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
              {t('sales.addPieceScannedItem')}
            </button>

            {pieceCutSummary && (
              <div className="mt-5 rounded-2xl border border-green-200 bg-white p-4">
                <p className="text-sm font-semibold text-green-800">{t('sales.pieceSplitQrTitle')}</p>
                <p className="mt-1 text-sm text-green-700">{t('sales.pieceSplitQrHint')}</p>
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                    <p className="text-sm font-semibold text-black">{t('sales.storeRemnantLabel')}</p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-[140px_1fr]">
                      <img
                        src={pieceCutSummary.remnantQrCodeDataUrl}
                        alt={t('itemConversion.qrAlt', { id: pieceCutSummary.remnantPieceItemId })}
                        className="h-36 w-36 rounded-xl bg-white p-2"
                      />
                      <div className="text-sm">
                        <div className="break-all text-gray-700">{pieceCutSummary.remnantPieceItemId}</div>
                        <div className="mt-1 text-gray-500">
                          {pieceCutSummary.remnantMeters.toFixed(2)} m
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={printPieceStoreRemnantLabel}
                            className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white"
                          >
                            {t('sales.printStoreRemnantLabel')}
                          </button>
                          <a
                            className="inline-flex rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700"
                            href={pieceCutSummary.remnantQrCodeDataUrl}
                            download={`${pieceCutSummary.remnantPieceItemId}-qr.png`}
                          >
                            {t('itemConversion.downloadQr')}
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-magenta-200 bg-magenta-50/40 p-4">
                    <p className="text-sm font-semibold text-black">{t('sales.customerPieceLabel')}</p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-[140px_1fr]">
                      <img
                        src={pieceCutSummary.soldQrCodeDataUrl}
                        alt={t('itemConversion.qrAlt', { id: pieceCutSummary.soldPieceItemId })}
                        className="h-36 w-36 rounded-xl bg-white p-2"
                      />
                      <div className="text-sm">
                        <div className="break-all text-gray-700">{pieceCutSummary.soldPieceItemId}</div>
                        <div className="mt-1 text-gray-500">
                          {pieceCutSummary.soldMeters.toFixed(2)} m
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={printPieceCustomerLabel}
                            className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white"
                          >
                            {t('sales.printCustomerLabel')}
                          </button>
                          <a
                            className="inline-flex rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700"
                            href={pieceCutSummary.soldQrCodeDataUrl}
                            download={`${pieceCutSummary.soldPieceItemId}-qr.png`}
                          >
                            {t('itemConversion.downloadQr')}
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={printBothPieceCutLabels}
                    className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800"
                  >
                    {t('sales.printBothLabels')}
                  </button>
                </div>
              </div>
            )}
          </SalesCollapsibleSection>

          <SalesCollapsibleSection
            title={t('sales.rollScanTitle')}
            expanded={expandedSection === 'rollScan'}
            onToggle={() => toggleSection('rollScan')}
            accent
          >
            <p className="mb-4 text-sm text-gray-600">{t('sales.rollScanDescription')}</p>
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
                  min="0.01"
                  step="0.01"
                  value={rollCutScan.cutMeters}
                  onChange={(e) =>
                    setRollCutScan((current) => ({ ...current, cutMeters: Number(e.target.value) }))
                  }
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">{t('sales.salePriceTotal')}</label>
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
              onClick={cutRollAndAddToCart}
              disabled={isCuttingRoll}
            >
              {isCuttingRoll ? t('sales.cuttingRoll') : t('sales.cutRollAndAddToCart')}
            </button>

            {cutSaleSummary && (
              <div className="mt-5 rounded-2xl border border-green-200 bg-white p-4">
                <p className="text-sm font-semibold text-green-800">{t('sales.rollCutQrTitle')}</p>
                <p className="mt-1 text-sm text-green-700">{t('sales.rollCutQrHint')}</p>
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
                        onClick={printRollCutLabel}
                        className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white"
                      >
                        {t('sales.printCutPieceLabel')}
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
          </SalesCollapsibleSection>

          <SalesCollapsibleSection
            title={t('sales.plainClothTitle')}
            expanded={expandedSection === 'plainCloth'}
            onToggle={() => toggleSection('plainCloth')}
          >
            <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
              <p className="text-sm text-gray-500">{t('sales.plainClothDescription')}</p>
              <Link
                to="/plain-cloth"
                className="text-sm font-semibold text-magenta-600 hover:underline"
              >
                {t('sales.managePlainCloth')}
              </Link>
            </div>
            {plainClothTypes.length === 0 ? (
              <p className="rounded-2xl bg-gray-50 p-4 text-sm text-gray-600">
                {t('sales.noPlainClothTypes')}{' '}
                <Link to="/plain-cloth" className="font-semibold text-magenta-600 hover:underline">
                  {t('sales.addPlainClothTypes')}
                </Link>
              </p>
            ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="block text-sm font-medium text-gray-700">{t('common.fabric')}</label>
                <select
                  value={plainCloth.clothName}
                  onChange={(e) => applyPlainClothSelection(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                >
                  {plainClothTypes.map((item) => (
                    <option key={item.id} value={item.name}>{item.name}</option>
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
                <label className="block text-sm font-medium text-gray-700">{t('sales.plainClothLinePrice')}</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={plainCloth.linePrice}
                  onChange={(e) => setPlainCloth((current) => ({ ...current, linePrice: Number(e.target.value) }))}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                />
                <p className="mt-1 text-xs text-gray-500">{t('currency.thousandsHint')}</p>
              </div>
            </div>
            )}
            <button
              type="button"
              className="btn-primary mt-4"
              onClick={addPlainClothLine}
              disabled={plainClothTypes.length === 0}
            >
              {t('sales.addPlainClothLine')}
            </button>
          </SalesCollapsibleSection>
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
                <label className="block text-sm font-medium text-gray-700">{t('sales.paymentChannel')}</label>
                <select
                  value={paymentChannel}
                  onChange={(e) => setPaymentChannel(e.target.value as SalePaymentChannel)}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="CASH">{t('paymentMethod.cash')}</option>
                  <option value="FIB">{t('paymentMethod.fib')}</option>
                </select>
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
                          : `${line.description}: ${line.quantity} ${line.soldAsUnit === 'PIECE' ? 'pieces' : 'meters'} — ${formatCurrency(parsePriceInput(line.linePrice))} (${formatCurrency(lineUnitPrice(line.linePrice, line.quantity))}/${line.soldAsUnit === 'PIECE' ? 'pc' : 'm'})`
                        : `${line.meters} meters — ${formatCurrency(parsePriceInput(line.linePrice))} (${formatCurrency(plainClothPricePerMeter(line.linePrice, line.meters))}/m)`}
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

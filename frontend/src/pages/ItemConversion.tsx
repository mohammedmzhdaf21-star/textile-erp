import React, { useState } from 'react';
import QRCode from 'qrcode';
import api from '../lib/api';
import { getCurrentUser } from '../lib/auth';
import { completeCuttingTasksAfterRollToPiece } from '../lib/cuttingTasks';
import { sellCutPiece } from '../lib/cutAndSell';
import { getColorLabel } from '../lib/colorLabels';
import { printPieceInventoryLabel } from '../lib/pieceLabel';
import { isBelowRemnantThreshold } from '../lib/inventoryRules';
import {
  cutRollToPieceStock,
  itemSubCode,
  type RollInventoryItem,
} from '../lib/rollToPiece';
import { useTranslation } from 'react-i18next';

type BranchCode = 'A' | 'B' | 'C' | 'E' | 'F';
type ItemType = 'ROLL' | 'PIECE' | 'REMANENT';
type SoldUnit = 'METER' | 'PIECE';

type InventoryItem = RollInventoryItem & {
  branch?: { id: string; name: string };
  sourceItemId?: string | null;
  conversionType?: string | null;
};

type ConversionSummary = {
  title: string;
  sourceId: string;
  newItemId: string;
  qrCodeDataUrl: string;
  details: string;
  saleCompleted?: boolean;
  labelPrinted?: boolean;
};

const branches: BranchCode[] = ['A', 'B', 'C', 'E', 'F'];
const BRANCH_MAP: Record<BranchCode, string> = {
  A: 'B001',
  B: 'B002',
  C: 'B003',
  E: 'B001',
  F: 'B002',
};

const BRANCH_CODE_BY_ID: Record<string, BranchCode> = {
  B001: 'A',
  B002: 'B',
  B003: 'C',
};

const toNumber = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const soldAsUnitForItem = (item: InventoryItem): SoldUnit =>
  item.type === 'PIECE' ? 'PIECE' : 'METER';

const itemAvailableAmount = (item: InventoryItem) =>
  item.type === 'PIECE' ? item.quantity : toNumber(item.meters);

const colorCodeForItem = (item: InventoryItem) =>
  (item.color?.name || item.colorId)
    .replace(/[^a-z0-9]/gi, '')
    .toUpperCase()
    .slice(0, 3) || item.colorId.slice(0, 3).toUpperCase();

const typeCode = (type: ItemType) => (type === 'ROLL' ? 'R' : type === 'PIECE' ? 'P' : 'M');

const buildItemId = (branchId: string, item: InventoryItem, type: ItemType, suffix = '') => {
  const codeText = String(item.code).padStart(3, '0');
  const base = `${branchId}-${codeText}-${colorCodeForItem(item)}${typeCode(type)}`;
  return suffix ? `${base}-${suffix}` : base;
};

const createQrDataUrl = (itemId: string) =>
  QRCode.toDataURL(itemId, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 220,
  });

const ItemConversion: React.FC = () => {
  const { t } = useTranslation();
  const [transferSourceId, setTransferSourceId] = useState('');
  const [transferSource, setTransferSource] = useState<InventoryItem | null>(null);
  const [transferToBranch, setTransferToBranch] = useState<BranchCode>('C');
  const [transferAmount, setTransferAmount] = useState('1');
  const [rollSourceId, setRollSourceId] = useState('');
  const [rollSource, setRollSource] = useState<InventoryItem | null>(null);
  const [cutMeters, setCutMeters] = useState('2.25');
  const [sellImmediately, setSellImmediately] = useState(true);
  const [salePrice, setSalePrice] = useState('15');
  const [customerName, setCustomerName] = useState('Exchange Customer');
  const [customerPhone, setCustomerPhone] = useState('0000000000');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ConversionSummary | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const loadItem = async (itemId: string, setItem: (item: InventoryItem) => void) => {
    const id = itemId.trim();
    if (!id) {
      setError(t('itemConversion.enterItemIdFirst'));
      return;
    }
    setError(null);
    setMessage(null);

    try {
      const response = await api.get(`/inventory/${encodeURIComponent(id)}`);
      const item = response.data as InventoryItem;
      setItem(item);
      const amount = itemAvailableAmount(item);
      if (setItem === setRollSource) {
        setSalePrice(String(itemSubCode(item)));
      }
      if (setItem === setTransferSource) {
        setTransferAmount(String(item.type === 'PIECE' ? Math.max(1, Math.min(item.quantity, 1)) : Math.min(amount, 1)));
        const currentBranch = BRANCH_CODE_BY_ID[item.branchId];
        if (currentBranch === transferToBranch) {
          setTransferToBranch(currentBranch === 'C' ? 'F' : 'C');
        }
      }
      setMessage(t('itemConversion.loadedItem', { id: item.id, type: item.type, amount, unit: item.type === 'PIECE' ? t('common.pieces') : t('common.meters') }));
    } catch (err: any) {
      const body = err?.response?.data;
      setError(body?.error ?? body?.message ?? err?.message ?? t('itemConversion.failedToLoad'));
    }
  };

  const findAvailableId = async (branchId: string, item: InventoryItem, type: ItemType) => {
    const baseId = buildItemId(branchId, item, type);
    try {
      await api.get(`/inventory/${encodeURIComponent(baseId)}`);
      return buildItemId(branchId, item, type, String(Date.now()).slice(-6));
    } catch (err: any) {
      if (err?.response?.status === 404) return baseId;
      throw err;
    }
  };

  const patchSourceStock = async (item: InventoryItem, amount: number) => {
    if (item.type === 'PIECE') {
      await api.patch(`/inventory/${encodeURIComponent(item.id)}`, {
        version: item.version,
        quantity: item.quantity - Math.floor(amount),
      });
      return;
    }

    await api.patch(`/inventory/${encodeURIComponent(item.id)}`, {
      version: item.version,
      meters: Number((toNumber(item.meters) - amount).toFixed(2)),
    });
  };

  const transferItem = async () => {
    if (!transferSource) return alert(t('itemConversion.loadTransferFirst'));
    const amount = Number(transferAmount);
    const destinationBranchId = BRANCH_MAP[transferToBranch];
    const currentBranch = BRANCH_CODE_BY_ID[transferSource.branchId];

    if (destinationBranchId === transferSource.branchId) {
      return alert(t('itemConversion.chooseDifferentBranch'));
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return alert(t('itemConversion.enterValidTransferAmount'));
    }
    if (transferSource.type === 'PIECE' && !Number.isInteger(amount)) {
      return alert(t('itemConversion.pieceWholeQuantity'));
    }
    if (amount > itemAvailableAmount(transferSource)) {
      return alert(t('itemConversion.transferExceedsStock'));
    }

    setIsProcessing(true);
    setError(null);
    setMessage(null);

    try {
      const newItemId = await findAvailableId(destinationBranchId, transferSource, transferSource.type);
      const qrCodeDataUrl = await createQrDataUrl(newItemId);

      await patchSourceStock(transferSource, amount);
      setTransferSource((current) =>
        current
          ? {
              ...current,
              meters: current.type === 'PIECE' ? current.meters : Number((toNumber(current.meters) - amount).toFixed(2)),
              quantity: current.type === 'PIECE' ? current.quantity - Math.floor(amount) : current.quantity,
              version: current.version + 1,
            }
          : current
      );
      await api.post('/inventory', {
        id: newItemId,
        branchId: destinationBranchId,
        code: transferSource.code,
        subCode: itemSubCode(transferSource),
        colorId: transferSource.colorId,
        type: transferSource.type,
        meters: transferSource.type === 'PIECE' ? undefined : amount,
        pieceLength: transferSource.type === 'PIECE' ? toNumber(transferSource.pieceLength) : undefined,
        quantity: transferSource.type === 'PIECE' ? Math.floor(amount) : undefined,
        costPrice: transferSource.costPrice ? toNumber(transferSource.costPrice) : undefined,
        qrCodeValue: newItemId,
        qrCodeDataUrl,
        pictureName: transferSource.id,
        pictureDataUrl: transferSource.qrCodeDataUrl || undefined,
        sourceItemId: transferSource.id,
        conversionType: 'BRANCH_TRANSFER',
      });

      setSummary({
        title: t('itemConversion.summaryBranchTransfer'),
        sourceId: transferSource.id,
        newItemId,
        qrCodeDataUrl,
        details: t('itemConversion.summaryTransferDetails', { amount, unit: transferSource.type === 'PIECE' ? t('common.pieces') : t('common.meters'), from: currentBranch || transferSource.branchId, to: transferToBranch }),
      });
      setMessage(t('itemConversion.branchTransferComplete'));
      await loadItem(transferSource.id, setTransferSource);
    } catch (err: any) {
      const body = err?.response?.data;
      setError(body?.error ?? body?.message ?? err?.message ?? t('itemConversion.failedToTransfer'));
    } finally {
      setIsProcessing(false);
    }
  };

  const printCutPieceLabel = (result: {
    pieceItemId: string;
    qrCodeDataUrl: string;
    createAsRemnant: boolean;
    pieceLength?: number;
  }, source: InventoryItem) => {
    if (result.createAsRemnant) return false;
    return printPieceInventoryLabel({
      t,
      itemId: result.pieceItemId,
      qrDataUrl: result.qrCodeDataUrl,
      familyCode: source.code,
      subCode: itemSubCode(source),
      type: 'PIECE',
      pieceLength: result.pieceLength,
      colorName: source.color?.name,
      branchId: source.branchId,
    });
  };

  const cutRollToPiece = async () => {
    if (!rollSource) return alert(t('itemConversion.loadRollFirst'));
    const amount = Number(cutMeters);
    if (rollSource.type !== 'ROLL' && rollSource.type !== 'REMANENT') {
      return alert(t('itemConversion.onlyRollsRemnants'));
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return alert(t('itemConversion.enterValidMetersToCut'));
    }
    if (amount > toNumber(rollSource.meters)) {
      return alert(t('itemConversion.cutExceedsRoll'));
    }
    if (sellImmediately && isBelowRemnantThreshold(amount)) {
      return alert(t('itemConversion.sellOnlyForPieces'));
    }
    if (sellImmediately) {
      const price = Number(salePrice);
      if (!Number.isFinite(price) || price <= 0) {
        return alert(t('itemConversion.enterValidSalePrice'));
      }
      if (!customerName.trim() || !customerPhone.trim()) {
        return alert(t('itemConversion.provideCustomerForSale'));
      }
      const currentUser = getCurrentUser();
      if (!currentUser) {
        return alert(t('sales.mustBeLoggedIn'));
      }
    }

    setIsProcessing(true);
    setError(null);
    setMessage(null);

    try {
      const result = await cutRollToPieceStock(rollSource, amount);
      const colorLabel = getColorLabel(t, rollSource.color?.name) || rollSource.colorId;
      let saleCompleted = false;
      let labelPrinted = false;

      if (!result.createAsRemnant) {
        labelPrinted = printCutPieceLabel(result, rollSource);
        if (!labelPrinted) {
          setError(t('errors.allowPopups'));
        }

        if (sellImmediately) {
          const currentUser = getCurrentUser();
          if (!currentUser) throw new Error(t('sales.mustBeLoggedIn'));
          await sellCutPiece({
            pieceItemId: result.pieceItemId,
            colorId: rollSource.colorId,
            branchId: rollSource.branchId,
            employeeId: currentUser.id,
            customerName: customerName.trim(),
            customerPhone: customerPhone.trim(),
            soldPrice: Number(salePrice),
            rollSourceId: rollSource.id,
          });
          saleCompleted = true;
        }
      }

      setRollSource((current) =>
        current
          ? {
              ...current,
              meters: Number((toNumber(current.meters) - amount).toFixed(2)),
              version: current.version + 1,
            }
          : current
      );

      setSummary({
        title: result.addedToExisting
          ? t('itemConversion.summaryStockAdded')
          : result.createAsRemnant
            ? t('itemConversion.summaryRemnantCreated')
            : t('itemConversion.summaryPieceCreated'),
        sourceId: rollSource.id,
        newItemId: result.pieceItemId,
        qrCodeDataUrl: result.qrCodeDataUrl,
        details: result.addedToExisting
          ? t('itemConversion.summaryAddedExisting', {
              meters: result.cutMeters.toFixed(2),
              id: result.pieceItemId,
              code: rollSource.code,
              color: colorLabel,
            })
          : result.createAsRemnant
            ? t('itemConversion.summaryRemnantDetails', { meters: result.cutMeters.toFixed(2) })
            : t('itemConversion.summaryNewPiece', {
                meters: result.cutMeters.toFixed(2),
                code: rollSource.code,
                color: colorLabel,
              }),
        saleCompleted,
        labelPrinted,
      });

      const completedTasks = completeCuttingTasksAfterRollToPiece({
        rollItemId: rollSource.id,
        branchId: rollSource.branchId,
        code: rollSource.code,
        colorName: rollSource.color?.name,
        newPieceId: result.pieceItemId,
      });

      if (saleCompleted && labelPrinted) {
        setMessage(t('itemConversion.cutSellPrintComplete'));
      } else if (saleCompleted) {
        setMessage(t('itemConversion.cutSellComplete'));
      } else if (labelPrinted && !result.createAsRemnant) {
        setMessage(t('itemConversion.cutPrintComplete'));
      } else if (completedTasks.length > 0) {
        setMessage(t('itemConversion.rollToPieceWithTasks', { count: completedTasks.length }));
      } else if (result.addedToExisting) {
        setMessage(t('itemConversion.rollToPieceAddedExisting'));
      } else if (result.createAsRemnant) {
        setMessage(t('itemConversion.rollToRemnantComplete'));
      } else {
        setMessage(t('itemConversion.rollToPieceNewQr'));
      }

      await loadItem(rollSource.id, setRollSource);
    } catch (err: any) {
      if (err?.message === 'ONLY_ROLLS') {
        setError(t('itemConversion.onlyRollsRemnants'));
        return;
      }
      if (err?.message === 'INVALID_CUT_AMOUNT') {
        setError(t('itemConversion.enterValidMetersToCut'));
        return;
      }
      if (err?.message === 'CUT_EXCEEDS_ROLL') {
        setError(t('itemConversion.cutExceedsRoll'));
        return;
      }
      const body = err?.response?.data;
      setError(body?.error ?? body?.message ?? err?.message ?? t('itemConversion.failedToCut'));
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePrintSummaryLabel = () => {
    if (!summary || !rollSource) return;
    const printed = printCutPieceLabel(
      {
        pieceItemId: summary.newItemId,
        qrCodeDataUrl: summary.qrCodeDataUrl,
        createAsRemnant: false,
        pieceLength: Number(cutMeters),
      },
      rollSource
    );
    if (!printed) alert(t('errors.allowPopups'));
  };

  const renderItemSummary = (item: InventoryItem | null) => {
    if (!item) return <p className="text-sm text-gray-500">{t('itemConversion.noItemLoaded')}</p>;
    return (
      <div className="rounded-2xl bg-gray-50 p-4 text-sm text-gray-700">
        <div className="break-all font-semibold text-black">{item.id}</div>
        <div>{t('itemConversion.branch', { code: BRANCH_CODE_BY_ID[item.branchId] || item.branchId })}</div>
        <div>{t('itemConversion.code', { code: item.code })}</div>
        <div>{t('itemConversion.color', { color: getColorLabel(t, item.color?.name) || item.colorId })}</div>
        <div>{t('itemConversion.type', { type: item.type })}</div>
        <div>{t('itemConversion.available', { amount: itemAvailableAmount(item), unit: item.type === 'PIECE' ? t('common.pieces') : t('common.meters') })}</div>
        {item.sourceItemId && <div className="break-all">{t('itemConversion.linkedSource', { id: item.sourceItemId })}</div>}
      </div>
    );
  };

  return (
    <div className="max-w-full overflow-x-hidden p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-black">{t('itemConversion.title')}</h2>
          <p className="mt-1 max-w-2xl text-sm text-gray-600">{t('itemConversion.subtitle')}</p>
        </div>
      </div>

      {message && <div className="mt-4 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">{message}</div>}
      {error && <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="text-xl font-semibold text-black">{t('itemConversion.branchTransferTitle')}</h3>
          <p className="mt-1 text-sm text-gray-600">{t('itemConversion.branchTransferDescription')}</p>

          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
            <input
              value={transferSourceId}
              onChange={(event) => setTransferSourceId(event.target.value)}
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
              placeholder={t('itemConversion.scanPlaceholder')}
            />
            <button type="button" onClick={() => loadItem(transferSourceId, setTransferSource)} className="btn-primary">
              {t('common.loadItem')}
            </button>
          </div>

          <div className="mt-4">{renderItemSummary(transferSource)}</div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700">{t('itemConversion.destinationBranch')}</label>
              <select
                value={transferToBranch}
                onChange={(event) => setTransferToBranch(event.target.value as BranchCode)}
                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
              >
                {branches.map((branch) => (
                  <option key={branch} value={branch}>{t('common.branchLabel', { code: branch })}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                {transferSource ? t('itemConversion.amountLabel', { unit: soldAsUnitForItem(transferSource) === 'PIECE' ? t('common.pieces') : t('common.meters') }) : t('itemConversion.amountLabelDefault')}
              </label>
              <input
                type="number"
                min="0"
                step={transferSource?.type === 'PIECE' ? '1' : '0.01'}
                value={transferAmount}
                onChange={(event) => setTransferAmount(event.target.value)}
                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <button type="button" onClick={transferItem} disabled={isProcessing} className="btn-primary mt-4 w-full">
            {isProcessing ? t('itemConversion.converting') : t('itemConversion.createBranchQr')}
          </button>
        </section>

        <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="text-xl font-semibold text-black">{t('itemConversion.rollToPieceTitle')}</h3>
          <p className="mt-1 text-sm text-gray-600">{t('itemConversion.rollToPieceDescription')}</p>

          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
            <input
              value={rollSourceId}
              onChange={(event) => setRollSourceId(event.target.value)}
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
              placeholder={t('itemConversion.rollScanPlaceholder')}
            />
            <button type="button" onClick={() => loadItem(rollSourceId, setRollSource)} className="btn-primary">
              {t('common.loadRoll')}
            </button>
          </div>

          <div className="mt-4">{renderItemSummary(rollSource)}</div>

          <label className="mt-4 block text-sm font-medium text-gray-700">{t('itemConversion.metersToCut')}</label>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={cutMeters}
            onChange={(event) => setCutMeters(event.target.value)}
            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
          />

          <div className="mt-4 rounded-2xl border border-magenta-100 bg-magenta-50 p-4">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={sellImmediately}
                onChange={(event) => setSellImmediately(event.target.checked)}
                className="mt-1"
              />
              <span>
                <span className="block text-sm font-semibold text-black">{t('itemConversion.sellImmediately')}</span>
                <span className="mt-1 block text-xs text-gray-600">{t('itemConversion.sellImmediatelyHint')}</span>
              </span>
            </label>

            {sellImmediately && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-gray-600">{t('itemConversion.salePrice')}</label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={salePrice}
                    onChange={(event) => setSalePrice(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600">{t('sales.customerName')}</label>
                  <input
                    value={customerName}
                    onChange={(event) => setCustomerName(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-600">{t('sales.customerPhone')}</label>
                  <input
                    value={customerPhone}
                    onChange={(event) => setCustomerPhone(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
            )}
          </div>

          <button type="button" onClick={cutRollToPiece} disabled={isProcessing} className="btn-primary mt-4 w-full">
            {isProcessing
              ? t('itemConversion.cutting')
              : sellImmediately
                ? t('itemConversion.cutSellAndPrint')
                : t('itemConversion.cutRollToPiece')}
          </button>
        </section>
      </div>

      {summary && (
        <section className="mt-6 rounded-3xl border border-green-200 bg-green-50 p-6 shadow-sm">
          <h3 className="text-xl font-semibold text-black">{summary.title}</h3>
          <p className="mt-2 text-sm text-gray-700">{summary.details}</p>
          {summary.saleCompleted && (
            <p className="mt-2 text-sm font-semibold text-green-800">{t('itemConversion.saleRecorded')}</p>
          )}
          {summary.labelPrinted && (
            <p className="mt-1 text-sm font-semibold text-green-800">{t('itemConversion.labelSentToPrinter')}</p>
          )}
          <div className="mt-4 grid gap-4 md:grid-cols-[220px_1fr]">
            <div className="rounded-2xl bg-white p-4">
              <img src={summary.qrCodeDataUrl} alt={t('itemConversion.qrAlt', { id: summary.newItemId })} className="h-44 w-44" />
            </div>
            <div className="rounded-2xl bg-white p-4 text-sm">
              <div className="font-semibold text-black">{t('itemConversion.newQrItem')}</div>
              <div className="break-all text-gray-700">{summary.newItemId}</div>
              <div className="mt-3 font-semibold text-black">{t('itemConversion.linkedSourceLabel')}</div>
              <div className="break-all text-gray-700">{summary.sourceId}</div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handlePrintSummaryLabel}
                  className="inline-flex rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white"
                >
                  {t('itemInput.printLabel')}
                </button>
                <a
                  className="inline-flex rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700"
                  href={summary.qrCodeDataUrl}
                  download={`${summary.newItemId}-qr.png`}
                >
                  {t('itemConversion.downloadQr')}
                </a>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};

export default ItemConversion;

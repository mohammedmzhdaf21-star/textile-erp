import type { TFunction } from 'i18next';
import { buildPackageIdSuffix, type PackageComponent } from './piecePackages';

export type InventoryItemType = 'ROLL' | 'PIECE' | 'REMANENT';

export const BRANCH_DESTINATIONS = [
  { code: 'A', id: 'B001', labelKey: 'branches.A' },
  { code: 'B', id: 'B002', labelKey: 'branches.B' },
  { code: 'C', id: 'B003', labelKey: 'branches.C' },
  { code: 'E', id: 'B004', labelKey: 'branches.E' },
  { code: 'F', id: 'B005', labelKey: 'branches.F' },
  { code: 'S', id: 'B000', labelKey: 'branches.S' },
] as const;

export type BranchDestinationCode = (typeof BRANCH_DESTINATIONS)[number]['code'];

export const BRANCH_ID_BY_CODE: Record<BranchDestinationCode, string> = Object.fromEntries(
  BRANCH_DESTINATIONS.map((branch) => [branch.code, branch.id])
) as Record<BranchDestinationCode, string>;

export const BRANCH_CODE_BY_ID: Record<string, BranchDestinationCode> = Object.fromEntries(
  BRANCH_DESTINATIONS.map((branch) => [branch.id, branch.code])
);

export const ITEM_TYPE_LABEL_KEYS: Record<InventoryItemType, string> = {
  ROLL: 'itemTypes.ROLL',
  PIECE: 'itemTypes.PIECE',
  REMANENT: 'itemTypes.REMANENT',
};

/** @deprecated Use getItemTypeLabel(t, type) */
export const ITEM_TYPE_LABELS: Record<InventoryItemType, string> = {
  ROLL: 'Roll',
  PIECE: 'Piece',
  REMANENT: 'Remnant',
};

export const getItemTypeLabel = (t: TFunction, type: InventoryItemType) =>
  t(ITEM_TYPE_LABEL_KEYS[type]);

export const getBranchLabel = (t: TFunction, code: BranchDestinationCode) => {
  const destination = BRANCH_DESTINATIONS.find((branch) => branch.code === code);
  return destination ? t(destination.labelKey) : code;
};

export const typeCode = (type: InventoryItemType) =>
  type === 'ROLL' ? 'R' : type === 'PIECE' ? 'P' : 'M';

export const colorCodeFromName = (name: string, fallbackId = '') =>
  name
    .replace(/[^a-z0-9]/gi, '')
    .toUpperCase()
    .slice(0, 3) || fallbackId.slice(0, 3).toUpperCase();

export const formatSubCode = (price: number) =>
  Number.isInteger(price) ? String(price) : price.toFixed(2);

export const padFamilyCode = (familyCode: number) => String(familyCode).padStart(3, '0');

export const padSubCode = (subCode: number) => {
  const rounded = Math.round(subCode * 100) / 100;
  if (Number.isInteger(rounded)) {
    return String(rounded).padStart(3, '0');
  }
  return rounded.toFixed(2).replace('.', '');
};

export const padLengthCode = (meters: number) => {
  const rounded = Math.round(meters * 100) / 100;
  const encoded = Math.round(rounded * 100);
  return String(encoded).padStart(4, '0');
};

export const meteredInstanceKeyPrefix = (type: 'ROLL' | 'REMANENT') =>
  type === 'ROLL' ? 'roll' : 'remnant';

export const formatMeteredInstanceIdSuffix = (
  instanceKey: string,
  type: 'ROLL' | 'REMANENT'
) => {
  const prefix = meteredInstanceKeyPrefix(type);
  const match = instanceKey.match(new RegExp(`^${prefix}-(\\d+)$`));
  if (!match) return '';
  const letter = type === 'ROLL' ? 'R' : 'M';
  return `${letter}${match[1].padStart(2, '0')}`;
};

const parseMeteredInstanceNumber = (
  item: { id?: string; packageKey?: string },
  type: 'ROLL' | 'REMANENT'
) => {
  const prefix = meteredInstanceKeyPrefix(type);
  const letter = type === 'ROLL' ? 'R' : 'M';

  if (item.id) {
    const suffixMatch = item.id.match(new RegExp(`-${letter}(\\d{2})$`, 'i'));
    if (suffixMatch) {
      return Number(suffixMatch[1]);
    }
  }

  const key = item.packageKey ?? '';
  if (!key) {
    return 1;
  }

  const match = key.match(new RegExp(`^${prefix}-(\\d+)$`));
  return match ? Number(match[1]) : 1;
};

export const pieceInstanceKeyPrefix = () => 'piece';

export const formatPieceInstanceIdSuffix = (instanceKey: string) => {
  const match = instanceKey.match(/^piece-(\d+)$/);
  if (!match) return '';
  return `P${match[1].padStart(2, '0')}`;
};

export const resolvePieceInstanceKey = (input: {
  items: Array<{
    branchId: string;
    code: number;
    subCode?: number | string;
    costPrice?: number | string;
    colorId: string;
    type: string;
    pieceLength?: number | string | null;
    packageKey?: string | null;
    isPiecePackage?: boolean;
  }>;
  branchId: string;
  familyCode: number;
  subCode: number;
  colorId: string;
  pieceLength: number;
}) => {
  const matching = input.items.filter((item) => {
    if (item.type !== 'PIECE' || item.isPiecePackage) return false;
    const itemPrice = Number(item.subCode ?? item.costPrice ?? 0);
    return (
      item.branchId === input.branchId &&
      Number(item.code) === Number(input.familyCode) &&
      Math.abs(itemPrice - input.subCode) < 0.001 &&
      item.colorId === input.colorId &&
      Math.abs(Number(item.pieceLength ?? 0) - input.pieceLength) < 0.001
    );
  });

  let maxInstance = 0;
  for (const item of matching) {
    const key = item.packageKey ?? '';
    if (!key) {
      maxInstance = Math.max(maxInstance, 1);
      continue;
    }
    const match = key.match(/^piece-(\d+)$/);
    if (match) {
      maxInstance = Math.max(maxInstance, Number(match[1]));
    }
  }

  const nextInstance = maxInstance + 1;
  return `piece-${nextInstance}`;
};

export const resolveMeteredInstanceKey = (input: {
  type: 'ROLL' | 'REMANENT';
  items: Array<{
    id?: string;
    branchId: string;
    code: number;
    subCode?: number | string;
    costPrice?: number | string;
    colorId: string;
    type: InventoryItemType;
    packageKey?: string;
  }>;
  branchId: string;
  familyCode: number;
  subCode: number;
  colorId: string;
}) => {
  const matching = input.items.filter((item) => {
    const itemPrice = Number(item.subCode ?? item.costPrice ?? 0);
    return (
      item.branchId === input.branchId &&
      Number(item.code) === Number(input.familyCode) &&
      Math.abs(itemPrice - input.subCode) < 0.001 &&
      item.colorId === input.colorId &&
      item.type === input.type
    );
  });

  let maxInstance = 0;
  for (const item of matching) {
    maxInstance = Math.max(maxInstance, parseMeteredInstanceNumber(item, input.type));
  }

  const nextInstance = maxInstance + 1;
  return nextInstance === 1 ? '' : `${meteredInstanceKeyPrefix(input.type)}-${nextInstance}`;
};

export const buildInventoryItemId = (input: {
  branchId: string;
  familyCode: number;
  subCode: number;
  colorName: string;
  colorId?: string;
  type: InventoryItemType;
  pieceLength?: number;
  packageComponents?: PackageComponent[];
  isPiecePackage?: boolean;
  instanceKey?: string;
}) => {
  const colorCode = colorCodeFromName(input.colorName, input.colorId);
  const typeLetter = typeCode(input.type);

  if (input.isPiecePackage && input.packageComponents?.length) {
    const packageSuffix = buildPackageIdSuffix(input.packageComponents);
    return `${input.branchId}-${padFamilyCode(input.familyCode)}-${padSubCode(input.subCode)}-${colorCode}${typeLetter}-${packageSuffix}`;
  }

  const lengthSuffix =
    input.type === 'PIECE' && input.pieceLength && input.pieceLength > 0
      ? padLengthCode(input.pieceLength)
      : '';
  const instanceSuffix = input.instanceKey
    ? input.type === 'PIECE'
      ? `-${formatPieceInstanceIdSuffix(input.instanceKey)}`
      : (input.type === 'ROLL' || input.type === 'REMANENT')
        ? `-${formatMeteredInstanceIdSuffix(input.instanceKey, input.type)}`
        : ''
    : '';
  return `${input.branchId}-${padFamilyCode(input.familyCode)}-${padSubCode(input.subCode)}-${colorCode}${typeLetter}${lengthSuffix}${instanceSuffix}`;
};

export type ParsedInventoryItemId = {
  branchId?: string;
  familyCode?: number;
  subCode?: number;
  colorCode?: string;
  type?: InventoryItemType;
  raw: string;
};

const TYPE_FROM_SUFFIX: Record<string, InventoryItemType> = {
  R: 'ROLL',
  P: 'PIECE',
  M: 'REMANENT',
};

export const parseInventoryItemId = (raw: string): ParsedInventoryItemId => {
  const value = raw.trim();
  const result: ParsedInventoryItemId = { raw: value };

  const modern = value.match(/^([A-Z]\d{3})-(\d{3})-(\d+)-([A-Z]{3})([RPM])(\d{4})?(?:-P(\d{2}))?$/i);
  if (modern) {
    result.branchId = modern[1].toUpperCase();
    result.familyCode = Number(modern[2]);
    result.subCode = Number(modern[3]);
    result.colorCode = modern[4].toUpperCase();
    result.type = TYPE_FROM_SUFFIX[modern[5].toUpperCase()];
    return result;
  }

  const modernShort = value.match(/^([A-Z]\d{3})-(\d{3})-(\d+)-([A-Z]{3})([RPM])$/i);
  if (modernShort) {
    result.branchId = modernShort[1].toUpperCase();
    result.familyCode = Number(modernShort[2]);
    result.subCode = Number(modernShort[3]);
    result.colorCode = modernShort[4].toUpperCase();
    result.type = TYPE_FROM_SUFFIX[modernShort[5].toUpperCase()];
    return result;
  }

  const legacy = value.match(/^([A-Z]\d{3})-(\d+)-([A-Z])([RPM])?$/i);
  if (legacy) {
    result.branchId = legacy[1].toUpperCase();
    result.familyCode = Number(legacy[2]);
    result.colorCode = legacy[3].toUpperCase();
    if (legacy[4]) {
      result.type = TYPE_FROM_SUFFIX[legacy[4].toUpperCase()];
    }
  }

  return result;
};

export type InventoryStockItem = {
  id: string;
  branchId: string;
  code: number;
  subCode?: number | string;
  costPrice?: number | string;
  colorId: string;
  color?: { id: string; name: string };
  type: InventoryItemType;
  meters?: number | string;
  pieceLength?: number | string;
  quantity?: number;
  isPiecePackage?: boolean;
  packageComponents?: unknown;
  packageComponentStock?: unknown;
};

export type BranchStockRow = {
  branchId: string;
  branchCode: string;
  branchLabelKey: string;
  rollMeters: number;
  pieceCount: number;
  pieceMeters: number;
  remnantMeters: number;
  items: InventoryStockItem[];
};

export const aggregateFamilyStock = (
  items: InventoryStockItem[],
  familyCode: number,
  colorId: string
): BranchStockRow[] => {
  const matching = items.filter((item) => item.code === familyCode && item.colorId === colorId);

  const byBranch = new Map<string, BranchStockRow>();

  for (const destination of BRANCH_DESTINATIONS) {
    byBranch.set(destination.id, {
      branchId: destination.id,
      branchCode: destination.code,
      branchLabelKey: destination.labelKey,
      rollMeters: 0,
      pieceCount: 0,
      pieceMeters: 0,
      remnantMeters: 0,
      items: [],
    });
  }

  matching.forEach((item) => {
    const row = byBranch.get(item.branchId);
    if (!row) return;
    row.items.push(item);

    if (item.type === 'ROLL') {
      row.rollMeters += Number(item.meters ?? 0);
    } else if (item.type === 'PIECE') {
      row.pieceCount += Number(item.quantity ?? 0);
      row.pieceMeters += Number(item.quantity ?? 0) * Number(item.pieceLength ?? 0);
    } else if (item.type === 'REMANENT') {
      row.remnantMeters += Number(item.meters ?? 0);
    }
  });

  return Array.from(byBranch.values());
};

const meteredItemsForRow = (row: BranchStockRow, type: 'ROLL' | 'REMANENT') =>
  row.items.filter((item) => item.type === type && Number(item.meters ?? 0) > 0);

const pieceItemsForRow = (row: BranchStockRow) =>
  row.items.filter(
    (item) =>
      item.type === 'PIECE' && !item.isPiecePackage && Number(item.quantity ?? 0) > 0
  );

export const hasStockForRow = (row: BranchStockRow, type: InventoryItemType) => {
  if (type === 'ROLL') return meteredItemsForRow(row, 'ROLL').length > 0;
  if (type === 'REMANENT') return meteredItemsForRow(row, 'REMANENT').length > 0;
  return pieceItemsForRow(row).length > 0;
};

export const formatStockAmountLabel = (
  t: TFunction,
  row: BranchStockRow,
  type: InventoryItemType
) => {
  if (type === 'ROLL') {
    const rolls = meteredItemsForRow(row, 'ROLL');
    if (!rolls.length) return '0';
    const meters = rolls.reduce((sum, item) => sum + Number(item.meters ?? 0), 0);
    const unit = t(rolls.length === 1 ? 'inventory.stockRoll' : 'inventory.stockRolls');
    return t('inventory.stockMeteredSummary', {
      count: rolls.length,
      unit,
      meters: formatMetersAmount(meters),
    });
  }
  if (type === 'REMANENT') {
    const remnants = meteredItemsForRow(row, 'REMANENT');
    if (!remnants.length) return '0';
    const meters = remnants.reduce((sum, item) => sum + Number(item.meters ?? 0), 0);
    const unit = t(remnants.length === 1 ? 'inventory.stockRemnant' : 'inventory.stockRemnants');
    return t('inventory.stockMeteredSummary', {
      count: remnants.length,
      unit,
      meters: formatMetersAmount(meters),
    });
  }
  const pieces = pieceItemsForRow(row);
  const count = pieces.reduce((sum, item) => sum + Number(item.quantity ?? 0), 0);
  if (count <= 0) return '0';
  const unit = t(count === 1 ? 'common.pieceSingular' : 'common.pieces');
  const lengths = new Set(pieces.map((item) => Number(item.pieceLength ?? 0)));
  if (lengths.size <= 1) {
    return t('inventory.stockPieceSummary', { count, unit });
  }
  return t('inventory.stockPieceSummaryWithSizes', { count, unit, sizes: lengths.size });
};

export const formatTotalStockLabel = (
  t: TFunction,
  rows: BranchStockRow[],
  type: InventoryItemType
) => {
  if (type === 'ROLL') {
    const rolls = rows.flatMap((row) => meteredItemsForRow(row, 'ROLL'));
    if (!rolls.length) return '0';
    const meters = rolls.reduce((sum, item) => sum + Number(item.meters ?? 0), 0);
    const unit = t(rolls.length === 1 ? 'inventory.stockRoll' : 'inventory.stockRolls');
    return t('inventory.stockMeteredSummary', {
      count: rolls.length,
      unit,
      meters: formatMetersAmount(meters),
    });
  }
  if (type === 'REMANENT') {
    const remnants = rows.flatMap((row) => meteredItemsForRow(row, 'REMANENT'));
    if (!remnants.length) return '0';
    const meters = remnants.reduce((sum, item) => sum + Number(item.meters ?? 0), 0);
    const unit = t(remnants.length === 1 ? 'inventory.stockRemnant' : 'inventory.stockRemnants');
    return t('inventory.stockMeteredSummary', {
      count: remnants.length,
      unit,
      meters: formatMetersAmount(meters),
    });
  }
  const pieces = rows.flatMap((row) => pieceItemsForRow(row));
  const count = pieces.reduce((sum, item) => sum + Number(item.quantity ?? 0), 0);
  if (count <= 0) return '0';
  const unit = t(count === 1 ? 'common.pieceSingular' : 'common.pieces');
  const lengths = new Set(pieces.map((item) => Number(item.pieceLength ?? 0)));
  if (lengths.size <= 1) {
    return t('inventory.stockPieceSummary', { count, unit });
  }
  return t('inventory.stockPieceSummaryWithSizes', { count, unit, sizes: lengths.size });
};

/** @deprecated Use formatStockAmountLabel */
export const stockAmountForType = (row: BranchStockRow, type: InventoryItemType) => {
  if (type === 'ROLL') {
    return row.rollMeters > 0 ? `${row.rollMeters.toFixed(2)} m` : '0';
  }
  if (type === 'PIECE') {
    return row.pieceCount > 0 ? `${row.pieceCount} piece(s)` : '0';
  }
  return row.remnantMeters > 0 ? `${row.remnantMeters.toFixed(2)} m` : '0';
};

/** @deprecated Use formatTotalStockLabel */
export const totalStockForType = (rows: BranchStockRow[], type: InventoryItemType) => {
  if (type === 'ROLL') {
    const total = rows.reduce((sum, row) => sum + row.rollMeters, 0);
    return `${total.toFixed(2)} m`;
  }
  if (type === 'PIECE') {
    const total = rows.reduce((sum, row) => sum + row.pieceCount, 0);
    return `${total} piece(s)`;
  }
  const total = rows.reduce((sum, row) => sum + row.remnantMeters, 0);
  return `${total.toFixed(2)} m`;
};

export const totalPieceCount = (rows: BranchStockRow[]) =>
  rows.reduce((sum, row) => sum + row.pieceCount, 0);

export const hasStockForType = (rows: BranchStockRow[], type: InventoryItemType) => {
  if (type === 'ROLL') {
    return rows.some((row) => row.rollMeters > 0);
  }
  if (type === 'PIECE') {
    return totalPieceCount(rows) > 0;
  }
  return rows.some((row) => row.remnantMeters > 0);
};

export type StockSizeBreakdown = {
  sizeMeters: number;
  count: number;
  branches: Array<{
    branchId: string;
    branchLabelKey: string;
    branchCode: string;
    count: number;
  }>;
};

const breakdownUnitKey = (type: InventoryItemType, count: number) => {
  if (type === 'PIECE') return count === 1 ? 'common.pieceSingular' : 'common.pieces';
  if (type === 'ROLL') return count === 1 ? 'inventory.stockRoll' : 'inventory.stockRolls';
  return count === 1 ? 'inventory.stockRemnant' : 'inventory.stockRemnants';
};

export const formatMetersAmount = (meters: number) => {
  const rounded = Math.round(meters * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
};

export type StockDetailEntry = {
  key: string;
  sizeMeters: number;
  count: number;
  itemId?: string;
  branchId?: string;
  branchLabelKey?: string;
  branchCode?: string;
};

export const aggregateDetailedStockBreakdown = (
  rows: BranchStockRow[],
  type: InventoryItemType,
  branchId?: string
): StockDetailEntry[] => {
  const rowsToProcess = branchId ? rows.filter((row) => row.branchId === branchId) : rows;

  if (type === 'ROLL' || type === 'REMANENT') {
    const results: StockDetailEntry[] = [];
    for (const row of rowsToProcess) {
      for (const item of row.items) {
        if (item.type !== type) continue;
        const meters = Number(item.meters ?? 0);
        if (meters <= 0) continue;
        results.push({
          key: item.id,
          sizeMeters: meters,
          count: 1,
          itemId: item.id,
          branchId: row.branchId,
          branchLabelKey: row.branchLabelKey,
          branchCode: row.branchCode,
        });
      }
    }
    return results.sort((a, b) => a.sizeMeters - b.sizeMeters);
  }

  const byLength = new Map<number, StockDetailEntry>();
  for (const row of rowsToProcess) {
    for (const item of row.items) {
      if (item.type !== 'PIECE' || item.isPiecePackage) continue;
      const length = Number(item.pieceLength ?? 0);
      const qty = Number(item.quantity ?? 0);
      if (length <= 0 || qty <= 0) continue;

      const existing = byLength.get(length);
      if (existing) {
        existing.count += qty;
      } else {
        byLength.set(length, {
          key: `piece-${length}`,
          sizeMeters: length,
          count: qty,
        });
      }
    }
  }

  return Array.from(byLength.values()).sort((a, b) => a.sizeMeters - b.sizeMeters);
};

export const formatDetailedStockBreakdownLine = (
  t: TFunction,
  type: InventoryItemType,
  entry: StockDetailEntry
) => {
  if (type === 'ROLL') {
    return t('inventory.stockRollLine', { meters: formatMetersAmount(entry.sizeMeters) });
  }
  if (type === 'REMANENT') {
    return t('inventory.stockRemnantLine', { meters: formatMetersAmount(entry.sizeMeters) });
  }
  const unit = t(entry.count === 1 ? 'common.pieceSingular' : 'common.pieces');
  return t('inventory.stockBreakdownLine', {
    count: entry.count,
    unit,
    size: formatMetersAmount(entry.sizeMeters),
  });
};

export const formatStockBreakdownLine = (t: TFunction, type: InventoryItemType, entry: StockSizeBreakdown) => {
  const unit = t(breakdownUnitKey(type, entry.count));
  return t('inventory.stockBreakdownLine', {
    count: entry.count,
    unit,
    size: formatMetersAmount(entry.sizeMeters),
  });
};

export const aggregateStockBreakdown = (
  rows: BranchStockRow[],
  type: InventoryItemType,
  branchId?: string
): StockSizeBreakdown[] => {
  const bySize = new Map<number, StockSizeBreakdown>();
  const rowsToProcess = branchId ? rows.filter((row) => row.branchId === branchId) : rows;

  for (const row of rowsToProcess) {
    for (const item of row.items) {
      if (item.type !== type) continue;
      if (type === 'PIECE' && item.isPiecePackage) continue;

      const sizeMeters =
        type === 'PIECE' ? Number(item.pieceLength ?? 0) : Number(item.meters ?? 0);
      const count = type === 'PIECE' ? Number(item.quantity ?? 0) : 1;

      if (sizeMeters <= 0 || count <= 0) continue;

      const existing = bySize.get(sizeMeters) ?? {
        sizeMeters,
        count: 0,
        branches: [],
      };

      existing.count += count;

      const branchEntry = existing.branches.find((entry) => entry.branchId === row.branchId);
      if (branchEntry) {
        branchEntry.count += count;
      } else {
        existing.branches.push({
          branchId: row.branchId,
          branchLabelKey: row.branchLabelKey,
          branchCode: row.branchCode,
          count,
        });
      }

      bySize.set(sizeMeters, existing);
    }
  }

  return Array.from(bySize.values()).sort((a, b) => a.sizeMeters - b.sizeMeters);
};

/** @deprecated Use aggregateStockBreakdown with type PIECE */
export const aggregatePieceBreakdown = (rows: BranchStockRow[], branchId?: string) =>
  aggregateStockBreakdown(rows, 'PIECE', branchId);

/** @deprecated Use formatMetersAmount */
export const formatPieceLength = formatMetersAmount;

export const printInventoryLabel = (input: {
  itemId: string;
  qrDataUrl: string;
  familyCode: number;
  subCode: number;
  type: InventoryItemType;
  typeLabel: string;
  colorName: string;
  branchLabel: string;
  amountLabel: string;
  labels: {
    title: string;
    familyCode: string;
    subCode: string;
    type: string;
    amount: string;
    color: string;
    destination: string;
  };
}) => {
  const popup = window.open('', '_blank', 'width=480,height=720');
  if (!popup) {
    return false;
  }

  popup.document.write(`<!DOCTYPE html>
<html>
  <head>
    <title>Print ${input.itemId}</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 24px; color: #111; }
      .label { border: 2px solid #111; border-radius: 16px; padding: 20px; max-width: 360px; }
      .title { font-size: 18px; font-weight: 700; margin-bottom: 12px; }
      .row { display: flex; justify-content: space-between; margin: 6px 0; font-size: 14px; }
      .qr { display: flex; justify-content: center; margin: 16px 0; }
      .qr img { width: 220px; height: 220px; }
      .id { text-align: center; font-size: 13px; font-weight: 700; word-break: break-all; }
      @media print { body { margin: 0; } }
    </style>
  </head>
  <body>
    <div class="label">
      <div class="title">${input.labels.title}</div>
      <div class="row"><span>${input.labels.familyCode}</span><strong>${input.familyCode}</strong></div>
      <div class="row"><span>${input.labels.subCode}</span><strong>$${formatSubCode(input.subCode)}</strong></div>
      <div class="row"><span>${input.labels.type}</span><strong>${input.typeLabel}</strong></div>
      <div class="row"><span>${input.labels.amount}</span><strong>${input.amountLabel}</strong></div>
      <div class="row"><span>${input.labels.color}</span><strong>${input.colorName}</strong></div>
      <div class="row"><span>${input.labels.destination}</span><strong>${input.branchLabel}</strong></div>
      <div class="qr"><img src="${input.qrDataUrl}" alt="QR code" /></div>
      <div class="id">${input.itemId}</div>
    </div>
    <script>window.onload = () => { window.print(); };</script>
  </body>
</html>`);
  popup.document.close();
  return true;
};

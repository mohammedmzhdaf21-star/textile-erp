export type InventoryItemType = 'ROLL' | 'PIECE' | 'REMANENT';

export const BRANCH_DESTINATIONS = [
  { code: 'A', id: 'B001', label: 'Branch A' },
  { code: 'B', id: 'B002', label: 'Branch B' },
  { code: 'C', id: 'B003', label: 'Branch C' },
  { code: 'E', id: 'B004', label: 'Branch E' },
  { code: 'F', id: 'B005', label: 'Branch F' },
  { code: 'S', id: 'B000', label: 'Storage' },
] as const;

export type BranchDestinationCode = (typeof BRANCH_DESTINATIONS)[number]['code'];

export const BRANCH_ID_BY_CODE: Record<BranchDestinationCode, string> = Object.fromEntries(
  BRANCH_DESTINATIONS.map((branch) => [branch.code, branch.id])
) as Record<BranchDestinationCode, string>;

export const BRANCH_CODE_BY_ID: Record<string, BranchDestinationCode> = Object.fromEntries(
  BRANCH_DESTINATIONS.map((branch) => [branch.id, branch.code])
);

export const ITEM_TYPE_LABELS: Record<InventoryItemType, string> = {
  ROLL: 'Roll',
  PIECE: 'Piece',
  REMANENT: 'Remnant',
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

export const buildInventoryItemId = (input: {
  branchId: string;
  familyCode: number;
  subCode: number;
  colorName: string;
  colorId?: string;
  type: InventoryItemType;
}) => {
  const colorCode = colorCodeFromName(input.colorName, input.colorId);
  return `${input.branchId}-${padFamilyCode(input.familyCode)}-${padSubCode(input.subCode)}-${colorCode}${typeCode(input.type)}`;
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

  const modern = value.match(/^([A-Z]\d{3})-(\d{3})-(\d+)-([A-Z]{3})([RPM])$/i);
  if (modern) {
    result.branchId = modern[1].toUpperCase();
    result.familyCode = Number(modern[2]);
    result.subCode = Number(modern[3]);
    result.colorCode = modern[4].toUpperCase();
    result.type = TYPE_FROM_SUFFIX[modern[5].toUpperCase()];
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
};

export type BranchStockRow = {
  branchId: string;
  branchCode: string;
  branchLabel: string;
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
      branchLabel: destination.label,
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

export const stockAmountForType = (row: BranchStockRow, type: InventoryItemType) => {
  if (type === 'ROLL') {
    return row.rollMeters > 0 ? `${row.rollMeters.toFixed(2)} m` : '0';
  }
  if (type === 'PIECE') {
    return row.pieceCount > 0 ? `${row.pieceCount} piece(s)` : '0';
  }
  return row.remnantMeters > 0 ? `${row.remnantMeters.toFixed(2)} m` : '0';
};

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

export const printInventoryLabel = (input: {
  itemId: string;
  qrDataUrl: string;
  familyCode: number;
  subCode: number;
  type: InventoryItemType;
  colorName: string;
  branchLabel: string;
  amountLabel: string;
}) => {
  const popup = window.open('', '_blank', 'width=480,height=720');
  if (!popup) {
    alert('Please allow pop-ups to print the QR label.');
    return;
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
      <div class="title">Textile ERP Inventory Label</div>
      <div class="row"><span>Family code</span><strong>${input.familyCode}</strong></div>
      <div class="row"><span>Sub code (price)</span><strong>$${formatSubCode(input.subCode)}</strong></div>
      <div class="row"><span>Type</span><strong>${ITEM_TYPE_LABELS[input.type]}</strong></div>
      <div class="row"><span>Amount</span><strong>${input.amountLabel}</strong></div>
      <div class="row"><span>Color</span><strong>${input.colorName}</strong></div>
      <div class="row"><span>Destination</span><strong>${input.branchLabel}</strong></div>
      <div class="qr"><img src="${input.qrDataUrl}" alt="QR code" /></div>
      <div class="id">${input.itemId}</div>
    </div>
    <script>window.onload = () => { window.print(); };</script>
  </body>
</html>`);
  popup.document.close();
};

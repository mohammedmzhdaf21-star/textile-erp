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

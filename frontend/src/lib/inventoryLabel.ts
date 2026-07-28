import QRCode from 'qrcode';
import type { TFunction } from 'i18next';
import {
  BRANCH_CODE_BY_ID,
  getBranchLabel,
  getItemTypeLabel,
  printInventoryLabel,
  type InventoryStockItem,
} from './inventoryCodes';
import { formatInventoryPackageAmount } from './piecePackages';

type PrintableInventoryItem = InventoryStockItem & {
  color?: { name?: string };
  branch?: { id: string; name?: string };
  isPiecePackage?: boolean;
  packageComponents?: unknown;
  packageComponentStock?: unknown;
};

const buildAmountLabel = (item: PrintableInventoryItem, t: TFunction) => {
  const packageAmount = formatInventoryPackageAmount(item);
  if (packageAmount) return packageAmount;
  if (item.type === 'PIECE') {
    return t('inventory.amountPieceShort', {
      qty: item.quantity ?? 0,
      length: item.pieceLength ?? 0,
    });
  }
  return t('inventory.amountMetersShort', { meters: item.meters ?? 0 });
};

export async function printInventoryItemLabel(
  item: PrintableInventoryItem,
  t: TFunction
): Promise<boolean> {
  const qrDataUrl = await QRCode.toDataURL(item.id, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 240,
  });

  const branchCode = BRANCH_CODE_BY_ID[item.branchId];
  const branchLabel = branchCode
    ? getBranchLabel(t, branchCode)
    : item.branch?.name ?? item.branchId;

  return printInventoryLabel({
    itemId: item.id,
    qrDataUrl,
    familyCode: Number(item.code),
    subCode: Number(item.subCode ?? item.costPrice ?? 0),
    type: item.type,
    typeLabel: getItemTypeLabel(t, item.type),
    colorName: item.color?.name ?? t('common.unknownColor'),
    branchLabel,
    amountLabel: buildAmountLabel(item, t),
    labels: {
      title: t('itemInput.qrLabel'),
      familyCode: t('itemInput.familyLabel'),
      subCode: t('itemInput.subCodeLabel'),
      type: t('itemInput.typeLabel'),
      amount: t('itemInput.amountLabel'),
      color: t('itemInput.colorLabel'),
      destination: t('itemInput.destinationLabel'),
    },
  });
}

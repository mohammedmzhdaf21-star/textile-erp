import type { TFunction } from 'i18next';
import { getColorLabel } from './colorLabels';
import {
  BRANCH_CODE_BY_ID,
  getBranchLabel,
  getItemTypeLabel,
  printInventoryLabel,
  type InventoryItemType,
} from './inventoryCodes';

export const printPieceInventoryLabel = (input: {
  t: TFunction;
  itemId: string;
  qrDataUrl: string;
  familyCode: number;
  subCode: number;
  type: InventoryItemType;
  pieceLength?: number;
  colorName?: string;
  branchId: string;
}) => {
  const branchCode = BRANCH_CODE_BY_ID[input.branchId];
  const branchLabel = branchCode ? getBranchLabel(input.t, branchCode) : input.branchId;
  const amountLabel =
    input.type === 'PIECE' && input.pieceLength
      ? input.t('itemInput.amountPiece', { qty: 1, length: input.pieceLength })
      : input.type === 'REMANENT' && input.pieceLength
        ? input.t('itemInput.amountMeters', { meters: input.pieceLength })
        : '1';

  return printInventoryLabel({
    itemId: input.itemId,
    qrDataUrl: input.qrDataUrl,
    familyCode: input.familyCode,
    subCode: input.subCode,
    type: input.type,
    typeLabel: getItemTypeLabel(input.t, input.type),
    colorName: getColorLabel(input.t, input.colorName),
    branchLabel,
    amountLabel,
    labels: {
      title: input.t('itemInput.qrLabel'),
      familyCode: input.t('itemInput.familyLabel'),
      subCode: input.t('itemInput.subCodeLabel'),
      type: input.t('itemInput.typeLabel'),
      amount: input.t('itemInput.amountLabel'),
      color: input.t('itemInput.colorLabel'),
      destination: input.t('itemInput.destinationLabel'),
    },
  });
};

import api from './api';
import { BRANCH_CODE_BY_ID } from './inventoryCodes';
import {
  createCuttingTaskFromSale,
  isTaskComplete,
  readTasks,
  type BranchCode,
  type BranchTask,
} from './taskSettings';

export type InventoryItemForCutting = {
  id: string;
  branchId: string;
  code: number;
  colorId: string;
  type: 'ROLL' | 'PIECE' | 'REMANENT';
  meters?: number | string | null;
  quantity?: number;
  isPiecePackage?: boolean;
  color?: { name?: string };
};

export const countShelfPieceStock = (items: InventoryItemForCutting[]) =>
  items
    .filter((item) => item.type === 'PIECE' && !item.isPiecePackage)
    .reduce((sum, item) => sum + Math.max(0, Number(item.quantity ?? 0)), 0);

export const findRollsWithStock = (items: InventoryItemForCutting[]) =>
  items
    .filter((item) => item.type === 'ROLL' && Number(item.meters ?? 0) > 0)
    .sort((a, b) => Number(b.meters ?? 0) - Number(a.meters ?? 0));

export const hasOpenCuttingTaskFor = (input: {
  branch: BranchCode;
  code?: number;
  colorName?: string;
}) =>
  readTasks().some(
    (task: BranchTask) =>
      !isTaskComplete(task) &&
      task.templateKey === 'CUTTING_FABRIC_ROLL' &&
      task.branch === input.branch &&
      task.code === input.code &&
      (task.colorName ?? '') === (input.colorName ?? '')
  );

export const maybeCreateCuttingTaskAfterPieceSale = async (input: {
  soldItemId: string;
  saleId?: string;
  branchCode?: BranchCode;
  assignedTo?: string;
}) => {
  const itemResponse = await api.get(`/inventory/${encodeURIComponent(input.soldItemId)}`);
  const soldItem = itemResponse.data as InventoryItemForCutting & {
    color?: { name?: string };
  };

  if (soldItem.type !== 'PIECE' || soldItem.isPiecePackage) {
    return null;
  }

  const branch =
    input.branchCode ?? (BRANCH_CODE_BY_ID[soldItem.branchId] as BranchCode | undefined);
  if (!branch) return null;

  const listResponse = await api.get('/inventory', {
    params: {
      branchId: soldItem.branchId,
      code: soldItem.code,
      colorId: soldItem.colorId,
      pageSize: 200,
    },
  });

  const items = (
    Array.isArray(listResponse.data) ? listResponse.data : listResponse.data?.items ?? []
  ) as InventoryItemForCutting[];

  const shelfPiecesLeft = countShelfPieceStock(items);
  const rolls = findRollsWithStock(items);

  if (shelfPiecesLeft > 0 || rolls.length === 0) {
    return null;
  }

  const colorName = soldItem.color?.name;
  if (hasOpenCuttingTaskFor({ branch, code: soldItem.code, colorName })) {
    return null;
  }

  const roll = rolls[0];
  return createCuttingTaskFromSale({
    branch,
    code: soldItem.code,
    colorName,
    sourceItemId: roll.id,
    soldItemId: input.soldItemId,
    saleId: input.saleId,
    assignedTo: input.assignedTo,
  });
};

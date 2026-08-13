import api from './api';
import { BRANCH_CODE_BY_ID } from './inventoryCodes';
import type { BranchCode, BranchTask } from './taskSettings';
import {
  completeCuttingTasksApi,
  createTaskApi,
  hasOpenCuttingTaskApi,
  notifyTasksUpdated,
} from './tasksApi';

export const isAutoManagedCuttingTask = (task: BranchTask) =>
  task.templateKey === 'CUTTING_FABRIC_ROLL';

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

export const maybeCreateCuttingTaskAfterPieceSale = async (input: {
  soldItemId: string;
  saleId?: string;
  branchCode?: BranchCode;
  assignedTo?: string;
  t?: (key: string, params?: Record<string, unknown>) => string;
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
  const alreadyOpen = await hasOpenCuttingTaskApi({
    branch,
    code: soldItem.code,
    colorName,
  });
  if (alreadyOpen) {
    return null;
  }

  const roll = rolls[0];
  const codeText = soldItem.code !== undefined ? String(soldItem.code) : 'unknown';
  const title = input.t
    ? input.t('taskTemplates.CUTTING_FABRIC_ROLL', { code: codeText })
    : `Cutting the fabric roll for code ${codeText}`;
  const note = input.t
    ? input.t('tasks.cuttingNote', {
        soldItemId: input.soldItemId,
        sourceItemId: roll.id,
        color: colorName,
      })
    : `Piece ${input.soldItemId} was sold. Cut another shelf piece from roll ${roll.id}${colorName ? ` (${colorName})` : ''}.`;

  const task = await createTaskApi({
    branch,
    templateKey: 'CUTTING_FABRIC_ROLL',
    title,
    assignedTo: input.assignedTo || 'Inventory team',
    note,
    schedule: 'ON_DEMAND',
    sourceSaleId: input.saleId,
    sourceItemId: roll.id,
    code: soldItem.code,
    colorName,
  });

  notifyTasksUpdated();
  return task;
};

export const completeCuttingTasksAfterRollToPiece = async (input: {
  rollItemId: string;
  branchId: string;
  code: number;
  colorName?: string;
  newPieceId: string;
}) => {
  const branch = BRANCH_CODE_BY_ID[input.branchId] as BranchCode | undefined;
  if (!branch) return [];

  const tasks = await completeCuttingTasksApi({
    branch,
    rollItemId: input.rollItemId,
    code: input.code,
    colorName: input.colorName,
  });

  notifyTasksUpdated();
  return tasks;
};

import QRCode from 'qrcode';
import api from './api';
import {
  buildInventoryItemId,
  resolvePieceInstanceKey,
} from './inventoryCodes';
import { isBelowRemnantThreshold } from './inventoryRules';

export type RollInventoryItem = {
  id: string;
  branchId: string;
  code: number;
  subCode?: number | string;
  colorId: string;
  color?: { id: string; name: string; hexCode?: string };
  type: 'ROLL' | 'PIECE' | 'REMANENT';
  meters?: string | number | null;
  pieceLength?: string | number | null;
  quantity: number;
  costPrice?: string | number | null;
  version: number;
  qrCodeDataUrl?: string | null;
  isPiecePackage?: boolean;
  packageKey?: string;
};

export type CutRollOptions = {
  /** Create a dedicated piece row + QR for exchange / immediate sale */
  uniquePiece?: boolean;
};

export type CutRollResult = {
  pieceItemId: string;
  qrCodeDataUrl: string;
  addedToExisting: boolean;
  createAsRemnant: boolean;
  cutMeters: number;
  pieceLength?: number;
  subCode: number;
};

const toNumber = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const itemSubCode = (item: RollInventoryItem) =>
  toNumber(item.subCode ?? item.costPrice ?? 0);

export const createQrDataUrl = (itemId: string) =>
  QRCode.toDataURL(itemId, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 220,
  });

export const findExistingPieceForRollCut = async (
  rollSource: RollInventoryItem,
  pieceLength: number
) => {
  const response = await api.get('/inventory', {
    params: {
      branchId: rollSource.branchId,
      colorId: rollSource.colorId,
      type: 'PIECE',
      code: rollSource.code,
      pageSize: 200,
    },
  });
  const items = (response.data?.items ?? response.data ?? []) as RollInventoryItem[];

  const matches = items.filter((item) => {
    if (item.isPiecePackage || (item.packageKey ?? '').startsWith('piece-')) return false;
    if (Math.abs(toNumber(item.pieceLength) - pieceLength) >= 0.001) return false;
    return true;
  });

  return matches.find((item) => item.quantity === 0) ?? matches[0] ?? null;
};

const listPiecesForFamily = async (rollSource: RollInventoryItem) => {
  const response = await api.get('/inventory', {
    params: {
      branchId: rollSource.branchId,
      colorId: rollSource.colorId,
      type: 'PIECE',
      code: rollSource.code,
      pageSize: 200,
    },
  });
  return (response.data?.items ?? response.data ?? []) as RollInventoryItem[];
};

const patchSourceStock = async (item: RollInventoryItem, amount: number) => {
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

export const cutRollToPieceStock = async (
  rollSource: RollInventoryItem,
  cutMeters: number,
  options: CutRollOptions = {}
): Promise<CutRollResult> => {
  const uniquePiece = options.uniquePiece ?? false;

  if (rollSource.type !== 'ROLL' && rollSource.type !== 'REMANENT') {
    throw new Error('ONLY_ROLLS');
  }
  if (!Number.isFinite(cutMeters) || cutMeters <= 0) {
    throw new Error('INVALID_CUT_AMOUNT');
  }
  if (cutMeters > toNumber(rollSource.meters)) {
    throw new Error('CUT_EXCEEDS_ROLL');
  }

  const createAsRemnant = isBelowRemnantThreshold(cutMeters);
  const existingPiece =
    createAsRemnant || uniquePiece
      ? null
      : await findExistingPieceForRollCut(rollSource, cutMeters);

  let pieceItemId: string;
  let qrCodeDataUrl: string;
  let addedToExisting = false;
  let pieceInstanceKey: string | undefined;

  if (existingPiece) {
    pieceItemId = existingPiece.id;
    qrCodeDataUrl = existingPiece.qrCodeDataUrl || (await createQrDataUrl(existingPiece.id));
    addedToExisting = true;
  } else {
    if (uniquePiece && !createAsRemnant) {
      const familyPieces = await listPiecesForFamily(rollSource);
      pieceInstanceKey = resolvePieceInstanceKey({
        items: familyPieces.map((item) => ({
          ...item,
          costPrice: item.costPrice ?? undefined,
        })),
        branchId: rollSource.branchId,
        familyCode: rollSource.code,
        subCode: itemSubCode(rollSource),
        colorId: rollSource.colorId,
        pieceLength: cutMeters,
      });
    }

    pieceItemId = buildInventoryItemId({
      branchId: rollSource.branchId,
      familyCode: rollSource.code,
      subCode: itemSubCode(rollSource),
      colorName: rollSource.color?.name || rollSource.colorId,
      colorId: rollSource.colorId,
      type: createAsRemnant ? 'REMANENT' : 'PIECE',
      pieceLength: createAsRemnant ? undefined : cutMeters,
      instanceKey: pieceInstanceKey,
    });
    qrCodeDataUrl = await createQrDataUrl(pieceItemId);
  }

  await patchSourceStock(rollSource, cutMeters);

  if (addedToExisting && existingPiece) {
    const patchBody: Record<string, unknown> = {
      version: existingPiece.version,
      quantity: existingPiece.quantity + 1,
    };
    if (!existingPiece.qrCodeDataUrl) {
      patchBody.qrCodeValue = pieceItemId;
      patchBody.qrCodeDataUrl = qrCodeDataUrl;
    }
    await api.patch(`/inventory/${encodeURIComponent(pieceItemId)}`, patchBody);
  } else {
    await api.post('/inventory', {
      id: pieceItemId,
      branchId: rollSource.branchId,
      code: rollSource.code,
      subCode: itemSubCode(rollSource),
      colorId: rollSource.colorId,
      type: createAsRemnant ? 'REMANENT' : 'PIECE',
      meters: createAsRemnant ? cutMeters : undefined,
      pieceLength: createAsRemnant ? undefined : cutMeters,
      quantity: 1,
      costPrice: rollSource.costPrice ? toNumber(rollSource.costPrice) : undefined,
      qrCodeValue: pieceItemId,
      qrCodeDataUrl,
      pictureName: rollSource.id,
      pictureDataUrl: rollSource.qrCodeDataUrl || undefined,
      sourceItemId: rollSource.id,
      conversionType: createAsRemnant ? 'ROLL_TO_REMANENT' : 'ROLL_TO_PIECE',
      packageKey: pieceInstanceKey,
    });
  }

  return {
    pieceItemId,
    qrCodeDataUrl,
    addedToExisting,
    createAsRemnant,
    cutMeters,
    pieceLength: createAsRemnant ? undefined : cutMeters,
    subCode: itemSubCode(rollSource),
  };
};

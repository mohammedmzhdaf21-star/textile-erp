import QRCode from 'qrcode';
import api from './api';

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
  roll?: RollInventoryItem;
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

  const response = await api.post('/inventory/roll-cut', {
    rollId: rollSource.id,
    version: rollSource.version,
    cutMeters,
    uniquePiece,
  });

  const data = response.data as CutRollResult & {
    pieceItemId: string;
    qrCodeDataUrl?: string | null;
    roll?: {
      id: string;
      version: number;
      meters: number;
      type: string;
    };
  };

  const pieceItemId = data.pieceItemId;
  const finalQrCodeDataUrl =
    data.qrCodeDataUrl || (await createQrDataUrl(pieceItemId));

  return {
    pieceItemId,
    qrCodeDataUrl: finalQrCodeDataUrl,
    addedToExisting: data.addedToExisting,
    createAsRemnant: data.createAsRemnant,
    cutMeters: data.cutMeters,
    pieceLength: data.pieceLength,
    subCode: data.subCode,
    roll: data.roll
      ? {
          ...rollSource,
          id: data.roll.id,
          version: data.roll.version,
          meters: data.roll.meters,
          type: data.roll.type as RollInventoryItem['type'],
        }
      : undefined,
  };
};

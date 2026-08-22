import QRCode from 'qrcode';
import api from './api';

export type PieceCutResult = {
  split: boolean;
  soldPieceItemId: string;
  soldQrCodeValue: string;
  soldQrCodeDataUrl: string | null;
  soldType: 'PIECE' | 'REMANENT';
  soldMeters: number;
  remnantPieceItemId?: string;
  remnantQrCodeValue?: string;
  remnantQrCodeDataUrl?: string | null;
  remnantMeters?: number;
};

export const createQrDataUrl = (itemId: string) =>
  QRCode.toDataURL(itemId, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 220,
  });

export async function cutPieceForSale(input: {
  pieceId: string;
  version: number;
  soldMeters: number;
}): Promise<PieceCutResult> {
  const response = await api.post('/inventory/piece-cut', {
    pieceId: input.pieceId,
    version: input.version,
    soldMeters: input.soldMeters,
  });

  const data = response.data as PieceCutResult;

  return {
    ...data,
    soldQrCodeDataUrl:
      data.soldQrCodeDataUrl || (await createQrDataUrl(data.soldPieceItemId)),
    remnantQrCodeDataUrl:
      data.remnantPieceItemId && !data.remnantQrCodeDataUrl
        ? await createQrDataUrl(data.remnantPieceItemId)
        : data.remnantQrCodeDataUrl,
  };
}

export const availableMetersForScanItem = (item: {
  type: 'ROLL' | 'PIECE' | 'REMANENT';
  meters?: string | number | null;
  pieceLength?: string | number | null;
  quantity?: number;
  isPiecePackage?: boolean;
}) => {
  if (item.isPiecePackage) return 0;
  if (item.type === 'REMANENT') {
    return Number(item.meters ?? 0);
  }
  if (item.type === 'PIECE') {
    const pieceLength = Number(item.pieceLength ?? 0);
    const quantity = Math.max(0, item.quantity ?? 1);
    return pieceLength * quantity;
  }
  return 0;
};

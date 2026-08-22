import { Prisma } from '@prisma/client';
import QRCode from 'qrcode';
import { prisma } from './prisma';
import {
  buildInventoryItemId,
  resolveMeteredInstanceKey,
  resolvePieceInstanceKey,
} from './inventoryCodes';
import { isBelowRemnantThreshold } from './inventoryRules';

export interface PieceCutInput {
  pieceId: string;
  version: number;
  soldMeters: number;
  soldQrCodeDataUrl?: string;
  remnantQrCodeDataUrl?: string;
}

export interface PieceCutResult {
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
}

const toMoney = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const roundMeters = (value: number) => Math.round(value * 100) / 100;

const qrDataUrl = (itemId: string) =>
  QRCode.toDataURL(itemId, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 220,
  });

export const availableMetersForPieceItem = (item: {
  type: string;
  meters?: Prisma.Decimal | null;
  pieceLength?: Prisma.Decimal | null;
  quantity: number;
  isPiecePackage?: boolean;
}) => {
  if (item.isPiecePackage) return 0;
  if (item.type === 'REMANENT') {
    return roundMeters(item.meters ? parseFloat(item.meters.toString()) : 0);
  }
  if (item.type === 'PIECE') {
    const pieceLength = roundMeters(
      item.pieceLength ? parseFloat(item.pieceLength.toString()) : 0
    );
    const quantity = Math.max(0, item.quantity ?? 0);
    return roundMeters(pieceLength * quantity);
  }
  return 0;
};

const soldInventoryShape = (soldMeters: number) => {
  if (isBelowRemnantThreshold(soldMeters)) {
    return { type: 'REMANENT' as const, meters: soldMeters, pieceLength: 0 };
  }
  return { type: 'PIECE' as const, meters: null, pieceLength: soldMeters };
};

export async function cutPieceForSale(
  input: PieceCutInput,
  performedById?: string,
  performedByEmail?: string
): Promise<PieceCutResult> {
  const soldMeters = roundMeters(Number(input.soldMeters));
  if (!Number.isFinite(soldMeters) || soldMeters <= 0) {
    throw new Error('Sold meters must be positive');
  }

  return prisma.$transaction(async (tx) => {
    const source = await tx.inventoryItem.findUnique({
      where: { id: input.pieceId },
      include: { color: true },
    });

    if (!source) throw new Error('Inventory item not found');
    if (source.isArchived) throw new Error('Inventory item is archived');
    if (source.type !== 'PIECE' && source.type !== 'REMANENT') {
      throw new Error('Only pieces and remnants can be scanned in the piece sale flow');
    }
    if (source.isPiecePackage) {
      throw new Error('Piece packages must be sold as full packages or selected components');
    }
    if (source.version !== input.version) {
      throw new Error('Item was modified by another user. Please refresh and try again.');
    }

    const availableMeters = availableMetersForPieceItem(source);
    if (availableMeters <= 0) {
      throw new Error('Item has no available length to sell');
    }
    if (soldMeters > availableMeters + 0.001) {
      throw new Error(
        `Sold length exceeds available stock. Available: ${availableMeters}m, Requested: ${soldMeters}m`
      );
    }

    const subCode = source.costPrice
      ? parseFloat(source.costPrice.toString())
      : parseFloat(source.subCode.toString());

    const isWholeSale = soldMeters >= availableMeters - 0.001;
    if (isWholeSale) {
      return {
        split: false,
        soldPieceItemId: source.id,
        soldQrCodeValue: source.qrCodeValue ?? source.id,
        soldQrCodeDataUrl: source.qrCodeDataUrl,
        soldType: source.type === 'REMANENT' ? 'REMANENT' : 'PIECE',
        soldMeters: availableMeters,
      };
    }

    const remainingMeters = roundMeters(availableMeters - soldMeters);
    if (remainingMeters <= 0) {
      throw new Error('Remaining length must be positive after a partial cut');
    }

    const familyItems = await tx.inventoryItem.findMany({
      where: {
        branchId: source.branchId,
        colorId: source.colorId,
        code: source.code,
        isArchived: false,
      },
    });

    const soldShape = soldInventoryShape(soldMeters);
    let soldInstanceKey: string | undefined;
    if (soldShape.type === 'PIECE') {
      soldInstanceKey = resolvePieceInstanceKey({
        items: familyItems.map((item) => ({
          branchId: item.branchId,
          code: item.code,
          subCode: parseFloat(item.subCode.toString()),
          costPrice: item.costPrice ? parseFloat(item.costPrice.toString()) : undefined,
          colorId: item.colorId,
          type: item.type,
          pieceLength: item.pieceLength ? parseFloat(item.pieceLength.toString()) : null,
          packageKey: item.packageKey,
          isPiecePackage: item.isPiecePackage,
        })),
        branchId: source.branchId,
        familyCode: source.code,
        subCode,
        colorId: source.colorId,
        pieceLength: soldShape.pieceLength,
      });
    }

    const nextRemnantKey =
      resolveMeteredInstanceKey({
        type: 'REMANENT',
        items: familyItems.map((item) => ({
          id: item.id,
          branchId: item.branchId,
          code: item.code,
          subCode: item.subCode,
          costPrice: item.costPrice,
          colorId: item.colorId,
          type: item.type,
          packageKey: item.packageKey,
        })),
        branchId: source.branchId,
        familyCode: source.code,
        subCode,
        colorId: source.colorId,
      }) || 'remnant-1';

    const nextRemnantNum = (() => {
      const match = nextRemnantKey.match(/^remnant-(\d+)$/);
      return match ? Number(match[1]) : 1;
    })();

    const soldRemnantInstanceKey =
      soldShape.type === 'REMANENT' ? nextRemnantKey : undefined;
    const storeRemnantInstanceKey =
      soldShape.type === 'REMANENT'
        ? `remnant-${nextRemnantNum + 1}`
        : nextRemnantKey;

    const soldPieceItemId = buildInventoryItemId({
      branchId: source.branchId,
      familyCode: source.code,
      subCode,
      colorName: source.color.name,
      colorId: source.colorId,
      type: soldShape.type,
      pieceLength: soldShape.type === 'PIECE' ? soldShape.pieceLength : undefined,
      instanceKey: soldRemnantInstanceKey,
    });

    const remnantPieceItemId = buildInventoryItemId({
      branchId: source.branchId,
      familyCode: source.code,
      subCode,
      colorName: source.color.name,
      colorId: source.colorId,
      type: 'REMANENT',
      instanceKey: storeRemnantInstanceKey,
    });

    if (soldPieceItemId === remnantPieceItemId) {
      throw new Error('Could not generate distinct inventory IDs for sold and remnant pieces');
    }

    const archiveResult = await tx.inventoryItem.updateMany({
      where: {
        id: source.id,
        version: source.version,
        isArchived: false,
      },
      data: {
        isArchived: true,
        version: { increment: 1 },
      },
    });
    if (archiveResult.count === 0) {
      throw new Error('Item was modified by another user. Please refresh and try again.');
    }

    const soldQrCodeValue = soldPieceItemId;
    const remnantQrCodeValue = remnantPieceItemId;
    const [soldQrCodeDataUrl, remnantQrCodeDataUrlStored] = await Promise.all([
      input.soldQrCodeDataUrl ?? qrDataUrl(soldPieceItemId),
      input.remnantQrCodeDataUrl ?? qrDataUrl(remnantPieceItemId),
    ]);

    const existingSold = await tx.inventoryItem.findUnique({ where: { id: soldPieceItemId } });
    if (existingSold) {
      throw new Error(`Inventory item ${soldPieceItemId} already exists`);
    }
    const existingRemnant = await tx.inventoryItem.findUnique({ where: { id: remnantPieceItemId } });
    if (existingRemnant) {
      throw new Error(`Inventory item ${remnantPieceItemId} already exists`);
    }

    await tx.inventoryItem.create({
      data: {
        id: soldPieceItemId,
        branchId: source.branchId,
        code: source.code,
        subCode: source.subCode,
        colorId: source.colorId,
        type: soldShape.type,
        meters:
          soldShape.type === 'REMANENT'
            ? new Prisma.Decimal(soldMeters.toFixed(2))
            : null,
        pieceLength:
          soldShape.type === 'PIECE'
            ? new Prisma.Decimal(soldShape.pieceLength.toFixed(2))
            : new Prisma.Decimal(0),
        quantity: 1,
        costPrice: source.costPrice ?? source.subCode,
        qrCodeValue: soldQrCodeValue,
        qrCodeDataUrl: soldQrCodeDataUrl,
        pictureName: source.id,
        pictureDataUrl: source.qrCodeDataUrl,
        sourceItemId: source.id,
        conversionType: 'PIECE_SPLIT_SOLD',
        packageKey: soldShape.type === 'PIECE' ? soldInstanceKey ?? '' : soldRemnantInstanceKey ?? '',
      },
    });

    await tx.inventoryItem.create({
      data: {
        id: remnantPieceItemId,
        branchId: source.branchId,
        code: source.code,
        subCode: source.subCode,
        colorId: source.colorId,
        type: 'REMANENT',
        meters: new Prisma.Decimal(remainingMeters.toFixed(2)),
        pieceLength: new Prisma.Decimal(0),
        quantity: 1,
        costPrice: source.costPrice ?? source.subCode,
        qrCodeValue: remnantQrCodeValue,
        qrCodeDataUrl: remnantQrCodeDataUrlStored,
        pictureName: source.id,
        pictureDataUrl: source.qrCodeDataUrl,
        sourceItemId: source.id,
        conversionType: 'PIECE_SPLIT_REMNANT',
        packageKey: storeRemnantInstanceKey,
      },
    });

    await tx.auditLog.create({
      data: {
        entityType: 'InventoryItem',
        entityId: source.id,
        action: 'UPDATE',
        performedById: performedById || null,
        performedByEmail: performedByEmail || null,
        branchId: source.branchId,
        changes: {
          pieceSplit: true,
          soldMeters,
          remainingMeters,
          soldPieceItemId,
          remnantPieceItemId,
        } as Prisma.InputJsonValue,
      },
    });

    return {
      split: true,
      soldPieceItemId,
      soldQrCodeValue,
      soldQrCodeDataUrl,
      soldType: soldShape.type,
      soldMeters,
      remnantPieceItemId,
      remnantQrCodeValue,
      remnantQrCodeDataUrl: remnantQrCodeDataUrlStored,
      remnantMeters: remainingMeters,
    };
  });
}

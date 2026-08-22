import { Prisma } from '@prisma/client';
import QRCode from 'qrcode';
import { prisma } from './prisma';
import {
  buildInventoryItemId,
  resolvePieceInstanceKey,
} from './inventoryCodes';
import { isBelowRemnantThreshold, meterStockUpdateAfterDeduction } from './inventoryRules';

export interface CutRollInput {
  rollId: string;
  version: number;
  cutMeters: number;
  uniquePiece?: boolean;
  qrCodeDataUrl?: string;
}

export interface CutRollResult {
  pieceItemId: string;
  qrCodeValue: string;
  qrCodeDataUrl: string | null;
  addedToExisting: boolean;
  createAsRemnant: boolean;
  cutMeters: number;
  pieceLength?: number;
  subCode: number;
  roll: {
    id: string;
    version: number;
    meters: number;
    type: string;
  };
}

const toMoney = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

export async function cutRollToPiece(
  input: CutRollInput,
  performedById?: string,
  performedByEmail?: string
): Promise<CutRollResult> {
  const cutMeters = Number(input.cutMeters.toFixed(2));
  const uniquePiece = input.uniquePiece ?? false;

  if (!Number.isFinite(cutMeters) || cutMeters <= 0) {
    throw new Error('Cut meters must be positive');
  }

  return prisma.$transaction(async (tx) => {
    const roll = await tx.inventoryItem.findUnique({
      where: { id: input.rollId },
      include: { color: true },
    });

    if (!roll) throw new Error('Roll not found');
    if (roll.isArchived) throw new Error('Roll is archived');
    if (roll.type !== 'ROLL' && roll.type !== 'REMANENT') {
      throw new Error('Only rolls and remnants can be cut');
    }
    if (roll.version !== input.version) {
      throw new Error('Roll was modified by another user. Please refresh and try again.');
    }

    const currentMeters = roll.meters ? parseFloat(roll.meters.toString()) : 0;
    if (cutMeters > currentMeters + 0.001) {
      throw new Error(`Cut exceeds available meters. Available: ${currentMeters}m`);
    }

    const subCode = roll.costPrice
      ? parseFloat(roll.costPrice.toString())
      : parseFloat(roll.subCode.toString());
    const createAsRemnant = isBelowRemnantThreshold(cutMeters);

    let existingPiece: {
      id: string;
      version: number;
      quantity: number;
      qrCodeValue: string | null;
      qrCodeDataUrl: string | null;
    } | null = null;

    if (!createAsRemnant && !uniquePiece) {
      const familyPieces = await tx.inventoryItem.findMany({
        where: {
          branchId: roll.branchId,
          colorId: roll.colorId,
          type: 'PIECE',
          code: roll.code,
          isArchived: false,
          isPiecePackage: false,
        },
      });

      const sameLength = (item: (typeof familyPieces)[number]) => {
        const packageKey = item.packageKey ?? '';
        if (packageKey.startsWith('piece-')) return false;
        return Math.abs(parseFloat(item.pieceLength.toString()) - cutMeters) < 0.001;
      };

      existingPiece =
        familyPieces.filter(sameLength).find((item) => item.quantity === 0) ??
        familyPieces.find(sameLength) ??
        familyPieces
          .filter(
            (item) =>
              Math.abs(parseFloat(item.pieceLength.toString()) - cutMeters) < 0.001 &&
              item.quantity === 0
          )
          .find((item) => !(item.packageKey ?? '').startsWith('piece-')) ??
        familyPieces.find(
          (item) =>
            Math.abs(parseFloat(item.pieceLength.toString()) - cutMeters) < 0.001 &&
            item.quantity === 0
        ) ??
        null;
    }

    let pieceItemId: string;
    let pieceInstanceKey: string | undefined;
    let addedToExisting = false;

    if (existingPiece) {
      pieceItemId = existingPiece.id;
      addedToExisting = true;
    } else {
      if (uniquePiece && !createAsRemnant) {
        const familyPieces = await tx.inventoryItem.findMany({
          where: {
            branchId: roll.branchId,
            colorId: roll.colorId,
            type: 'PIECE',
            code: roll.code,
            isArchived: false,
          },
        });
        pieceInstanceKey = resolvePieceInstanceKey({
          items: familyPieces.map((item) => ({
            id: item.id,
            branchId: item.branchId,
            code: item.code,
            subCode: parseFloat(item.subCode.toString()),
            costPrice: item.costPrice ? parseFloat(item.costPrice.toString()) : undefined,
            colorId: item.colorId,
            type: item.type,
            pieceLength: parseFloat(item.pieceLength.toString()),
            packageKey: item.packageKey,
            isPiecePackage: item.isPiecePackage,
          })),
          branchId: roll.branchId,
          familyCode: roll.code,
          subCode,
          colorId: roll.colorId,
          pieceLength: cutMeters,
        });
      }

      pieceItemId = buildInventoryItemId({
        branchId: roll.branchId,
        familyCode: roll.code,
        subCode,
        colorName: roll.color.name,
        colorId: roll.colorId,
        type: createAsRemnant ? 'REMANENT' : 'PIECE',
        pieceLength: createAsRemnant ? undefined : cutMeters,
        instanceKey: pieceInstanceKey,
      });

      if (uniquePiece && !createAsRemnant) {
        let attempt = 0;
        while (attempt < 50) {
          const taken = await tx.inventoryItem.findUnique({ where: { id: pieceItemId } });
          if (!taken || taken.isArchived) break;
          attempt += 1;
          const nextInstance = (pieceInstanceKey?.match(/^piece-(\d+)$/)?.[1]
            ? Number(pieceInstanceKey.match(/^piece-(\d+)$/)![1])
            : 0) + 1;
          pieceInstanceKey = `piece-${nextInstance}`;
          pieceItemId = buildInventoryItemId({
            branchId: roll.branchId,
            familyCode: roll.code,
            subCode,
            colorName: roll.color.name,
            colorId: roll.colorId,
            type: 'PIECE',
            pieceLength: cutMeters,
            instanceKey: pieceInstanceKey,
          });
        }
      }
    }

    const remainingMeters = currentMeters - cutMeters;
    const meterUpdate = meterStockUpdateAfterDeduction(roll.type, remainingMeters);
    const rollUpdate = await tx.inventoryItem.updateMany({
      where: {
        id: roll.id,
        version: roll.version,
        isArchived: false,
        meters: { gte: new Prisma.Decimal(cutMeters.toFixed(2)) },
      },
      data: {
        meters: new Prisma.Decimal(meterUpdate.meters.toFixed(2)),
        ...(meterUpdate.type ? { type: meterUpdate.type } : {}),
        version: { increment: 1 },
      },
    });

    if (rollUpdate.count === 0) {
      throw new Error('Roll was modified by another user. Please refresh and try again.');
    }

    const qrCodeValue = pieceItemId;
    const qrCodeDataUrl =
      input.qrCodeDataUrl ??
      (await QRCode.toDataURL(pieceItemId, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 220,
      }));

    if (addedToExisting && existingPiece) {
      const pieceUpdate = await tx.inventoryItem.updateMany({
        where: {
          id: existingPiece.id,
          version: existingPiece.version,
          isArchived: false,
        },
        data: {
          quantity: { increment: 1 },
          ...(qrCodeDataUrl && !existingPiece.qrCodeDataUrl
            ? { qrCodeValue, qrCodeDataUrl }
            : {}),
          version: { increment: 1 },
        },
      });
      if (pieceUpdate.count === 0) {
        throw new Error('Piece stock was modified by another user. Please refresh and try again.');
      }
    } else {
      const existingId = await tx.inventoryItem.findUnique({ where: { id: pieceItemId } });
      if (existingId) {
        throw new Error(`Inventory item ${pieceItemId} already exists`);
      }

      await tx.inventoryItem.create({
        data: {
          id: pieceItemId,
          branchId: roll.branchId,
          code: roll.code,
          subCode: roll.subCode,
          colorId: roll.colorId,
          type: createAsRemnant ? 'REMANENT' : 'PIECE',
          meters: createAsRemnant ? new Prisma.Decimal(cutMeters.toFixed(2)) : null,
          pieceLength: createAsRemnant
            ? new Prisma.Decimal(0)
            : new Prisma.Decimal(cutMeters.toFixed(2)),
          quantity: 1,
          costPrice: roll.costPrice ?? roll.subCode,
          qrCodeValue,
          qrCodeDataUrl,
          pictureName: roll.id,
          pictureDataUrl: roll.qrCodeDataUrl,
          sourceItemId: roll.id,
          conversionType: createAsRemnant ? 'ROLL_TO_REMANENT' : 'ROLL_TO_PIECE',
          packageKey: pieceInstanceKey ?? '',
        },
      });
    }

    const updatedRoll = await tx.inventoryItem.findUnique({ where: { id: roll.id } });
    if (!updatedRoll) throw new Error('Roll not found after cut');

    await tx.auditLog.create({
      data: {
        entityType: 'InventoryItem',
        entityId: roll.id,
        action: 'UPDATE',
        performedById: performedById || null,
        performedByEmail: performedByEmail || null,
        branchId: roll.branchId,
        changes: {
          rollCut: true,
          cutMeters,
          pieceItemId,
          createAsRemnant,
          addedToExisting,
        } as Prisma.InputJsonValue,
      },
    });

    return {
      pieceItemId,
      qrCodeValue,
      qrCodeDataUrl,
      addedToExisting,
      createAsRemnant,
      cutMeters,
      pieceLength: createAsRemnant ? undefined : cutMeters,
      subCode,
      roll: {
        id: updatedRoll.id,
        version: updatedRoll.version,
        meters: updatedRoll.meters ? parseFloat(updatedRoll.meters.toString()) : 0,
        type: updatedRoll.type,
      },
    };
  });
}

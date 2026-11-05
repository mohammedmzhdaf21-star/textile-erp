import { Prisma } from '@prisma/client';
import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/authenticate';
import { writeAuditLog } from '../lib/auditLog';
import prisma from '../lib/prisma';
import {
  TailorMeasurementError,
  parseTailorMeasurementInput,
} from '../lib/tailorMeasurements';

const router = Router();

router.use(authenticate);

type MeasurementRow = {
  id: string;
  code: number;
  customerName: string;
  phone: string;
  shoulderCm: Prisma.Decimal | number;
  armCm: Prisma.Decimal | number;
  waistCm: Prisma.Decimal | number;
  chestCm: Prisma.Decimal | number;
  heightCm: Prisma.Decimal | number;
  buttCm: Prisma.Decimal | number;
  costIqd: Prisma.Decimal | number;
  paidIqd: Prisma.Decimal | number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: { id: string; name: string } | null;
};

function serialize(row: MeasurementRow) {
  return {
    id: row.id,
    code: row.code,
    customerName: row.customerName,
    phone: row.phone,
    shoulderCm: Number(row.shoulderCm),
    armCm: Number(row.armCm),
    waistCm: Number(row.waistCm),
    chestCm: Number(row.chestCm),
    heightCm: Number(row.heightCm),
    buttCm: Number(row.buttCm),
    costIqd: Number(row.costIqd),
    paidIqd: Number(row.paidIqd),
    remainingIqd: Math.round((Number(row.costIqd) - Number(row.paidIqd)) * 100) / 100,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    createdByName: row.createdBy?.name ?? null,
  };
}

const includeCreatedBy = {
  createdBy: { select: { id: true, name: true } },
} as const;

async function nextCode() {
  const rows = await prisma.$queryRaw<Array<{ is_called: boolean; last_value: bigint | number }>>`
    SELECT is_called, last_value
    FROM tailor_measurements_code_seq
  `;
  const row = rows[0];
  if (!row) return 1;
  const last = Number(row.last_value);
  return row.is_called ? last + 1 : last;
}

function errorResponse(res: Response, error: unknown, fallback: string) {
  if (error instanceof TailorMeasurementError) {
    return res.status(400).json({ error: error.code, code: error.code });
  }
  const message = error instanceof Error ? error.message : fallback;
  const status = message.toLowerCase().includes('not found') ? 404 : 400;
  return res.status(status).json({ error: message });
}

router.get('/next-code', async (_req: Request, res: Response) => {
  try {
    const code = await nextCode();
    return res.status(200).json({ code });
  } catch (error) {
    return errorResponse(res, error, 'Failed to read the next tailor code');
  }
});

router.get('/', async (req: Request, res: Response) => {
  try {
    const q = String(req.query.q ?? '').trim();
    const where: Prisma.TailorMeasurementWhereInput = {};
    if (q) {
      const asNumber = Number(q);
      const or: Prisma.TailorMeasurementWhereInput[] = [
        { customerName: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q } },
      ];
      if (Number.isInteger(asNumber) && asNumber > 0) {
        or.unshift({ code: asNumber });
      }
      where.OR = or;
    }

    const items = await prisma.tailorMeasurement.findMany({
      where,
      include: includeCreatedBy,
      orderBy: { code: 'desc' },
      take: 200,
    });

    return res.status(200).json({
      items: items.map(serialize),
      nextCode: await nextCode(),
    });
  } catch (error) {
    return errorResponse(res, error, 'Failed to list tailor measurements');
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const input = parseTailorMeasurementInput(req.body);
    const item = await prisma.tailorMeasurement.create({
      data: {
        customerName: input.customerName,
        phone: input.phone,
        shoulderCm: input.shoulderCm,
        armCm: input.armCm,
        waistCm: input.waistCm,
        chestCm: input.chestCm,
        heightCm: input.heightCm,
        buttCm: input.buttCm,
        costIqd: input.costIqd,
        paidIqd: input.paidIqd,
        createdById: req.user!.userId,
      },
      include: includeCreatedBy,
    });

    await writeAuditLog({
      entityType: 'TailorMeasurement',
      entityId: item.id,
      action: 'CREATE',
      performedById: req.user!.userId,
      performedByEmail: req.user!.email,
      changes: serialize(item),
    });

    return res.status(201).json({ item: serialize(item) });
  } catch (error) {
    return errorResponse(res, error, 'Failed to save tailor measurement');
  }
});

router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const existing = await prisma.tailorMeasurement.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'NOT_FOUND', code: 'NOT_FOUND' });
    }

    const input = parseTailorMeasurementInput(req.body);
    const item = await prisma.tailorMeasurement.update({
      where: { id },
      data: {
        customerName: input.customerName,
        phone: input.phone,
        shoulderCm: input.shoulderCm,
        armCm: input.armCm,
        waistCm: input.waistCm,
        chestCm: input.chestCm,
        heightCm: input.heightCm,
        buttCm: input.buttCm,
        costIqd: input.costIqd,
        paidIqd: input.paidIqd,
      },
      include: includeCreatedBy,
    });

    await writeAuditLog({
      entityType: 'TailorMeasurement',
      entityId: item.id,
      action: 'UPDATE',
      performedById: req.user!.userId,
      performedByEmail: req.user!.email,
      changes: serialize(item),
    });

    return res.status(200).json({ item: serialize(item) });
  } catch (error) {
    return errorResponse(res, error, 'Failed to update tailor measurement');
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const existing = await prisma.tailorMeasurement.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'NOT_FOUND', code: 'NOT_FOUND' });
    }

    await prisma.tailorMeasurement.delete({ where: { id } });
    await writeAuditLog({
      entityType: 'TailorMeasurement',
      entityId: existing.id,
      action: 'DELETE',
      performedById: req.user!.userId,
      performedByEmail: req.user!.email,
      changes: { code: existing.code, customerName: existing.customerName },
    });

    return res.status(200).json({ code: existing.code });
  } catch (error) {
    return errorResponse(res, error, 'Failed to delete tailor measurement');
  }
});

export default router;

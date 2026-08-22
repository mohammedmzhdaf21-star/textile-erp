import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import {
  listInventory,
  getInventoryItem,
  createInventoryItem,
  updateInventoryItem,
  archiveInventoryItem,
  restoreInventoryItem,
  deleteInventoryItem,
  getInventoryStats,
} from '../lib/inventory';
import {
  requireInventoryCreateAccess,
  requireInventoryUpdateAccess,
} from '../lib/inventoryAccess';
import { authenticate, requireRole } from '../middleware/authenticate';
import { parseOptionalInt, parsePage, parsePageSize } from '../lib/routeHelpers';

const router = Router();

const singleParam = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

// All inventory routes require authentication
router.use(authenticate);

// ============================================================
// GET /api/inventory
// ============================================================
router.get('/', async (req: Request, res: Response) => {
  try {
    const branchId = req.query.branchId as string | undefined;
    const colorId = req.query.colorId as string | undefined;
    const typeRaw = req.query.type as string | undefined;
    const codeRaw = req.query.code as string | undefined;
    const itemIdRaw = req.query.itemId as string | undefined;
    const includeArchivedRaw = req.query.includeArchived as string | undefined;
    const pageRaw = req.query.page as string | undefined;
    const pageSizeRaw = req.query.pageSize as string | undefined;

    let type: 'ROLL' | 'PIECE' | 'REMANENT' | undefined;
    if (typeRaw === 'ROLL' || typeRaw === 'PIECE' || typeRaw === 'REMANENT') {
      type = typeRaw;
    }

    const code = parseOptionalInt(codeRaw);
    const includeArchived = includeArchivedRaw === 'true';
    const page = parsePage(pageRaw, 1);
    const pageSize = parsePageSize(pageSizeRaw, 50);

    const result = await listInventory({
      branchId,
      colorId,
      type,
      code,
      itemId: itemIdRaw,
      includeArchived,
      page,
      pageSize,
    });

    return res.status(200).json(result);
  } catch (error: any) {
    return res.status(500).json({
      error: error.message || 'Failed to list inventory',
    });
  }
});

// ============================================================
// GET /api/inventory/stats/summary
// ============================================================
router.get('/stats/summary', async (req: Request, res: Response) => {
  try {
    const branchId = req.query.branchId as string | undefined;
    const stats = await getInventoryStats(branchId);
    return res.status(200).json(stats);
  } catch (error: any) {
    return res.status(500).json({
      error: error.message || 'Failed to get stats',
    });
  }
});

// ============================================================
// GET /api/inventory/branches
// ============================================================
router.get('/branches', async (_req: Request, res: Response) => {
  try {
    const branches = await prisma.branch.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    return res.status(200).json(branches);
  } catch (error: any) {
    return res.status(500).json({
      error: error.message || 'Failed to list branches',
    });
  }
});

// ============================================================
// GET /api/inventory/colors
// ============================================================
router.get('/colors', async (_req: Request, res: Response) => {
  try {
    const colors = await prisma.color.findMany({
      where: { isActive: true },
      select: { id: true, name: true, hexCode: true },
      orderBy: { name: 'asc' },
    });
    return res.status(200).json(colors);
  } catch (error: any) {
    return res.status(500).json({
      error: error.message || 'Failed to list colors',
    });
  }
});

// ============================================================
// POST /api/inventory/colors (ADMIN, MANAGER only)
// ============================================================
router.post(
  '/colors',
  requireRole('ADMIN', 'MANAGER'),
  async (req: Request, res: Response) => {
    try {
      const name = String(req.body?.name ?? '').trim();
      const hexCodeRaw = req.body?.hexCode;

      if (!name) {
        return res.status(400).json({ error: 'Color name is required' });
      }

      if (name.length > 50) {
        return res.status(400).json({ error: 'Color name must be 50 characters or fewer' });
      }

      const hexCode =
        hexCodeRaw !== undefined && String(hexCodeRaw).trim()
          ? String(hexCodeRaw).trim()
          : undefined;

      if (hexCode && !/^#[0-9A-Fa-f]{6}$/.test(hexCode)) {
        return res.status(400).json({ error: 'hexCode must be a valid #RRGGBB value' });
      }

      const existing = await prisma.color.findFirst({
        where: {
          name: {
            equals: name,
            mode: 'insensitive',
          },
        },
      });

      if (existing) {
        return res.status(200).json(existing);
      }

      const color = await prisma.color.create({
        data: {
          name,
          hexCode,
        },
        select: { id: true, name: true, hexCode: true },
      });

      return res.status(201).json(color);
    } catch (error: any) {
      return res.status(500).json({
        error: error.message || 'Failed to create color',
      });
    }
  }
);

// ============================================================
// GET /api/inventory/:id
// ============================================================
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = singleParam(req.params.id);
    if (!id) {
      return res.status(400).json({ error: 'Inventory item id is required' });
    }
    const item = await getInventoryItem(id);
    return res.status(200).json(item);
  } catch (error: any) {
    const msg = error.message || 'Failed to get item';
    if (msg.includes('not found')) {
      return res.status(404).json({ error: msg });
    }
    return res.status(500).json({ error: msg });
  }
});

// ============================================================
// POST /api/inventory (ADMIN, MANAGER only)
// ============================================================
router.post(
  '/',
  requireInventoryCreateAccess,
  async (req: Request, res: Response) => {
    try {
      const {
        id,
        branchId,
        code,
        subCode,
        colorId,
        type,
        meters,
        pieceLength,
        quantity,
        costPrice,
        qrCodeValue,
        qrCodeDataUrl,
        pictureName,
        pictureDataUrl,
        description,
        isPiecePackage,
        packageKey,
        packageComponents,
        sourceItemId,
        conversionType,
      } = req.body;

      if (!id || !branchId || code === undefined || subCode === undefined || !colorId || !type) {
        return res.status(400).json({
          error: 'Missing required fields: id, branchId, code, subCode, colorId, type',
        });
      }

      const parsedSubCode = parseFloat(String(subCode));
      if (!Number.isFinite(parsedSubCode) || parsedSubCode < 0) {
        return res.status(400).json({
          error: 'subCode must be a non-negative price value',
        });
      }

      if (type !== 'ROLL' && type !== 'PIECE' && type !== 'REMANENT') {
        return res.status(400).json({
          error: 'type must be ROLL, PIECE, or REMANENT',
        });
      }

      const item = await createInventoryItem(
        {
          id,
          branchId,
          code: parseInt(String(code), 10),
          subCode: parsedSubCode,
          colorId,
          type,
          meters: meters !== undefined ? parseFloat(String(meters)) : undefined,
          pieceLength:
            pieceLength !== undefined ? parseFloat(String(pieceLength)) : undefined,
          quantity: quantity !== undefined ? parseInt(String(quantity), 10) : undefined,
          costPrice:
            costPrice !== undefined ? parseFloat(String(costPrice)) : undefined,
          qrCodeValue:
            qrCodeValue !== undefined ? String(qrCodeValue) : String(id),
          qrCodeDataUrl:
            qrCodeDataUrl !== undefined ? String(qrCodeDataUrl) : undefined,
          pictureName:
            pictureName !== undefined ? String(pictureName) : undefined,
          pictureDataUrl:
            pictureDataUrl !== undefined ? String(pictureDataUrl) : undefined,
          description:
            description !== undefined ? String(description).trim() || undefined : undefined,
          isPiecePackage: Boolean(isPiecePackage),
          packageKey: packageKey !== undefined ? String(packageKey) : '',
          packageComponents: Array.isArray(packageComponents) ? packageComponents : undefined,
          sourceItemId: sourceItemId !== undefined ? String(sourceItemId) : undefined,
          conversionType: conversionType !== undefined ? String(conversionType) : undefined,
        },
        req.user?.userId,
        req.user?.email
      );

      return res.status(201).json({
        message: 'Inventory item created',
        item,
      });
    } catch (error: any) {
      const msg = error.message || 'Failed to create item';
      if (msg.includes('not found')) {
        return res.status(404).json({ error: msg });
      }
      if (msg.includes('require') || msg.includes('positive')) {
        return res.status(400).json({ error: msg });
      }
      if (msg.includes('Unique constraint')) {
        return res.status(409).json({
          error: 'An item with this id or combination already exists',
        });
      }
      return res.status(500).json({ error: msg });
    }
  }
);

// ============================================================
// PATCH /api/inventory/:id (ADMIN, MANAGER only)
// ============================================================
router.patch(
  '/:id',
  requireInventoryUpdateAccess,
  async (req: Request, res: Response) => {
    try {
      const id = singleParam(req.params.id);
      const { meters, pieceLength, quantity, costPrice, code, subCode, colorId, qrCodeValue, qrCodeDataUrl, version } =
        req.body;

      if (!id) {
        return res.status(400).json({ error: 'Inventory item id is required' });
      }

      if (version === undefined || version === null) {
        return res.status(400).json({
          error: 'version field is required for updates (optimistic locking)',
        });
      }

      const item = await updateInventoryItem(
        id,
        {
          meters: meters !== undefined ? parseFloat(String(meters)) : undefined,
          pieceLength:
            pieceLength !== undefined ? parseFloat(String(pieceLength)) : undefined,
          quantity: quantity !== undefined ? parseInt(String(quantity), 10) : undefined,
          costPrice:
            costPrice !== undefined ? parseFloat(String(costPrice)) : undefined,
          code: code !== undefined ? parseInt(String(code), 10) : undefined,
          subCode: subCode !== undefined ? parseFloat(String(subCode)) : undefined,
          colorId: colorId !== undefined ? String(colorId) : undefined,
          qrCodeValue: qrCodeValue !== undefined ? String(qrCodeValue) : undefined,
          qrCodeDataUrl: qrCodeDataUrl !== undefined ? String(qrCodeDataUrl) : undefined,
          version: parseInt(String(version), 10),
        },
        req.user?.userId,
        req.user?.email
      );

      return res.status(200).json({
        message: 'Inventory item updated',
        item,
      });
    } catch (error: any) {
      const msg = error.message || 'Failed to update item';
      if (msg.includes('not found')) {
        return res.status(404).json({ error: msg });
      }
      if (msg.includes('modified by another user')) {
        return res.status(409).json({ error: msg });
      }
      if (msg.includes('archived')) {
        return res.status(400).json({ error: msg });
      }
      if (msg.includes('already exists') || msg.includes('must be')) {
        return res.status(400).json({ error: msg });
      }
      return res.status(500).json({ error: msg });
    }
  }
);

// ============================================================
// POST /api/inventory/:id/archive (ADMIN, MANAGER only)
// ============================================================
router.post(
  '/:id/archive',
  requireRole('ADMIN', 'MANAGER'),
  async (req: Request, res: Response) => {
    try {
      const id = singleParam(req.params.id);
      if (!id) {
        return res.status(400).json({ error: 'Inventory item id is required' });
      }
      const item = await archiveInventoryItem(id, req.user?.userId, req.user?.email);
      return res.status(200).json({
        message: 'Inventory item archived',
        item,
      });
    } catch (error: any) {
      const msg = error.message || 'Failed to archive item';
      if (msg.includes('not found')) {
        return res.status(404).json({ error: msg });
      }
      if (msg.includes('already archived')) {
        return res.status(400).json({ error: msg });
      }
      return res.status(500).json({ error: msg });
    }
  }
);

// ============================================================
// POST /api/inventory/:id/restore (ADMIN, MANAGER only)
// ============================================================
router.post(
  '/:id/restore',
  requireRole('ADMIN', 'MANAGER'),
  async (req: Request, res: Response) => {
    try {
      const id = singleParam(req.params.id);
      if (!id) {
        return res.status(400).json({ error: 'Inventory item id is required' });
      }
      const item = await restoreInventoryItem(id, req.user?.userId, req.user?.email);
      return res.status(200).json({
        message: 'Inventory item restored',
        item,
      });
    } catch (error: any) {
      const msg = error.message || 'Failed to restore item';
      if (msg.includes('not found')) {
        return res.status(404).json({ error: msg });
      }
      if (msg.includes('not archived')) {
        return res.status(400).json({ error: msg });
      }
      return res.status(500).json({ error: msg });
    }
  }
);

// ============================================================
// DELETE /api/inventory/:id (ADMIN only - permanent!)
// ============================================================
router.delete(
  '/:id',
  requireRole('ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const id = singleParam(req.params.id);
      if (!id) {
        return res.status(400).json({ error: 'Inventory item id is required' });
      }
      const result = await deleteInventoryItem(id, req.user?.userId, req.user?.email);
      return res.status(200).json({
        message: 'Inventory item permanently deleted',
        ...result,
      });
    } catch (error: any) {
      const msg = error.message || 'Failed to delete item';
      if (msg.includes('not found')) {
        return res.status(404).json({ error: msg });
      }
      return res.status(500).json({ error: msg });
    }
  }
);

export default router;

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const sales_1 = require("../lib/sales");
const authenticate_1 = require("../middleware/authenticate");
const router = (0, express_1.Router)();
// All sales routes require authentication
router.use(authenticate_1.authenticate);
// ============================================================
// POST /api/sales (create new sale)
// ============================================================
router.post('/', async (req, res) => {
    try {
        const { branchId, employeeId, customerId, customerName, customerPhone, items, discount, paymentMethod, notes, } = req.body;
        if (!branchId || !employeeId || !customerName || !customerPhone) {
            return res.status(400).json({
                error: 'Missing required fields: branchId, employeeId, customerName, customerPhone',
            });
        }
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                error: 'items must be a non-empty array',
            });
        }
        if (paymentMethod &&
            paymentMethod !== 'CASH' &&
            paymentMethod !== 'CARD' &&
            paymentMethod !== 'TRANSFER' &&
            paymentMethod !== 'CREDIT') {
            return res.status(400).json({
                error: 'paymentMethod must be CASH, CARD, TRANSFER, or CREDIT',
            });
        }
        const sale = await (0, sales_1.createSale)({
            branchId,
            employeeId,
            customerId,
            customerName,
            customerPhone,
            items,
            discount: discount !== undefined ? parseFloat(String(discount)) : 0,
            paymentMethod,
            notes,
        }, req.user?.userId, req.user?.email);
        return res.status(201).json({
            message: 'Sale created successfully',
            sale,
        });
    }
    catch (error) {
        const msg = error.message || 'Failed to create sale';
        if (msg.includes('not found')) {
            return res.status(404).json({ error: msg });
        }
        if (msg.includes('Not enough stock') ||
            msg.includes('Not enough pieces') ||
            msg.includes('archived') ||
            msg.includes('positive') ||
            msg.includes('negative') ||
            msg.includes('at least one item')) {
            return res.status(400).json({ error: msg });
        }
        return res.status(500).json({ error: msg });
    }
});
// ============================================================
// POST /api/sales/exchange
// ============================================================
router.post('/exchange', async (req, res) => {
    try {
        const { branchId, employeeId, customerName, customerPhone, returnedInventory, returnedPlain, replacementItems, paymentStatus, amountPaid, notes, } = req.body;
        if (!branchId || !employeeId || !customerName || !customerPhone) {
            return res.status(400).json({
                error: 'Missing required fields: branchId, employeeId, customerName, customerPhone',
            });
        }
        if (paymentStatus && paymentStatus !== 'FULL' && paymentStatus !== 'PARTIAL') {
            return res.status(400).json({
                error: 'paymentStatus must be FULL or PARTIAL',
            });
        }
        const result = await (0, sales_1.processExchange)({
            branchId,
            employeeId,
            customerName,
            customerPhone,
            returnedInventory: Array.isArray(returnedInventory) ? returnedInventory : [],
            returnedPlain: Array.isArray(returnedPlain) ? returnedPlain : [],
            replacementItems: Array.isArray(replacementItems) ? replacementItems : [],
            paymentStatus,
            amountPaid: amountPaid !== undefined ? parseFloat(String(amountPaid)) : undefined,
            notes,
        }, req.user?.userId, req.user?.email);
        return res.status(201).json({
            message: 'Exchange processed successfully',
            ...result,
        });
    }
    catch (error) {
        const msg = error.message || 'Failed to process exchange';
        if (msg.includes('not found')) {
            return res.status(404).json({ error: msg });
        }
        if (msg.includes('positive') ||
            msg.includes('negative') ||
            msg.includes('archived') ||
            msg.includes('Not enough') ||
            msg.includes('Partial exchange') ||
            msg.includes('must include')) {
            return res.status(400).json({ error: msg });
        }
        return res.status(500).json({ error: msg });
    }
});
// ============================================================
// GET /api/sales (list with filters)
// ============================================================
router.get('/', async (req, res) => {
    try {
        const branchId = req.query.branchId;
        const employeeId = req.query.employeeId;
        const customerPhone = req.query.customerPhone;
        const fromDateRaw = req.query.fromDate;
        const toDateRaw = req.query.toDate;
        const includeVoidedRaw = req.query.includeVoided;
        const pageRaw = req.query.page;
        const pageSizeRaw = req.query.pageSize;
        const fromDate = fromDateRaw ? new Date(fromDateRaw) : undefined;
        let toDate = toDateRaw ? new Date(toDateRaw) : undefined;
        if (toDate) {
            toDate.setHours(23, 59, 59, 999);
        }
        const includeVoided = includeVoidedRaw === 'true';
        const page = pageRaw ? parseInt(pageRaw, 10) : 1;
        const pageSize = pageSizeRaw ? parseInt(pageSizeRaw, 10) : 50;
        const result = await (0, sales_1.listSales)({
            branchId,
            employeeId,
            customerPhone,
            fromDate,
            toDate,
            includeVoided,
            page,
            pageSize,
        });
        return res.status(200).json(result);
    }
    catch (error) {
        return res.status(500).json({
            error: error.message || 'Failed to list sales',
        });
    }
});
// ============================================================
// GET /api/sales/stats/summary (MANAGER+ only)
// ============================================================
router.get('/stats/summary', (0, authenticate_1.requireRole)('ADMIN', 'MANAGER'), async (req, res) => {
    try {
        const branchId = req.query.branchId;
        const fromDateRaw = req.query.fromDate;
        const toDateRaw = req.query.toDate;
        const fromDate = fromDateRaw ? new Date(fromDateRaw) : undefined;
        const toDate = toDateRaw ? new Date(toDateRaw) : undefined;
        const stats = await (0, sales_1.getSalesStats)({ branchId, fromDate, toDate });
        return res.status(200).json(stats);
    }
    catch (error) {
        return res.status(500).json({
            error: error.message || 'Failed to get sales stats',
        });
    }
});
// ============================================================
// GET /api/sales/:id
// ============================================================
router.get('/:id', async (req, res) => {
    try {
        const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        if (!id) {
            return res.status(400).json({ error: 'Sale id is required' });
        }
        const sale = await (0, sales_1.getSale)(id);
        return res.status(200).json(sale);
    }
    catch (error) {
        const msg = error.message || 'Failed to get sale';
        if (msg.includes('not found')) {
            return res.status(404).json({ error: msg });
        }
        return res.status(500).json({ error: msg });
    }
});
// ============================================================
// POST /api/sales/:id/void (MANAGER+ only)
// ============================================================
router.post('/:id/void', (0, authenticate_1.requireRole)('ADMIN', 'MANAGER'), async (req, res) => {
    try {
        const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        const { reason } = req.body;
        if (!id) {
            return res.status(400).json({ error: 'Sale id is required' });
        }
        if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
            return res.status(400).json({
                error: 'reason is required',
            });
        }
        if (!req.user?.userId) {
            return res.status(401).json({ error: 'User identification missing' });
        }
        const voidedSale = await (0, sales_1.voidSale)(id, reason, req.user.userId, req.user.email);
        return res.status(200).json({
            message: 'Sale voided successfully. Inventory restocked.',
            sale: voidedSale,
        });
    }
    catch (error) {
        const msg = error.message || 'Failed to void sale';
        if (msg.includes('not found')) {
            return res.status(404).json({ error: msg });
        }
        if (msg.includes('already voided') || msg.includes('reason')) {
            return res.status(400).json({ error: msg });
        }
        return res.status(500).json({ error: msg });
    }
});
// ============================================================
// POST /api/sales/:id/refund (MANAGER+ only)
// ============================================================
router.post('/:id/refund', (0, authenticate_1.requireRole)('ADMIN', 'MANAGER'), async (req, res) => {
    try {
        const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        const { amount, method, reason } = req.body;
        if (!id) {
            return res.status(400).json({ error: 'Sale id is required' });
        }
        if (amount === undefined || amount === null) {
            return res.status(400).json({ error: 'amount is required' });
        }
        if (!method || (method !== 'CASH' && method !== 'CARD' && method !== 'STORE_CREDIT')) {
            return res.status(400).json({
                error: 'method must be CASH, CARD, or STORE_CREDIT',
            });
        }
        if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
            return res.status(400).json({ error: 'reason is required' });
        }
        if (!req.user?.userId) {
            return res.status(401).json({ error: 'User identification missing' });
        }
        const refund = await (0, sales_1.processRefund)(id, {
            amount: parseFloat(String(amount)),
            method,
            reason,
        }, req.user.userId, req.user.email);
        return res.status(201).json({
            message: 'Refund processed successfully',
            refund,
        });
    }
    catch (error) {
        const msg = error.message || 'Failed to process refund';
        if (msg.includes('not found')) {
            return res.status(404).json({ error: msg });
        }
        if (msg.includes('voided') ||
            msg.includes('exceeds') ||
            msg.includes('positive') ||
            msg.includes('reason')) {
            return res.status(400).json({ error: msg });
        }
        return res.status(500).json({ error: msg });
    }
});
exports.default = router;
//# sourceMappingURL=sales.routes.js.map
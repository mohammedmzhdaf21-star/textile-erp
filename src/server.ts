import 'dotenv/config';
import path from 'path';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import authRoutes from './routes/auth.routes';
import inventoryRoutes from './routes/inventory.routes';
import salesRoutes from './routes/sales.routes';
import employeesRoutes from './routes/employees.routes';
import commissionsRoutes from './routes/commissions.routes';
import notificationsRoutes from './routes/notifications.routes';
import { migrateLegacyCommissionBase, migrateLegacySettingsPrices } from './lib/currency';
import { backfillCommissionEntries, recalculatePendingCommissionEntries } from './lib/commissions';
import prisma from './lib/prisma';

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// ============================================================
// GLOBAL MIDDLEWARE
// ============================================================
app.use(helmet());

app.use(
  cors({
    origin: '*',
    credentials: true,
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use((req: Request, _res: Response, next: NextFunction) => {
  const time = new Date().toISOString();
  console.log(`[${time}] ${req.method} ${req.path}`);
  next();
});

// ============================================================
// HEALTH CHECK
// ============================================================
app.get('/health', async (_req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({
      status: 'ok',
      database: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      status: 'error',
      database: 'disconnected',
      timestamp: new Date().toISOString(),
    });
  }
});

// ============================================================
// ROOT (API info in development only)
// ============================================================
if (process.env.NODE_ENV !== 'production') {
  app.get('/', (_req: Request, res: Response) => {
    res.status(200).json({
      message: 'Textile ERP API is running!',
      version: '1.0.0',
      endpoints: {
        health: 'GET /health',
        auth: {
          login: 'POST /api/auth/login',
          refresh: 'POST /api/auth/refresh',
          logout: 'POST /api/auth/logout',
          me: 'GET /api/auth/me',
        },
        inventory: {
          list: 'GET /api/inventory',
          get: 'GET /api/inventory/:id',
          create: 'POST /api/inventory',
          update: 'PATCH /api/inventory/:id',
          archive: 'POST /api/inventory/:id/archive',
          restore: 'POST /api/inventory/:id/restore',
          delete: 'DELETE /api/inventory/:id',
          stats: 'GET /api/inventory/stats/summary',
        },
        sales: {
          create: 'POST /api/sales',
          list: 'GET /api/sales',
          get: 'GET /api/sales/:id',
          void: 'POST /api/sales/:id/void',
          refund: 'POST /api/sales/:id/refund',
          stats: 'GET /api/sales/stats/summary',
        },
      },
    });
  });
}

// ============================================================
// API ROUTES
// ============================================================
app.use('/api/auth', authRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/employees', employeesRoutes);
app.use('/api/commissions', commissionsRoutes);
app.use('/api/notifications', notificationsRoutes);

// ============================================================
// PRODUCTION FRONTEND (single-process 24/7 deployment)
// ============================================================
if (process.env.NODE_ENV === 'production') {
  const frontendDist = path.resolve(__dirname, '../frontend/dist');
  app.use(express.static(frontendDist, { index: false }));
  app.get('/', (_req: Request, res: Response) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) {
      return next();
    }
    res.sendFile(path.join(frontendDist, 'index.html'), (err) => {
      if (err) next(err);
    });
  });
}

// ============================================================
// 404 HANDLER
// ============================================================
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} does not exist`,
  });
});

// ============================================================
// GLOBAL ERROR HANDLER
// ============================================================
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Server Error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message:
      process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
  });
});

// ============================================================
// START SERVER
// ============================================================
const server = app.listen(PORT, async () => {
  try {
    const result = await migrateLegacySettingsPrices();
    if (result.updated > 0) {
      console.log(`Migrated ${result.updated} legacy minimum price setting(s) to full IQD.`);
    }

    const baseMigration = await migrateLegacyCommissionBase();
    if (baseMigration.updated) {
      console.log(
        `Migrated commission base amount from ${baseMigration.from} to ${baseMigration.to} IQD.`
      );
      const recalc = await recalculatePendingCommissionEntries();
      if (recalc.updated > 0 || recalc.removed > 0) {
        console.log(
          `Recalculated ${recalc.updated} pending commission(s) after base amount migration.`
        );
      }
    }

    const backfill = await backfillCommissionEntries();
    if (backfill.created > 0) {
      console.log(`Backfilled ${backfill.created} missing commission entry(ies).`);
    }
  } catch (error) {
    console.warn('Could not migrate legacy price settings:', error);
  }

  console.log('');
  console.log('============================================================');
  console.log('Textile ERP Server');
  console.log('============================================================');
  console.log(`Listening on:    http://localhost:${PORT}`);
  console.log(`Health check:    http://localhost:${PORT}/health`);
  console.log(`Auth endpoint:   http://localhost:${PORT}/api/auth/login`);
  console.log(`Inventory:       http://localhost:${PORT}/api/inventory`);
  console.log(`Sales:           http://localhost:${PORT}/api/sales`);
  console.log(`Environment:     ${process.env.NODE_ENV || 'development'}`);
  console.log('============================================================');
  console.log('');
});

// ============================================================
// GRACEFUL SHUTDOWN
// ============================================================
const shutdown = async (signal: string) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  server.close(async () => {
    await prisma.$disconnect();
    console.log('Server closed. Goodbye!');
    process.exit(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

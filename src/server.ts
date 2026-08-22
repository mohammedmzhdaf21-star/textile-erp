import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';

function validateRequiredEnv() {
  const missing: string[] = [];
  if (!process.env.DATABASE_URL) missing.push('DATABASE_URL');
  if (!process.env.JWT_ACCESS_SECRET) missing.push('JWT_ACCESS_SECRET');
  if (!process.env.JWT_REFRESH_SECRET) missing.push('JWT_REFRESH_SECRET');
  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
}

validateRequiredEnv();

import authRoutes from './routes/auth.routes';
import inventoryRoutes from './routes/inventory.routes';
import salesRoutes from './routes/sales.routes';
import employeesRoutes from './routes/employees.routes';
import commissionsRoutes from './routes/commissions.routes';
import notificationsRoutes from './routes/notifications.routes';
import signInRequestsRoutes from './routes/signInRequests.routes';
import plainClothRoutes from './routes/plainCloth.routes';
import auditLogRoutes from './routes/auditLog.routes';
import tasksRoutes from './routes/tasks.routes';
import trusteesRoutes from './routes/trustees.routes';
import { migrateLegacyCommissionBase, migrateLegacySettingsPrices } from './lib/currency';
import { backfillCommissionEntries, recalculatePendingCommissionEntries } from './lib/commissions';
import { recoverPlainClothNamesFromSales, ensureDefaultPlainClothTypes } from './lib/plainClothPricing';
import prisma from './lib/prisma';

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const corsOrigins = process.env.CORS_ORIGIN
  ?.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const frontendDist = path.resolve(__dirname, '../frontend/dist');
const serveFrontend = fs.existsSync(path.join(frontendDist, 'index.html'));

// ============================================================
// GLOBAL MIDDLEWARE
// ============================================================
app.use(helmet());

app.use(
  cors({
    origin: corsOrigins && corsOrigins.length > 0 ? corsOrigins : '*',
    credentials: Boolean(corsOrigins && corsOrigins.length > 0),
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
      features: {
        plainClothApi: true,
        deviceSignIn: true,
        employeeRegistration: true,
      },
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
// ROOT (API info in development when frontend is not built)
// ============================================================
if (!serveFrontend && process.env.NODE_ENV !== 'production') {
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
// VERSION (deploy verification)
// ============================================================
app.get('/api/version', (_req: Request, res: Response) => {
  res.status(200).json({
    app: 'textile-erp',
    plainClothApi: true,
    plainClothPaths: ['/api/plain-cloth', '/api/commissions/plain-cloth'],
    updatedAt: '2026-08-13',
  });
});

// ============================================================
// API ROUTES
// ============================================================
app.use('/api/auth', authRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/employees', employeesRoutes);
app.use('/api/commissions', commissionsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/sign-in-requests', signInRequestsRoutes);
app.use('/api/plain-cloth', plainClothRoutes);
app.use('/api/audit-logs', auditLogRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/trustees', trusteesRoutes);

// ============================================================
// FRONTEND SPA (serve built app for /login, /register, etc.)
// ============================================================
if (serveFrontend) {
  const sendSpaIndex = (res: Response) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile(path.join(frontendDist, 'index.html'), (err) => {
      if (err && !res.headersSent) {
        res.status(500).json({ error: 'Frontend unavailable' });
      }
    });
  };

  app.use(express.static(frontendDist, { index: false, maxAge: '7d' }));
  app.get('/', (_req: Request, res: Response) => {
    sendSpaIndex(res);
  });
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) {
      return next();
    }
    sendSpaIndex(res);
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
  const migrationSteps: Array<[string, () => Promise<unknown>]> = [
    ['legacy settings prices', migrateLegacySettingsPrices],
    ['legacy commission base', migrateLegacyCommissionBase],
    ['commission backfill', backfillCommissionEntries],
    ['plain cloth recovery', recoverPlainClothNamesFromSales],
    ['plain cloth defaults', ensureDefaultPlainClothTypes],
  ];

  for (const [name, step] of migrationSteps) {
    try {
      const result = await step();
      if (name === 'legacy settings prices' && result && typeof result === 'object' && 'updated' in result && Number((result as { updated: number }).updated) > 0) {
        console.log(`Migrated ${(result as { updated: number }).updated} legacy minimum price setting(s) to full IQD.`);
      }
      if (name === 'legacy commission base' && result && typeof result === 'object' && 'updated' in result && (result as { updated?: boolean }).updated) {
        const baseMigration = result as { from?: unknown; to?: unknown; updated?: boolean };
        console.log(`Migrated commission base amount from ${baseMigration.from} to ${baseMigration.to} IQD.`);
        const recalc = await recalculatePendingCommissionEntries();
        if (recalc.updated > 0 || recalc.removed > 0) {
          console.log(`Recalculated ${recalc.updated} pending commission(s) after base amount migration.`);
        }
      }
      if (name === 'commission backfill' && result && typeof result === 'object' && 'created' in result && Number((result as { created: number }).created) > 0) {
        console.log(`Backfilled ${(result as { created: number }).created} missing commission entry(ies).`);
      }
      if (name === 'plain cloth recovery' && result && typeof result === 'object' && 'recovered' in result && Number((result as { recovered: number }).recovered) > 0) {
        console.log(`Recovered ${(result as { recovered: number }).recovered} plain cloth type(s) from past sales.`);
      }
      if (name === 'plain cloth defaults' && result && typeof result === 'object' && 'ensured' in result && Number((result as { ensured: number }).ensured) > 0) {
        console.log(`Ensured ${(result as { ensured: number }).ensured} default plain cloth type(s).`);
      }
    } catch (error) {
      console.warn(`Startup migration step failed (${name}):`, error);
    }
  }

  console.log('');
  console.log('============================================================');
  console.log('Textile ERP Server');
  console.log('============================================================');
  console.log(`Listening on:    http://localhost:${PORT}`);
  console.log(`Health check:    http://localhost:${PORT}/health`);
  console.log(`Auth endpoint:   http://localhost:${PORT}/api/auth/login`);
  console.log(`Plain cloth:       http://localhost:${PORT}/api/plain-cloth`);
  console.log(`Inventory:       http://localhost:${PORT}/api/inventory`);
  console.log(`Sales:           http://localhost:${PORT}/api/sales`);
  if (serveFrontend) {
    console.log(`Frontend:        http://localhost:${PORT}/login`);
  } else {
    console.log('Frontend:        not built — run npm run build:frontend');
  }
  console.log(`Environment:     ${process.env.NODE_ENV || 'development'}`);
  console.log('============================================================');
  console.log('');
});

server.on('error', (err: NodeJS.ErrnoException) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

// ============================================================
// GRACEFUL SHUTDOWN
// ============================================================
const shutdown = (signal: string) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  const forceTimer = setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
  forceTimer.unref();

  server.close(async () => {
    try {
      await prisma.$disconnect();
    } catch (error) {
      console.warn('Error disconnecting prisma:', error);
    }
    console.log('Server closed. Goodbye!');
    process.exit(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  shutdown('UNCAUGHT_EXCEPTION');
});

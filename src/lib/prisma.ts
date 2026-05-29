import { PrismaClient } from '@prisma/client';

// ============================================================
// 🗄️ SHARED PRISMA CLIENT
// ============================================================
// This creates ONE database connection that the entire app uses.
// We attach it to globalThis in development to prevent creating
// new connections every time the code reloads (hot reload).
// ============================================================

declare global {
  var prismaGlobal: PrismaClient | undefined;
}

export const prisma =
  global.prismaGlobal ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  global.prismaGlobal = prisma;
}

export default prisma;

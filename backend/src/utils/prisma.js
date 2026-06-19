// Shared PrismaClient singleton.
// Import this everywhere instead of instantiating new PrismaClient() per file,
// to avoid exhausting DB connections during dev hot-reloads.

const { PrismaClient } = require('@prisma/client');

const globalForPrisma = global;

const prisma =
  globalForPrisma.__cenrowatch_prisma__ ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__cenrowatch_prisma__ = prisma;
}

module.exports = prisma;

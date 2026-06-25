// Shared PrismaClient singleton. Import this everywhere instead of instantiating
// new PrismaClient() per file. Node's module cache already makes this a single
// instance for the whole process, so no extra global caching is needed.

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'production' ? ['error'] : ['warn', 'error'],
});

module.exports = prisma;

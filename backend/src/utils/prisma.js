// Shared PrismaClient singleton. Import this everywhere instead of instantiating
// new PrismaClient() per file. Node's module cache already makes this a single
// instance for the whole process, so no extra global caching is needed.
//
// The client is wrapped in the field-encryption extension, so the four personal
// fields listed in utils/prismaEncryption.js are encrypted on the way into the
// database and decrypted on the way out. Services see plaintext and need no
// encryption code of their own; the database never holds these in the clear.
//
// One consequence worth knowing: this client can no longer show you what is
// physically stored. Anything that needs the raw bytes - the encrypt-pii
// backfill, which has to tell an already-encrypted row from a plaintext one -
// must open its own unextended PrismaClient and say why.

const { PrismaClient } = require('@prisma/client');
const { applyEncryption } = require('./prismaEncryption');

const prisma = applyEncryption(
  new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['warn', 'error'],
  })
);

module.exports = prisma;

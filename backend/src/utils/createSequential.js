// Creates a row with a per-year sequential tracking id (e.g. CMP-2026-00001),
// computed inside a transaction by counting existing rows for the year. Retries
// on the rare unique-constraint collision under concurrency.
//
// Shared by the complaint / wildlife / request services so the ID logic lives
// in exactly one place.

const prisma = require('./prisma');
const { formatTrackingId, PREFIX } = require('./trackingId');

/**
 * @param {Object}   opts
 * @param {string}   opts.model    prisma model accessor ('complaint' | 'wildlifeTurnover' | 'environmentalRequest')
 * @param {string}   opts.type     'complaint' | 'wildlife' | 'request'
 * @param {string}   opts.idField  unique id column ('tracking_id' | 'reference_id')
 * @param {number}   opts.year
 * @param {Object}   opts.data     row data (the id field is injected automatically)
 * @param {Object}   opts.select   prisma select for the returned row
 */
async function createSequential({ model, type, idField, year, data, select }) {
  const prefix = PREFIX[type];
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const count = await tx[model].count({
          where: { [idField]: { startsWith: `${prefix}-${year}-` } },
        });
        const trackingId = formatTrackingId(type, count + 1, new Date(year, 0, 1));
        return tx[model].create({ data: { ...data, [idField]: trackingId }, select });
      });
    } catch (e) {
      if (e.code === 'P2002' && attempt < 4) continue; // id race — retry
      throw e;
    }
  }
}

module.exports = { createSequential };

# CENROWATCH API — Express + Prisma + MySQL.
# Debian slim (not alpine) so Prisma's query engine finds OpenSSL without fuss.
FROM node:20-bookworm-slim

# Prisma's query engine needs OpenSSL at runtime.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# The schema is copied BEFORE the install, and the order is load-bearing:
# package.json has `"postinstall": "prisma generate"`, so npm runs generation as
# part of `npm install`. With prisma/ copied afterwards the install fails with
# "Could not find Prisma Schema" - which is exactly how this build broke on
# 2026-09-23. The cost is that editing schema.prisma invalidates the install
# layer; correctness is worth more than those seconds, and the schema changes
# far less often than src/ does.
#
# The install includes the prisma CLI (a devDependency), which the container
# needs for `migrate deploy`.
COPY package*.json ./
COPY prisma ./prisma
RUN npm install

# No separate `npx prisma generate` here: postinstall already ran it, for this
# platform (Linux), against the schema copied above.

# Application source (node_modules and .env are excluded via .dockerignore).
COPY . .

EXPOSE 5000

# Just serve. Nothing that touches data happens on boot.
#
# This used to be `npm run start:docker`, which runs `prisma migrate deploy &&
# node prisma/seed.js` first. That is right for a throwaway local stack and
# WRONG anywhere real: the seed upserts baseline rows on EVERY container start,
# so a deploy silently reverts admin-edited settings - the SLA budgets and the
# CENRO office coordinates - back to their seeded values. On a hosted platform a
# restart is not an event anyone watches, so nobody would connect the two.
#
# Migrations belong in the platform's pre-deploy step (DEPLOYMENT.md Part 4),
# which runs once per deploy rather than once per boot. Local Docker keeps the
# old behaviour by asking for it explicitly in docker-compose.yml.
CMD ["npm", "start"]

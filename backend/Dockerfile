# CENROWATCH API — Express + Prisma + MySQL.
# Debian slim (not alpine) so Prisma's query engine finds OpenSSL without fuss.
FROM node:20-bookworm-slim

# Prisma's query engine needs OpenSSL at runtime.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies first for better layer caching. Includes the prisma CLI
# (a devDependency) which the container needs for `migrate deploy` + `generate`.
COPY package*.json ./
RUN npm install

# Generate the Prisma client for THIS platform (Linux) before copying the rest.
COPY prisma ./prisma
RUN npx prisma generate

# Application source (node_modules and .env are excluded via .dockerignore).
COPY . .

EXPOSE 5000

# On boot: apply migrations, seed baseline data (idempotent upserts), then serve.
CMD ["npm", "run", "start:docker"]

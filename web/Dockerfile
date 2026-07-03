# CENROWATCH web (React + Vite). Runs the Vite dev server, reachable from the
# host browser via --host. The VITE_* config is a public client key (it ships in
# the browser bundle anyway), so web/.env is baked in for a self-contained image.
FROM node:20-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 5173

# --host 0.0.0.0 so the dev server is reachable outside the container.
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

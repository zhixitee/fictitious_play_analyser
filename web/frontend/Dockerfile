# Frontend Dockerfile
# Supports two targets:
#   1. "production" (default) — static SPA served by nginx (browser-only mode)
#   2. "with-server" — includes the Node.js local simulation server

# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS build

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build for production
RUN npm run build

# ── Stage 2a: Production (static SPA only) ───────────────────────────────────
FROM nginx:alpine AS production

# Copy built assets
COPY --from=build /app/dist /usr/share/nginx/html

# Copy nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

# ── Stage 2b: With local simulation server ────────────────────────────────────
FROM node:20-alpine AS with-server

WORKDIR /app

# Copy package files and install prod + dev deps (tsx needed at runtime)
COPY package.json package-lock.json* ./
RUN npm install

# Copy source (server + core modules it imports)
COPY server/ ./server/
COPY src/core/ ./src/core/
COPY src/types/ ./src/types/

EXPOSE 3001

CMD ["node", "--max-old-space-size=8192", "--import", "tsx", "./server/localServer.ts"]

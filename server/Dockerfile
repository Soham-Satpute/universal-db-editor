# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Build stage
#
# better-sqlite3 is a native addon — it needs python3/make/g++ to compile
# if no prebuilt binary matches this platform. We install those build
# tools here only, then copy the already-compiled node_modules into the
# slim final image below so the runtime image doesn't need a toolchain.
# ---------------------------------------------------------------------------
FROM node:20-alpine AS build

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---------------------------------------------------------------------------
# Production stage
# ---------------------------------------------------------------------------
FROM node:20-alpine AS production

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

# Persisted data: connections.json, query history, encrypted credential store
RUN mkdir -p /app/data /app/uploads

EXPOSE 3001

CMD ["node", "dist/index.js"]

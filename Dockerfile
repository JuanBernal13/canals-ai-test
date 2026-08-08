FROM node:22-bookworm-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS build
COPY package*.json prisma.config.ts tsconfig*.json ./
COPY prisma ./prisma
RUN npm ci
COPY src ./src
COPY scripts ./scripts
COPY test ./test
COPY vitest*.config.ts ./
RUN npm run build

FROM base AS runtime
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
USER node
CMD ["node", "dist/processes/api.js"]

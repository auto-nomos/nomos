# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=22.18.0
ARG PNPM_VERSION=11.0.8

############################
# Stage 1: install + build #
############################
FROM node:${NODE_VERSION}-alpine AS builder

ARG PNPM_VERSION
WORKDIR /repo

# Enable pnpm at the pinned version
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

# Copy workspace metadata first (cache-friendly)
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc tsconfig.base.json turbo.json biome.json ./

# Copy package manifests so pnpm can resolve workspace graph
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/crypto/package.json packages/crypto/
COPY packages/ucan/package.json packages/ucan/
COPY packages/cedar/package.json packages/cedar/
COPY packages/core/package.json packages/core/
COPY packages/schema-packs/package.json packages/schema-packs/
COPY apps/pdp/package.json apps/pdp/

# Install dependencies (workspace-scoped to PDP and its transitive deps)
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter=@auto-nomos/pdp...

# Copy source
COPY packages/shared-types packages/shared-types/
COPY packages/crypto packages/crypto/
COPY packages/ucan packages/ucan/
COPY packages/cedar packages/cedar/
COPY packages/core packages/core/
COPY packages/schema-packs packages/schema-packs/
COPY apps/pdp apps/pdp/

# Build PDP and its workspace dependencies
RUN pnpm --filter @auto-nomos/pdp... build

# Prune to production deps and create a minimal deploy artifact at /deploy
RUN pnpm --filter @auto-nomos/pdp deploy --prod --legacy /deploy

####################
# Stage 2: runtime #
####################
FROM node:${NODE_VERSION}-alpine AS runtime

WORKDIR /app

# Non-root user
RUN addgroup -S app && adduser -S app -G app

COPY --from=builder --chown=app:app /deploy /app

USER app

ENV NODE_ENV=production \
    PORT=8787 \
    AUDIT_LOG_PATH=/tmp/audit.log

EXPOSE 8787

CMD ["node", "dist/index.js"]

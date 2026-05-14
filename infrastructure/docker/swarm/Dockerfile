# Path B — single-image multi-role swarm orchestrator + agents.
# Builds the workspace once, then runs `tsx src/main.ts` against
# examples/swarm-orchestrator with NOMOS_ROLE switching the binary mode.

FROM node:22-alpine AS deps
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/sdk-typescript/package.json packages/sdk-typescript/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY packages/crypto/package.json packages/crypto/package.json
COPY packages/ucan/package.json packages/ucan/package.json
COPY examples/swarm-orchestrator/package.json examples/swarm-orchestrator/package.json
RUN pnpm install --frozen-lockfile --ignore-scripts \
    --filter @auto-nomos/swarm-orchestrator... \
    --filter @auto-nomos/sdk...

FROM deps AS runtime
COPY tsconfig.base.json ./tsconfig.base.json
COPY packages packages
COPY examples/swarm-orchestrator examples/swarm-orchestrator
WORKDIR /repo/examples/swarm-orchestrator
ENV NODE_ENV=production
# Skip pnpm's runtime workspace-deps check (it would try to re-install
# and fail because we deliberately did not copy apps/ into the image).
# tsx is invoked directly through the local node_modules bin.
EXPOSE 3100 3101 3102 3103
CMD ["sh", "-c", "/repo/node_modules/.bin/tsx src/main.ts"]

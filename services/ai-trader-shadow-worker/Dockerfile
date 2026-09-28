# Build context is the repository root.
FROM node:22-bookworm-slim AS build
WORKDIR /repo
COPY package.json package-lock.json ./
RUN npm ci
COPY src ./src
COPY services/ai-trader-shadow-worker ./services/ai-trader-shadow-worker
COPY tsconfig.json ./
ARG GIT_SHA=unknown
ENV AI_TRADER_SHADOW_WORKER_GIT_SHA=$GIT_SHA
RUN node services/ai-trader-shadow-worker/build.mjs

FROM node:22-bookworm-slim
WORKDIR /app
ARG GIT_SHA=unknown
ENV NODE_ENV=production
ENV AI_TRADER_SHADOW_WORKER_PROCESS=1
ENV AI_TRADER_SHADOW_WORKER_GIT_SHA=$GIT_SHA
COPY --from=build --chown=node:node /repo/services/ai-trader-shadow-worker/dist/worker.mjs /app/worker.mjs
EXPOSE 8080
USER node
CMD ["node", "worker.mjs"]

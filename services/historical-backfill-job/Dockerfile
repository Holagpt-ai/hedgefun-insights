FROM node:22-bookworm-slim
WORKDIR /repo
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.app.json vitest.config.ts ./
COPY src ./src
COPY services/historical-backfill-job ./services/historical-backfill-job
ENV NODE_ENV=production
CMD ["npx", "vite-node", "--config", "vitest.config.ts", "services/historical-backfill-job/src/main.ts"]

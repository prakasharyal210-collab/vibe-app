FROM node:20-alpine

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.26.1 --activate

COPY . .

RUN pnpm install --no-frozen-lockfile

RUN pnpm --filter @workspace/api-server run build

ENV NODE_ENV=production

EXPOSE 3000

CMD ["pnpm", "--filter", "@workspace/api-server", "run", "start"]

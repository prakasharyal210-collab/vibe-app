FROM node:20-alpine

WORKDIR /app

COPY artifacts/api-server/dist ./dist

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "--enable-source-maps", "./dist/index.mjs"]

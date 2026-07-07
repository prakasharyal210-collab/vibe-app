FROM node:20-alpine

RUN apk add --no-cache ffmpeg

WORKDIR /app

COPY artifacts/api-server/dist ./dist

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE $PORT

CMD ["node", "--enable-source-maps", "./dist/index.mjs"]

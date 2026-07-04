FROM node:20-alpine

RUN apk add --no-cache ffmpeg

WORKDIR /app

COPY dist ./dist

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "--enable-source-maps", "./dist/index.mjs"]

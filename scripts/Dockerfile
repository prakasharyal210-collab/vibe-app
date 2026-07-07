FROM node:20-alpine

WORKDIR /app

# Copy only what's needed — build context is scripts/ (Railway Root Dir)
COPY package.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src

ENV NODE_ENV=production

CMD ["./node_modules/.bin/tsx", "./src/seed-content.ts"]

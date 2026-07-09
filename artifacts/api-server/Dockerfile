# This Dockerfile does NOT build from source — it copies the dist/ folder
# committed in git. Always run 'pnpm run build' in artifacts/api-server
# before committing changes to src/.
#
# This is a known limitation (Root Directory scoping prevents building
# inside Docker from this context, since the api-server is part of a pnpm
# workspace and needs repo-root context to resolve workspace packages and
# the lockfile) — see 2026-07-09 discussion for details.
# TODO: revisit building from repo-root context once things are less
# time-critical. A pre-commit hook (see /.git/hooks/pre-commit) and the
# `check-build-fresh` package script guard against committing a stale dist/
# in the meantime.
FROM node:20-alpine

RUN apk add --no-cache ffmpeg

WORKDIR /app

COPY dist ./dist

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "--enable-source-maps", "./dist/index.mjs"]

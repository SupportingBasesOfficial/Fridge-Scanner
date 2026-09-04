# syntax=docker/dockerfile:1.7

FROM node:24.20.0-bookworm-slim AS build
WORKDIR /workspace

COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY packages/application/package.json ./packages/application/package.json
COPY packages/config/package.json ./packages/config/package.json
COPY packages/database/package.json ./packages/database/package.json

RUN npm ci --ignore-scripts

COPY apps ./apps
COPY packages ./packages

RUN npm run build \
  && npm prune --omit=dev

FROM node:24.20.0-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /workspace

COPY --from=build /workspace/package.json ./package.json
COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/apps/api/package.json ./apps/api/package.json
COPY --from=build /workspace/apps/api/dist ./apps/api/dist
COPY --from=build /workspace/packages/application/package.json ./packages/application/package.json
COPY --from=build /workspace/packages/application/dist ./packages/application/dist
COPY --from=build /workspace/packages/config/package.json ./packages/config/package.json
COPY --from=build /workspace/packages/config/dist ./packages/config/dist
COPY --from=build /workspace/packages/database/package.json ./packages/database/package.json
COPY --from=build /workspace/packages/database/dist ./packages/database/dist

USER node
EXPOSE 3000

CMD ["node", "apps/api/dist/main.js"]

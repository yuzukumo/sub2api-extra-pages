FROM node:24-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --prefer-offline

COPY index.html tsconfig.json tsconfig.app.json tsconfig.node.json tsconfig.server.json vite.config.ts ./
COPY src ./src
COPY server ./server
RUN npm run build && npm prune --omit=dev

FROM gcr.io/distroless/nodejs24-debian12:nonroot AS runtime

ENV NODE_ENV=production \
    TZ=Asia/Singapore \
    HOST=0.0.0.0 \
    STATIC_DIR=/app/dist

WORKDIR /app

COPY package.json ./
COPY --chown=65532:65532 --from=build /app/node_modules ./node_modules
COPY --chown=65532:65532 --from=build /app/dist ./dist
COPY --chown=65532:65532 --from=build /app/server-dist ./server-dist
COPY --chown=65532:65532 content ./content

USER 65532:65532
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["/nodejs/bin/node", "-e", "fetch('http://127.0.0.1:3000/api/navigation').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["server-dist/index.js"]

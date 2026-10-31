# The accounts service. Built from the root of the repository (the workspaces):
#   docker build -f apps/api/Dockerfile .

# --- Build: one bundled file ---------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
RUN npm ci --no-audit --no-fund --workspace @visual-tracert/api --include-workspace-root
COPY apps/api apps/api
RUN npm run build -w @visual-tracert/api

# --- Runtime: node only, as an unprivileged user; the database in /data --------
FROM node:22-alpine
LABEL org.opencontainers.image.title="visual-tracert-api" \
      org.opencontainers.image.description="Cuentas de visual-tracert: usuarios, sesiones e invitaciones (SQLite)"
WORKDIR /app
COPY --from=build /repo/apps/api/dist/main.js ./main.js
RUN mkdir /data && chown node:node /data
USER node
ENV PORT=8090 DATA_DIR=/data NODE_OPTIONS=--disable-warning=ExperimentalWarning
EXPOSE 8090
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1:8090/auth/health || exit 1
CMD ["node", "main.js"]

# The emulator. Built from the root of the repository (the workspaces):
#   docker build -f apps/emulator/Dockerfile .

# --- Build: one bundled file ---------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/emulator/package.json apps/emulator/
COPY packages/model/package.json packages/model/
RUN npm ci --no-audit --no-fund --workspace @visual-tracert/emulator --include-workspace-root
COPY packages/model packages/model
COPY apps/emulator apps/emulator
RUN npm run build -w @visual-tracert/emulator

# --- Runtime: node, and the tools that wire the devices (ip, bridge, nsenter) --
FROM node:22-alpine
RUN apk add --no-cache iproute2 util-linux
LABEL org.opencontainers.image.title="visual-tracert-emulator" \
      org.opencontainers.image.description="Emulación de visual-tracert: dispositivos en contenedores unidos por cables veth"
WORKDIR /app
COPY --from=build /repo/apps/emulator/dist/main.js ./main.js
ENV PORT=8080
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1:8080/api/health || exit 1
CMD ["node", "main.js"]

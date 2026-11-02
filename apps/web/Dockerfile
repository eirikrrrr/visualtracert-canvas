# The web app. Built from the root of the repository (the workspaces):
#   docker build -f apps/web/Dockerfile .

# --- Build: the Vite bundle ---------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY packages/model/package.json packages/model/
RUN npm ci --no-audit --no-fund --workspace @visual-tracert/web --include-workspace-root
COPY packages/model packages/model
COPY apps/web apps/web
RUN npm run build -w @visual-tracert/web

# --- Runtime: nginx serves the static files -----------------------------------
FROM nginx:alpine
LABEL org.opencontainers.image.title="visualtracert-canvas" \
      org.opencontainers.image.description="Laboratorio de redes en el navegador: editor de topologías y simulación de paquetes"
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1

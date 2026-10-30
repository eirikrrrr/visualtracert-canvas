# --- Build: the Vite bundle ---------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY index.html tsconfig.json vite.config.ts ./
COPY public ./public
COPY src ./src
RUN npm run build

# --- Runtime: nginx serves the static files -----------------------------------
FROM nginx:alpine
LABEL org.opencontainers.image.title="visor-tracert" \
      org.opencontainers.image.description="Laboratorio de redes en el navegador: editor de topologías y simulación de paquetes"
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1

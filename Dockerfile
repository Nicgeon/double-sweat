# syntax=docker/dockerfile:1

# Basis-Images lassen sich austauschen (eigene Registry, Mirror, anderes Patch-Release):
#   docker build --build-arg NODE_BUILD_IMAGE=registry.example.org/node:22-bookworm .
ARG NODE_BUILD_IMAGE=node:22-bookworm
ARG NODE_RUNTIME_IMAGE=node:22-bookworm-slim

# ---- Build: vollständiges Image mit Compiler (better-sqlite3 wird gebaut) ----------------------------------
FROM ${NODE_BUILD_IMAGE} AS build
WORKDIR /app
RUN corepack enable

# Zuerst nur die Manifeste: Der Abhängigkeits-Layer bleibt bei Codeänderungen im Cache.
# Optional (nur hinter einem TLS-inspizierenden Proxy): zusätzliche CA als Build-Secret übergeben
#   docker build --secret id=extra_ca,src=/pfad/zur/ca.pem .
# Sie landet weder im Image noch im Build-Cache.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
RUN --mount=type=secret,id=extra_ca,required=false \
    if [ -f /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    pnpm install --frozen-lockfile

COPY tsconfig.base.json ./
COPY apps/api apps/api
# deploy erzeugt ein eigenständiges Verzeichnis mit nur den Produktionsabhängigkeiten (kein Compiler, keine Tests)
RUN --mount=type=secret,id=extra_ca,required=false \
    if [ -f /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    pnpm --filter @double-sweat/api build \
 && pnpm --filter @double-sweat/api deploy --prod --legacy /out/api

# ---- Laufzeit: schlankes Image, nur Produktionsabhängigkeiten, kein Compiler -------------------------------
FROM ${NODE_RUNTIME_IMAGE} AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATA_DIR=/data

# Eigener Benutzer ohne Login-Shell; /data gehört ihm (für das benannte Volume)
RUN groupadd --gid 10001 sweat \
 && useradd --uid 10001 --gid 10001 --no-create-home --shell /usr/sbin/nologin sweat \
 && mkdir -p /data && chmod 0700 /data \
 && chown sweat:sweat /data \
 && printf '#!/bin/sh\nexec node /app/dist/cli.js "$@"\n' > /usr/local/bin/cli \
 && chmod 0755 /usr/local/bin/cli

WORKDIR /app
COPY --from=build /out/api/ ./

USER 10001:10001
VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/v1/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]

ENTRYPOINT ["node", "dist/server.js"]

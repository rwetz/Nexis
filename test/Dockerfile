# Test Dockerfile — Nexis editor playground
# Exercises: multi-stage builds, ARGs, ENV, COPY --from, HEALTHCHECK, labels,
#            heredoc syntax (BuildKit), non-root user, layer caching

# syntax=docker/dockerfile:1.7

# ── Build args ────────────────────────────────────────────────────────────────

ARG NODE_VERSION=20
ARG RUST_VERSION=1.78
ARG ALPINE_VERSION=3.19
ARG APP_NAME=nexis-backend
ARG APP_VERSION=1.3.0
ARG BUILD_DATE
ARG GIT_COMMIT

# ── Stage 1: Rust dependency cache ───────────────────────────────────────────

FROM rust:${RUST_VERSION}-slim AS rust-deps

WORKDIR /build

# Cache cargo registry and compiled deps separately from app code
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    cargo install cargo-chef --locked

COPY src-tauri/Cargo.toml src-tauri/Cargo.lock ./

# Generate recipe for reproducible caching
RUN cargo chef prepare --recipe-path recipe.json

# ── Stage 2: Build Rust binary ────────────────────────────────────────────────

FROM rust:${RUST_VERSION}-slim AS rust-builder

ARG APP_NAME
ARG APP_VERSION

WORKDIR /build

RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Restore cached deps
COPY --from=rust-deps /usr/local/cargo/bin/cargo-chef /usr/local/cargo/bin/
COPY --from=rust-deps /build/recipe.json .

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    cargo chef cook --release --recipe-path recipe.json

# Build the real binary
COPY src-tauri/src ./src
COPY src-tauri/Cargo.toml src-tauri/Cargo.lock ./

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    cargo build --release --locked \
    && strip target/release/${APP_NAME}

# ── Stage 3: Frontend build ───────────────────────────────────────────────────

FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS frontend-builder

ARG APP_VERSION

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Cache node_modules using BuildKit mount
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

COPY . .

ENV VITE_APP_VERSION=${APP_VERSION}
ENV NODE_ENV=production

RUN pnpm run build

# ── Stage 4: Runtime ──────────────────────────────────────────────────────────

FROM alpine:${ALPINE_VERSION} AS runtime

ARG APP_NAME
ARG APP_VERSION
ARG BUILD_DATE
ARG GIT_COMMIT

# OCI image labels
LABEL org.opencontainers.image.title="${APP_NAME}" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.revision="${GIT_COMMIT}" \
      org.opencontainers.image.source="https://github.com/rwetz00/nexis" \
      org.opencontainers.image.licenses="MIT" \
      maintainer="Ryan Wetzstein <rwetz00@gmail.com>"

# Security: non-root user
RUN addgroup -g 1001 -S nexis && \
    adduser  -u 1001 -S nexis -G nexis

RUN apk add --no-cache \
    ca-certificates \
    tzdata \
    libgcc

WORKDIR /app

# Copy compiled assets from build stages
COPY --from=rust-builder --chown=nexis:nexis /build/target/release/${APP_NAME} ./server
COPY --from=frontend-builder --chown=nexis:nexis /app/dist ./public

# Runtime config directory
RUN mkdir -p /data && chown nexis:nexis /data

USER nexis

ENV APP_PORT=8080 \
    APP_ENV=production \
    DATA_DIR=/data \
    LOG_LEVEL=info \
    TZ=UTC

EXPOSE 8080

VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD wget -qO- "http://localhost:${APP_PORT}/health" || exit 1

ENTRYPOINT ["./server"]
CMD ["--port", "8080", "--data", "/data"]

# ── Stage 5: Development override ────────────────────────────────────────────

FROM runtime AS development

USER root

RUN apk add --no-cache \
    curl \
    jq \
    bash \
    git \
    strace

USER nexis

ENV APP_ENV=development \
    LOG_LEVEL=debug

CMD ["--port", "8080", "--data", "/data", "--dev"]

# ── Stage 6: Test runner ──────────────────────────────────────────────────────

FROM rust:${RUST_VERSION}-slim AS test-runner

WORKDIR /build

COPY src-tauri/ .

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    cargo test --all-features 2>&1 | tee /test-results.xml

# ── BuildKit heredoc (inline file generation) ────────────────────────────────

FROM alpine:${ALPINE_VERSION} AS config-gen

RUN <<EOF
cat > /etc/nexis/config.toml <<CONFIG
[server]
port = 8080
host = "0.0.0.0"

[logging]
level = "info"
format = "json"

[db]
pool_min = 2
pool_max = 20
CONFIG
echo "Config written"
EOF

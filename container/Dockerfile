# Mercury — single deployment image
# Contains the full Mercury process: ingress adapters + agent (pi subprocess)
FROM mcr.microsoft.com/devcontainers/base:ubuntu

# Dev tools and language runtimes
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    python3 python3-pip python3-venv \
    bubblewrap \
    fonts-wqy-zenhei fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*

# Node.js
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

# Bun
RUN curl -fsSL https://bun.sh/install | bash
ENV BUN_INSTALL="/root/.bun"
ENV PATH="$BUN_INSTALL/bin:$PATH"

# Go
RUN curl -fsSL https://go.dev/dl/go1.24.1.linux-$(dpkg --print-architecture).tar.gz | tar -C /usr/local -xzf -
ENV PATH="/usr/local/go/bin:$PATH"

# pi CLI
RUN bun add -g @mariozechner/pi-coding-agent


# Playwright Chromium
RUN npx playwright install --with-deps chromium
ENV PUPPETEER_SKIP_DOWNLOAD=true
RUN ln -sf $(find /root/.cache/ms-playwright -name chrome -type f | head -1) /usr/local/bin/chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/local/bin/chromium
RUN echo '{"args":["--no-sandbox"]}' > /root/.puppeteerrc.json
ENV CHROMIUM_FLAGS="--no-sandbox"

# Lightpanda Browser
RUN apt-get update && apt-get install -y --no-install-recommends \
    jq \
    && rm -rf /var/lib/apt/lists/*
ENV LIGHTPANDA_DIR="/usr/local/bin"
RUN OS="Linux" && \
    ARCH="$(dpkg --print-architecture)" && \
    case "$ARCH" in \
      amd64) DOWNLOAD_URL="https://github.com/lightpanda-io/browser/releases/download/nightly/lightpanda-x86_64-linux" ;; \
      arm64) DOWNLOAD_URL="https://github.com/lightpanda-io/browser/releases/download/nightly/lightpanda-aarch64-linux" ;; \
      *) echo "ERROR: Unsupported architecture: $ARCH" && exit 1 ;; \
    esac && \
    ASSET_NAME="${DOWNLOAD_URL##*/}" && \
    EXPECTED_DIGEST=$(curl -sL "https://api.github.com/repos/lightpanda-io/browser/releases/tags/nightly" | jq -r --arg name "$ASSET_NAME" '.assets[] | select(.name == $name) | .digest') && \
    EXPECTED_SHA256="${EXPECTED_DIGEST#sha256:}" && \
    echo "Installing Lightpanda for $ARCH (SHA256: $EXPECTED_SHA256)" && \
    curl -sL -o "$LIGHTPANDA_DIR/lightpanda" "$DOWNLOAD_URL" && \
    ACTUAL_SHA256=$(sha256sum "$LIGHTPANDA_DIR/lightpanda" | awk '{print $1}') && \
    if [ "$ACTUAL_SHA256" != "$EXPECTED_SHA256" ]; then \
      echo "ERROR: Checksum verification FAILED!" && \
      rm -f "$LIGHTPANDA_DIR/lightpanda" && \
      exit 1; \
    fi && \
    chmod +x "$LIGHTPANDA_DIR/lightpanda" && \
    echo "Lightpanda installed successfully"
ENV LIGHTPANDA_BIN="/usr/local/bin/lightpanda"

# Mercury
ARG MERCURY_VERSION=latest
ARG MERCURY_INSTALL="bun add -g mercury-ai@${MERCURY_VERSION}"
RUN ${MERCURY_INSTALL}
ENV MERCURY_PKG_DIR="/root/.bun/install/global/node_modules/mercury-ai"

# mrctl helper
RUN echo '#!/bin/sh\nbun run $MERCURY_PKG_DIR/src/cli/mrctl.ts "$@"' > /usr/local/bin/mrctl && \
    chmod +x /usr/local/bin/mrctl

# Pi agent dir → persisted project root (symlink resolves at runtime when volume is mounted)
RUN mkdir -p /root/.pi && ln -s /data/pi-agent /root/.pi/agent

# 把 models.json 复制到镜像中（如果存在）
COPY models.json /root/.pi/agent/models.json

# Project root is mounted at /data (persisted across deploys)
VOLUME /data
WORKDIR /data

ENTRYPOINT ["sh", "-c", "exec bun run $MERCURY_PKG_DIR/src/main.ts"]

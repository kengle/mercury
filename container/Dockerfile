# Mercury — single deployment image
# Contains the full Mercury process: ingress adapters + agent (pi subprocess)
FROM mcr.microsoft.com/devcontainers/base:dev-ubuntu24.04

# ─── Configure China Mirrors ─────────────────────────────────────────────
# Configure apt to use Aliyun mirror (Ubuntu 24.04 uses deb822 format)
RUN sed -i 's|http://archive.ubuntu.com|http://mirrors.aliyun.com|g' /etc/apt/sources.list.d/ubuntu.sources && \
    sed -i 's|http://security.ubuntu.com|http://mirrors.aliyun.com|g' /etc/apt/sources.list.d/ubuntu.sources

# Configure pip to use Aliyun mirror
RUN mkdir -p /etc/pip && \
    echo '[global]' > /etc/pip/pip.conf && \
    echo 'index-url=http://mirrors.cloud.aliyuncs.com/pypi/simple/' >> /etc/pip/pip.conf && \
    echo '[install]' >> /etc/pip/pip.conf && \
    echo 'trusted-host=mirrors.cloud.aliyuncs.com' >> /etc/pip/pip.conf && \
    cp /etc/pip/pip.conf /etc/pip.conf

# ─── Dev Tools and Language Runtimes ─────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    python3 python3-pip python3-venv \
    bubblewrap \
    fonts-wqy-zenhei fonts-noto-cjk \
    fd-find \
    ripgrep \
    jq \
    && ln -s $(which fdfind) /usr/local/bin/fd \
    && rm -rf /var/lib/apt/lists/*

# ─── Node.js (using npmmirror) ───────────────────────────────────────────
RUN curl -fsSL https://npmmirror.com/mirrors/node/v24.14.1/node-v24.14.1-linux-$(dpkg --print-architecture).tar.gz | tar -C /usr/local -xzf - && \
    ln -sf /usr/local/node-v24.14.1-linux-$(dpkg --print-architecture)/bin/node /usr/local/bin/node && \
    ln -sf /usr/local/node-v24.14.1-linux-$(dpkg --print-architecture)/bin/npm /usr/local/bin/npm && \
    ln -sf /usr/local/node-v24.14.1-linux-$(dpkg --print-architecture)/bin/npx /usr/local/bin/npx
ENV PATH="/usr/local/node-v24.14.1-linux-$(dpkg --print-architecture)/bin:$PATH"

# ─── Bun (using npmmirror) ───────────────────────────────────────────────
RUN npm install -g bun --registry=https://registry.npmmirror.com
ENV BUN_INSTALL="/root/.bun"
ENV PATH="$BUN_INSTALL/bin:$PATH"

# ─── Go (using Aliyun mirror) ────────────────────────────────────────────
RUN curl -fsSL https://mirrors.aliyun.com/golang/go1.24.1.linux-$(dpkg --print-architecture).tar.gz | tar -C /usr/local -xzf -
ENV PATH="/usr/local/go/bin:$PATH"

# ─── pi CLI ──────────────────────────────────────────────────────────────
RUN bun add -g @mariozechner/pi-coding-agent --registry=https://registry.npmmirror.com && \
    ln -sf /root/.bun/install/global/node_modules/@mariozechner/pi-coding-agent/dist/cli.js /usr/local/bin/pi && \
    chmod +x /usr/local/bin/pi

# ─── Playwright Chromium ─────────────────────────────────────────────────
RUN npx playwright install --with-deps chromium --registry=https://registry.npmmirror.com
ENV PUPPETEER_SKIP_DOWNLOAD=true
RUN ln -sf $(find /root/.cache/ms-playwright -name chrome -type f | head -1) /usr/local/bin/chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/local/bin/chromium
RUN echo '{"args":["--no-sandbox"]}' > /root/.puppeteerrc.json
ENV CHROMIUM_FLAGS="--no-sandbox"

# ─── Lightpanda Browser ──────────────────────────────────────────────────
ENV LIGHTPANDA_DIR="/root/.local/bin"
RUN mkdir -p "$LIGHTPANDA_DIR" && \
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
ENV PATH="$LIGHTPANDA_DIR:$PATH"
ENV LIGHTPANDA_BIN="$LIGHTPANDA_DIR/lightpanda"

# ─── Mercury ─────────────────────────────────────────────────────────────
ARG MERCURY_VERSION=latest
ARG MERCURY_INSTALL="bun add -g mercury-ai@${MERCURY_VERSION} --registry=https://registry.npmmirror.com"
RUN ${MERCURY_INSTALL}
ENV MERCURY_PKG_DIR="/root/.bun/install/global/node_modules/mercury-ai"

# mrctl helper
RUN echo '#!/bin/sh\nbun run $MERCURY_PKG_DIR/src/cli/mrctl.ts "$@"' > /usr/local/bin/mrctl && \
    chmod +x /usr/local/bin/mrctl

# Pi agent dir → persisted project root (symlink resolves at runtime when volume is mounted)
RUN mkdir -p /root/.pi && ln -s /data/pi-agent /root/.pi/agent

# Copy models.json to image (if exists in build context)
RUN if [ -f /mercury-source/models.json ]; then cp /mercury-source/models.json /root/.pi/agent/models.json; fi

# Project root is mounted at /data (persisted across deploys)
VOLUME /data
WORKDIR /data

ENTRYPOINT ["sh", "-c", "exec bun run $MERCURY_PKG_DIR/src/main.ts"]

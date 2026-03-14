# Mercury Agent Container
FROM mcr.microsoft.com/devcontainers/base:ubuntu

# Install dev tools and language runtimes
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Core tools (already in base: git, curl, wget, jq, vim, zsh, ssh, gpg)
    build-essential \
    # Python
    python3 python3-pip python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js (required for pi shebangs)
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

# Install Bun
RUN curl -fsSL https://bun.sh/install | bash
ENV BUN_INSTALL="/root/.bun"
ENV PATH="$BUN_INSTALL/bin:$PATH"

# Install Go
RUN curl -fsSL https://go.dev/dl/go1.24.1.linux-$(dpkg --print-architecture).tar.gz | tar -C /usr/local -xzf -
ENV PATH="/usr/local/go/bin:$PATH"

# Install Playwright + Chromium (used by multiple extensions: web-browser, diagrams, charts)
RUN npx playwright install --with-deps chromium

# Point puppeteer to Playwright's Chromium so npm packages skip downloading their own
ENV PUPPETEER_SKIP_DOWNLOAD=true
RUN ln -sf $(find /root/.cache/ms-playwright -name chrome -type f | head -1) /usr/local/bin/chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/local/bin/chromium

# Allow Chromium to run as root in Docker
RUN echo '{"args":["--no-sandbox"]}' > /root/.puppeteerrc.json
ENV CHROMIUM_FLAGS="--no-sandbox"

# Install CLIs
RUN bun add -g @mariozechner/pi-coding-agent

WORKDIR /app

COPY src/agent/container-entry.ts /app/src/agent/container-entry.ts
COPY src/cli/mrctl.ts /app/src/cli/mrctl.ts
COPY src/extensions/reserved.ts /app/src/extensions/reserved.ts
COPY src/extensions/permission-guard.ts /app/src/extensions/permission-guard.ts
COPY src/types.ts /app/src/types.ts

RUN echo '#!/bin/sh\nbun run /app/src/cli/mrctl.ts "$@"' > /usr/local/bin/mrctl && \
    chmod +x /usr/local/bin/mrctl

ENTRYPOINT ["bun", "run", "/app/src/agent/container-entry.ts"]

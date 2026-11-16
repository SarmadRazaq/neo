# Use the official uv base image with Python 3.11
FROM ghcr.io/astral-sh/uv:python3.11-bookworm-slim

# Set working directory
WORKDIR /app

# Install system dependencies required for browser automation and LiveKit
# - ca-certificates: SSL/TLS certificate management
# - chromium and related packages: For browser automation
# - fonts: For proper text rendering in browser
# - pulseaudio: Audio support if needed
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y \
    ca-certificates \
    chromium \
    chromium-driver \
    fonts-liberation \
    portaudio19-dev \
    libasound2-dev \
    libportaudio2 \
    libportaudiocpp0 \
    pulseaudio \
    ffmpeg \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libwayland-client0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    curl \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Set environment variables for Chromium
ENV CHROME_BIN=/usr/bin/chromium \
    CHROMIUM_FLAGS="--no-sandbox --disable-dev-shm-usage --disable-gpu"

# Copy dependency files first for better layer caching
COPY pyproject.toml uv.lock ./

# Copy the source code (required because setuptools needs src/ directory during install)
COPY src/ ./src/

# Install Python dependencies using uv with locked versions
# --frozen ensures we use exact versions from uv.lock
# --no-cache prevents caching to reduce image size
RUN uv sync --frozen --no-cache --no-dev

# Install Doppler CLI
RUN curl -Ls https://cli.doppler.com/install.sh | sh

# Create a non-root user for security
RUN useradd -m -u 1000 agentuser && \
    chown -R agentuser:agentuser /app

# Switch to non-root user
USER agentuser

# Expose port if needed (LiveKit agents typically connect outbound)
# EXPOSE 8080

# Health check (optional - adjust based on your agent's capabilities)
# HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
#   CMD python -c "import sys; sys.exit(0)"

# Set the entrypoint to run the LiveKit agent
# Note: Doppler environment variables will be injected at runtime
# Use "start" mode for production (not "console" which is interactive)
ENTRYPOINT ["doppler", "run", "--"]
CMD ["uv", "run", "python", "src/neo_agent.py", "start"]

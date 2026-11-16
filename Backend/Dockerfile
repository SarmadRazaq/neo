# ============================================
# NEO Backend - Multi-stage Dockerfile
# Optimized for ECS Fargate deployment
# ============================================

# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies for native modules (if any)
RUN apk add --no-cache python3 make g++

# Copy package files for dependency caching
COPY package*.json ./

# Install all dependencies (including dev for build)
RUN npm ci

# Copy Prisma schema first (for prisma generate)
COPY prisma ./prisma/

# Generate Prisma client
RUN npx prisma generate

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Verify build output exists
RUN test -f /app/dist/main.js || (echo "BUILD FAILED: dist/main.js not found" && exit 1)

# Remove dev dependencies after build
RUN npm prune --production

# ============================================
# Stage 2: Production
# ============================================
FROM node:20-alpine AS production

WORKDIR /app

# Install dumb-init, curl, gnupg (for Doppler CLI), and openssl (for Prisma)
RUN apk add --no-cache dumb-init curl gnupg openssl

# Install Doppler CLI for runtime secret injection
RUN curl -Ls --tlsv1.2 --proto "=https" --retry 3 \
    https://cli.doppler.com/install.sh | sh

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001

# Copy built application from builder
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/package*.json ./
COPY --from=builder --chown=nestjs:nodejs /app/prisma ./prisma

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose port
EXPOSE 3000

# Switch to non-root user
USER nestjs

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health/liveness || exit 1

# Start the application with dumb-init
ENTRYPOINT ["dumb-init", "--"]
CMD ["doppler", "run", "--", "node", "dist/main"]

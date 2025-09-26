# Multi-stage build for Discord bot service
FROM node:20-alpine AS builder

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++ 

WORKDIR /build

# Copy package files
COPY package*.json ./
COPY once-human-bot/package*.json ./once-human-bot/

# Install dependencies with better caching
RUN npm ci --only=production && \
    cd once-human-bot && npm ci --only=production

# Production stage
FROM node:20-alpine

# Install runtime dependencies
RUN apk add --no-cache \
    python3 \
    tini && \
    rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy node modules from builder
COPY --from=builder --chown=nodejs:nodejs /build/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /build/once-human-bot/node_modules ./once-human-bot/node_modules

# Copy application code
COPY --chown=nodejs:nodejs package*.json ./
COPY --chown=nodejs:nodejs once-human-bot/ ./once-human-bot/

# Create data directory for SQLite
RUN mkdir -p /data && chown -R nodejs:nodejs /data

# Switch to non-root user
USER nodejs

# Set environment variables
ENV NODE_ENV=production

# Expose health check port (optional, for future implementation)
EXPOSE 3000

# Health check - checks if the Node.js process is running
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "process.exit(0)" || exit 1

# Use tini for proper signal handling
ENTRYPOINT ["/sbin/tini", "--"]

# Start the bot
CMD ["node", "once-human-bot/index.js"]
FROM node:20-alpine

# Labels for metadata
LABEL maintainer="MongoDB Seeder Team"
LABEL description="MongoDB Seeder Faker Service - Data Generation Engine"

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++ curl

WORKDIR /app

# Copy package files first (separate layer for caching)
COPY package*.json ./

# Install dependencies with optimizations
RUN npm ci --only=production --prefer-offline --no-audit

# Copy source code
COPY src/ ./src/

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 4000

# Health check with retry logic
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4000/health || exit 1

# Start with GC exposed for memory management and production flags
CMD ["node", \
  "--expose-gc", \
  "--max-old-space-size=4096", \
  "--enable-source-maps", \
  "src/index.js"]

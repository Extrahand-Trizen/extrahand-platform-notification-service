
# Use Node.js 18 LTS Alpine image for smaller size
FROM node:18-alpine AS base

# Install security updates and necessary packages
RUN apk update && apk upgrade && \
    apk add --no-cache dumb-init curl && \
    rm -rf /var/cache/apk/*

# Create app directory
WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodeuser -u 1001

# Dependencies stage
FROM base AS dependencies

# Copy package files
COPY package.json package-lock.json* ./

# Install production dependencies only
RUN if [ -f package-lock.json ]; then \
      npm ci --omit=dev && npm cache clean --force; \
    else \
      npm install --omit=dev && npm cache clean --force; \
    fi

# Build stage
FROM base AS build

# Accept build cache buster argument
ARG CACHE_BUST=1

# Copy package files
COPY package.json package-lock.json* ./

# Install all dependencies, including dev dependencies for TypeScript
RUN if [ -f package-lock.json ]; then \
      npm ci; \
    else \
      npm install; \
    fi

# Copy TypeScript configuration
COPY tsconfig.json ./

# Cache buster to force fresh code copy
RUN echo "Cache bust: ${CACHE_BUST}" > /tmp/cache-bust.txt

# Copy source code
COPY src ./src

# Build TypeScript to JavaScript
RUN npm run build

# Remove development dependencies after build
RUN npm prune --production

# Production stage
FROM base AS production

# Set default environment variables
# Sensitive variables must be supplied at runtime via CapRover
ENV NODE_ENV=production
ENV PORT=4005
ENV LOG_LEVEL=info
ENV RATE_LIMIT_WINDOW_MS=900000
ENV RATE_LIMIT_MAX_REQUESTS=1000

# Runtime environment variables expected through CapRover:
# - CORS_ORIGIN
# - MONGODB_URI
# - MONGODB_DB
# - FIREBASE_PROJECT_ID
# - FIREBASE_CLIENT_EMAIL
# - FIREBASE_PRIVATE_KEY
# - FIREBASE_SERVICE_ACCOUNT_PATH
# - FIREBASE_MOBILE_PROJECT_ID
# - FIREBASE_MOBILE_CLIENT_EMAIL
# - FIREBASE_MOBILE_PRIVATE_KEY
# - FIREBASE_MOBILE_SERVICE_ACCOUNT_PATH
# - SERVICE_AUTH_TOKEN

# Copy production dependencies
COPY --from=dependencies --chown=nodeuser:nodejs \
    /app/node_modules ./node_modules

# Copy compiled application
COPY --from=build --chown=nodeuser:nodejs \
    /app/dist ./dist

COPY --from=build --chown=nodeuser:nodejs \
    /app/package.json ./package.json

# Create runtime directories with write permissions
# Fixes EACCES when notifications.js creates /app/uploads
RUN mkdir -p /app/logs /app/uploads && \
    chown -R 1001:1001 /app/logs /app/uploads && \
    chmod 755 /app/logs /app/uploads

# Remove unnecessary files from the production image
RUN rm -rf \
    .git \
    .gitignore \
    .env.example \
    *.md \
    .dockerignore \
    Dockerfile \
    tsconfig.json \
    src \
    node_modules/typescript \
    node_modules/@types

# Run the application as a non-root user
USER nodeuser

# Expose application port
EXPOSE 4005

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:4005/api/v1/health || exit 1

# Use dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/server.js"]

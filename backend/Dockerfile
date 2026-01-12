# Backend Dockerfile
FROM node:22-alpine

WORKDIR /app

# Install dependencies for native modules and OpenSSL for Prisma
RUN apk add --no-cache python3 make g++ netcat-openbsd openssl openssl-dev

# Copy package files
COPY backend/package*.json ./
COPY backend/prisma ./prisma/

# Install dependencies
RUN npm install

# Generate Prisma client
RUN npx prisma generate

# Copy source code
COPY backend/ .

# Build TypeScript
RUN npm run build

# Copy and set permissions for entrypoint script
COPY backend/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Create non-root user for improved security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Create auth_cache directory with proper permissions
RUN mkdir -p /app/auth_cache && chown -R appuser:appgroup /app/auth_cache

# Change ownership of app directory
RUN chown -R appuser:appgroup /app

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 3001

# Use entrypoint script to handle DB migrations
ENTRYPOINT ["/docker-entrypoint.sh"]

# Start the server
CMD ["npm", "run", "start"]

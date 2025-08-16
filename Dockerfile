# Use Node.js LTS Alpine for smaller image size
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application files
COPY cli.js ./
COPY LICENSE ./
COPY README.md ./
COPY lib/ ./lib/
COPY commands/ ./commands/
COPY static/ ./static/

# Create a non-root user
RUN addgroup -g 1001 -S lowkey && \
    adduser -S lowkey -u 1001 -G lowkey

# Change ownership of the app directory
RUN chown -R lowkey:lowkey /app

# Switch to non-root user
USER lowkey

# Set the entrypoint to the CLI
ENTRYPOINT ["node", "/app/cli.js"]

# Default command shows help
CMD ["--help"]
FROM oven/bun:1.3-alpine

WORKDIR /app

# Install opencode globally
RUN bun install -g opencode-ai@latest

# Install runtime deps for the custom tools (pg, @opencode-ai/plugin, etc.)
COPY package.json package-lock.json* ./
RUN bun install --production --no-save --no-frozen-lockfile --ignore-scripts

# Copy the tools and opencode config
COPY .opencode ./.opencode
COPY opencode.json ./opencode.json

# Railway provides PORT; opencode serve defaults to 4096 if unset
ENV PORT=4096
EXPOSE 4096

# Bind to 0.0.0.0 so Railway can route to it
CMD ["sh", "-c", "opencode serve --hostname 0.0.0.0 --port ${PORT:-4096}"]

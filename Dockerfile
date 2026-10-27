FROM node:24-slim

WORKDIR /app

# Install build dependencies if needed
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    git \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Configure git to use https instead of ssh for public dependencies
RUN git config --global url."https://github.com/".insteadOf "git@github.com:" && \
    git config --global url."https://github.com/".insteadOf "ssh://git@github.com/"

COPY package*.json ./
RUN npm install --omit=dev --ignore-scripts

COPY . .

# Create data directory for SQLite WAL database
RUN mkdir -p /app/data

EXPOSE 3001

ENV NODE_ENV=production
ENV PORT=3001
ENV DATABASE_PATH=/app/data/nerolabs.db

CMD ["npm", "start"]

FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./

RUN npm install --no-audit --no-fund 2>&1 | tail -20

COPY . .

RUN npm run build 2>&1 | tail -20

# Production stage
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install --production --no-audit --no-fund && npm cache clean --force

COPY --from=builder /app/dist ./dist

EXPOSE 5000

HEALTHCHECK --interval=10s --timeout=5s --retries=5 \
  CMD wget --quiet --tries=1 --spider http://localhost:5000/health || exit 1

CMD ["node", "dist/server.js"]

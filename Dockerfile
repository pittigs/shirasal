# STAGE 1: Frontend Client bauen
FROM node:22-alpine AS client-builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
RUN npm run build

# STAGE 2: Node.js Backend Server aufbauen & Frontend einbetten
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

# Installiere sqlite3-Kompilierungstools im Container (falls noetig, alpine-sdk)
RUN apk add --no-cache python3 make g++ 

COPY server/package*.json ./server/
WORKDIR /app/server
RUN npm install --only=production

# Kopiere Server-Quellcode
COPY server/ ./

# Kopiere die gebauten Frontend-Dateien in den Container
COPY --from=client-builder /app/client/dist ../client/dist

EXPOSE 3001
CMD ["node", "index.js"]

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
COPY sql ./sql
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY --from=build /app/dist ./dist
COPY sql ./sql
USER node
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=3s --retries=5 CMD wget -qO- http://localhost:4000/api/health || exit 1
CMD ["node", "dist/server.js"]

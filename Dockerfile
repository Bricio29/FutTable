FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --include=dev

COPY index.html vite.config.js ./
COPY public/ ./public/
COPY src/ ./src/
COPY server/ ./server/
RUN npm test && npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3001

COPY --from=build /app/package.json ./
COPY --from=build /app/dist/ ./dist/
COPY --from=build /app/server/index.js /app/server/league.js ./server/

USER node
EXPOSE 3001
CMD ["node", "server/index.js"]

FROM node:22-bookworm-slim

WORKDIR /app

# fontmin / native deps may need build tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

RUN mkdir -p data/uploads data/fontmin data/logs data/felog

ENV NODE_ENV=production
ENV API_PORT=3001
EXPOSE 3001

CMD ["node", "src/server.js"]

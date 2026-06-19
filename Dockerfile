FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

RUN npm install -g pm2

EXPOSE 3000

# Runs the server, event listener, and worker as three PM2 processes.
CMD ["pm2-runtime", "ecosystem.config.cjs"]

FROM node:24-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && mkdir -p /data && chown node:node /data
ENV NODE_ENV=production
ENV PORT=3001
ENV DATABASE_PATH=/data/accounts.sqlite
USER node
EXPOSE 3001
CMD ["npm", "run", "server"]

FROM node:20-alpine
WORKDIR /app
COPY panel/package*.json ./
RUN npm install --omit=dev
COPY panel/ .
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server/index.js"]

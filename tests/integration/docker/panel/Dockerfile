FROM node:20-alpine
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY panel/package*.json ./
RUN npm install --omit=dev --ignore-scripts=false
COPY panel/ .
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server/index.js"]

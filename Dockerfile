FROM node:lts-alpine

WORKDIR /var/task

COPY package.json package-lock.json dist ./
RUN npm ci --production

CMD node /var/task/main.js

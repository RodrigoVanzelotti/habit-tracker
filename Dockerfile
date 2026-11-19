FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY index.html styles.css app.js calendar.js server.js store.js ./
EXPOSE 8080
CMD ["npm", "start"]

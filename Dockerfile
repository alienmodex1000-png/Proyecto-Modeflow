FROM node:20-alpine

# Instalar dependencias necesarias
WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

# Puerto por defecto (Railway lo sobreescribe automáticamente con $PORT)
EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production

CMD ["npm", "start"]

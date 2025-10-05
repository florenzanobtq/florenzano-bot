# Usa uma imagem mais completa (suporte a Chrome + Baileys)
FROM node:20-bullseye

# Define diretório de trabalho
WORKDIR /app

# Copia dependências e instala
COPY package*.json ./
RUN npm install

# Copia o resto do código
COPY . .

# Instala dependências do sistema (Baileys e Puppeteer precisam)
RUN apt-get update && apt-get install -y \
    chromium \
    libnss3 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libgbm-dev \
    libasound2 \
    fonts-liberation \
    xdg-utils \
    wget \
    curl \
 && rm -rf /var/lib/apt/lists/*

# Define variável para o Chromium (importante!)
ENV CHROME_PATH=/usr/bin/chromium

# Comando para iniciar o bot
CMD ["node", "bot-baileys.js"]

# Usa uma imagem base leve do Node.js
FROM node:18-slim

# Instala as dependências de sistema operacional necessárias para o Puppeteer (Chromium)
# Esta é uma lista testada de bibliotecas que o Puppeteer exige.
RUN apt-get update && \
    apt-get install -y \
        ca-certificates \
        fonts-liberation \
        libappindicator3-1 \
        libasound2 \
        libatk-bridge2.0-0 \
        libatk1.0-0 \
        libatspi2.0-0 \
        libcairo2 \
        libcups2 \
        libdbus-1-3 \
        libdrm2 \
        libexpat1 \
        libfontconfig1 \
        libgbm1 \
        libgdk-pixbuf2.0-0 \
        libglib2.0-0 \
        libgtk-3-0 \
        libnspr4 \
        libnss3 \
        libpango-1.0-0 \
        libpangocairo-1.0-0 \
        libx11-6 \
        libxcomposite1 \
        libxdamage1 \
        libxext6 \
        libxfixes3 \
        libxkbcommon0 \
        libxrandr2 \
        libxshmfence6 \
        libxss1 \
        libxtst6 \
        wget \
        xz-utils \
        --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# Configura o ambiente
WORKDIR /app

# Copia e instala as dependências do Node.js
COPY package.json package-lock.json ./
RUN npm install

# Copia o resto do código do bot
COPY . .

# Comando para iniciar o bot
CMD [ "node", "bot.js" ]
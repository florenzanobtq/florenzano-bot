# Troque a imagem base para uma mais compatível com as dependências do Puppeteer
FROM node:18-bullseye-slim

# Variável de ambiente para evitar que o Puppeteer baixe o Chromium de novo (opcional, mas bom)
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

# Instala o Google Chrome (navegador) e as dependências de sistema necessárias
RUN apt-get update && apt-get install -y wget gnupg apt-transport-https \
    # Instala o navegador Chrome/Chromium e as dependências principais
    && wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] https://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google-chrome.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable \
# <=== NOVA LINHA AQUI! ===>
    && apt-get install -y libnss3 libatk-bridge2.0-0 libgtk-3-0 libgbm-dev \
    # Limpa o cache
    && rm -rf /var/lib/apt/lists/*

# Configuração do ambiente
WORKDIR /app

# Copia e instala as dependências do Node.js
COPY package.json package-lock.json ./
RUN npm install

# Copia o resto do código do bot
COPY . .

# Comando para iniciar o bot
CMD [ "node", "bot.js" ]
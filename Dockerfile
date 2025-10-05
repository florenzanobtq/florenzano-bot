# Imagem base leve e estável
FROM node:20-alpine

# Cria diretório de trabalho
WORKDIR /app

# Copia arquivos de configuração e instala dependências
COPY package*.json ./
RUN npm install

# Copia o restante do código
COPY . .

# Expõe a porta (opcional — Railway detecta automaticamente)
EXPOSE 3000

# Comando para iniciar o bot
CMD ["npm", "start"]

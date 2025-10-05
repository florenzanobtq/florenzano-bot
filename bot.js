// ============ IMPORTAÇÕES ============
const express = require('express');
const qrcode = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');

// ============ SERVIDOR KEEP-ALIVE ============
const app = express();
app.get('/', (req, res) => res.send('🤖 Florenzano Bot está online!'));
app.listen(3000, () => console.log('🌐 Servidor ativo na porta 3000'));

// ============ CONFIGURAÇÃO DO CLIENTE ============
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    executablePath: '/usr/bin/google-chrome-stable',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-zygote',
      '--single-process'
    ]
  }
});

// ============ FUNÇÕES AUXILIARES ============
const delay = ms => new Promise(res => setTimeout(res, ms));

async function enviarMensagemDigitando(chat, texto, tempo = 2000) {
  await chat.sendStateTyping();
  await delay(tempo);
  await chat.sendMessage(texto);
}

async function enviarMenu(chat, nome) {
  const primeiroNome = nome?.split(" ")[0] || "cliente";
  await enviarMensagemDigitando(chat, `👋 Olá, ${primeiroNome}! Sou a assistente virtual da *Florenzano Boutique*.\n\nComo posso te ajudar hoje? Escolha uma das opções abaixo:\n\n1️⃣ - Ver catálogo da loja\n2️⃣ - Falar com vendedor(a)\n\nOu digite *0* para voltar a este menu a qualquer momento.`);
}

// ============ EVENTOS PRINCIPAIS ============
client.on('qr', qr => {
  console.log('📱 QR Code gerado! Copie o texto abaixo e gere a imagem em https://qrcode.monster');
  console.log(qr);
});

client.on('ready', () => {
  console.log('✅ Tudo certo! WhatsApp conectado e rodando.');
});

client.initialize();

// ============ LÓGICA DO BOT ============
client.on('message', async msg => {
  try {
    if (!msg.from.endsWith('@c.us')) return;

    const chat = await msg.getChat();
    const contact = await msg.getContact();
    const nome = contact.pushname || "Cliente";

    if (msg.body.match(/^(menu|oi|olá|ola|bom dia|boa tarde|boa noite|0)$/i)) {
      await enviarMenu(chat, nome);
      return;
    }

    if (msg.body === '1') {
      await enviarMensagemDigitando(chat, '📖 Certo! Aqui está o link do nosso catálogo virtual:');
      await delay(2000);
      await enviarMensagemDigitando(chat, '🛍️ https://loja.stoqui.com.br/florenzano-boutique');
      await delay(2000);
      await enviarMensagemDigitando(chat, 'Digite *0* se quiser voltar ao menu.');
      return;
    }

    if (msg.body === '2') {
      await enviarMensagemDigitando(chat, '👩‍💼 Claro! Você pode enviar sua dúvida aqui e uma de nossas vendedoras entrará em contato em breve 😊');
      await delay(2000);
      await enviarMensagemDigitando(chat, '🏃‍♀️ Aguarde um instante enquanto chamo alguém da equipe.');
      await delay(2000);
      await enviarMensagemDigitando(chat, 'Digite *0* se quiser voltar ao menu.');
      return;
    }

    await enviarMensagemDigitando(chat, '🤔 Desculpe, não entendi sua mensagem.');
    await enviarMensagemDigitando(chat, 'Digite *0* para voltar ao menu principal.');

  } catch (err) {
    console.error('Erro ao processar mensagem:', err);
  }
});

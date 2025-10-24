// ==============================
// 📦 Importações
// ==============================
const {
  default: makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const qrcode = require("qrcode");
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const express = require("express");
const app = express();
const PORT = process.env.PORT || 3000;

// ==============================
// 🗄️ Configuração do PostgreSQL
// ==============================
const client = new Client({
  user: process.env.PGUSER,
  host: process.env.PGHOST,
  database: process.env.PGDATABASE,
  password: process.env.PGPASSWORD,
  port: process.env.PGPORT,
  // Esta configuração é crucial para o Render
  ssl: { rejectUnauthorized: false }, 
});

// Nome da tabela corrigido para 'auth', conforme seu DB
const AUTH_TABLE_NAME = "auth";

async function connectDatabase() {
  try {
    await client.connect();
    console.log("✅ PostgreSQL conectado com sucesso!");
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${AUTH_TABLE_NAME} (
        id SERIAL PRIMARY KEY,
        filename TEXT UNIQUE NOT NULL,
        content BYTEA
      );
    `);
    console.log(`✅ Tabela '${AUTH_TABLE_NAME}' verificada/criada.`);
  } catch (err) {
    console.error("❌ Erro ao conectar ao PostgreSQL:", err);
    process.exit(1);
  }
}

// ==============================
// 💾 Funções auxiliares p/ salvar e restaurar arquivos de auth
// ==============================
const AUTH_DIR = "./auth_info";

async function saveAuthFilesToDB() {
  const files = fs.readdirSync(AUTH_DIR);
  for (const file of files) {
    const data = fs.readFileSync(path.join(AUTH_DIR, file));
    await client.query(
      `INSERT INTO ${AUTH_TABLE_NAME} (filename, content)
        VALUES ($1, $2)
        ON CONFLICT (filename)
        DO UPDATE SET content = EXCLUDED.content`,
      [file, data]
    );
  }
}

async function restoreAuthFilesFromDB() {
  // Cria o diretório vazio se não existir
  if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR);

  const res = await client.query(`SELECT filename, content FROM ${AUTH_TABLE_NAME}`);
  for (const row of res.rows) {
    fs.writeFileSync(path.join(AUTH_DIR, row.filename), row.content);
  }
}

// ==============================
// 🚀 Inicialização do bot
// ==============================
let reconnecting = false;
let qrCodeData = null; // Variável para armazenar o QR Code para o Express

async function startBot() {
  try {
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`📲 Usando versão do WhatsApp: v${version.join(".")} (última? ${isLatest})`);

    // 🛑 LIMPEZA AGRESSIVA: Remove dados corrompidos locais
    if (fs.existsSync(AUTH_DIR)) {
      console.log("🧹 Limpando diretório local de auth para evitar dados corrompidos...");
      // O Baileys lê a pasta local, então precisamos que ela esteja limpa
      fs.rmSync(AUTH_DIR, { recursive: true, force: true });
    }
    // Cria o diretório vazio (necessário para useMultiFileAuthState)
    fs.mkdirSync(AUTH_DIR);
    
    // Tenta restaurar a sessão do DB (que agora está limpa)
    await restoreAuthFilesFromDB(); 
    
    // Inicia o Baileys com o estado (limpo ou restaurado)
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

    const sock = makeWASocket({
      auth: state,
      version,
      printQRInTerminal: false,
    });

    // ==============================
    // 📡 Evento de conexão
    // ==============================
    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        // Gera o QR Code e salva para ser exibido pelo Express
        const qrBase64 = await qrcode.toDataURL(qr);
        qrCodeData = `data:image/png;base64,${qrBase64}`; 
        console.log("📱 QR Code gerado. Acesse a URL do seu Render para escanear!");
      }

      if (connection === "close") {
        qrCodeData = null; 
        const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
        console.log("⚠️ Conexão encerrada. Motivo:", reason);

        if (!reconnecting) {
          reconnecting = true;
          console.log("🔁 Tentando reconectar em 5 segundos...");
          setTimeout(() => {
            reconnecting = false;
            startBot();
          }, 5000);
        }
      }

      if (connection === "open") {
        qrCodeData = null; 
        console.log("✅ Bot conectado ao WhatsApp com sucesso!");
      }
    });

    // ==============================
    // 💬 Evento de mensagens
    // ==============================
    sock.ev.on("messages.upsert", async ({ messages }) => {
      const msg = messages[0];
      if (!msg.message || msg.key.fromMe) return;

      const sender = msg.key.remoteJid;
      const texto = (
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        ""
      ).trim().toLowerCase();

      console.log(`📨 Mensagem recebida de ${sender}: ${texto}`);

      if (["oi", "olá", "ola", "menu", "0"].includes(texto)) {
        await sock.sendMessage(sender, {
          text: `👋 Olá! Aqui está o menu:\n\n1️⃣ - Ver catálogo\n2️⃣ - Falar com vendedor\n\nDigite o número da opção.`,
        });
      } else if (texto === "1") {
        await sock.sendMessage(sender, {
          text: `🛍️ Nosso catálogo: https://loja.stoqui.com.br/florenzano-boutique\nDigite *0* para voltar ao menu.`,
        });
      } else if (texto === "2") {
        await sock.sendMessage(sender, {
          text: `👩‍💼 Um vendedor entrará em contato com você em breve.\nDigite *0* para voltar ao menu.`,
        });
      } else {
        await sock.sendMessage(sender, {
          text: `🤖 Não entendi. Digite *0* para ver o menu novamente.`,
        });
      }
    });

    // ==============================
    // 💾 Atualiza credenciais
    // ==============================
    sock.ev.on("creds.update", async () => {
      await saveCreds();
      await saveAuthFilesToDB();
    });

  } catch (err) {
    console.error("❌ Erro ao iniciar o bot:", err);
    console.log("⏳ Tentando reiniciar em 10 segundos...");
    setTimeout(startBot, 10000);
  }
}

// ==============================
// ▶️ Execução e Servidor Web (Render)
// ==============================
(async () => {
  console.log("🚀 Iniciando bot...");
  
  // Conecta ao DB e inicia o bot
  await connectDatabase();
  startBot(); 

  // 🌐 Rota para exibir o QR Code
  app.get("/", (req, res) => {
    if (qrCodeData) {
      // Se o QR Code existir, exibe a página de escaneamento
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>QR Code Baileys</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: sans-serif; text-align: center; padding-top: 50px; }
            img { max-width: 90%; height: auto; border: 1px solid #ccc; padding: 10px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
          </style>
        </head>
        <body>
          <h1>Escaneie este QR Code (Ele expira rápido!)</h1>
          <img src="${qrCodeData}" alt="QR Code para WhatsApp">
          <p>Mantenha esta página aberta. Se o QR sumir, verifique os logs.</p>
        </body>
        </html>
      `);
    } else {
      // Se ainda não tiver QR Code, ou já estiver conectado
      res.send(`
        <h1>Bot Baileys Conectado/Iniciando</h1>
        <p>Aguardando QR Code ou já conectado. Verifique os logs do Render para o status de conexão.</p>
      `);
    }
  });

  // Inicia o servidor Express na porta do Render
  app.listen(PORT, () => {
    console.log(`🌍 Servidor web iniciado na porta ${PORT}. Acesse a URL do Render para escanear.`);
  });
})();

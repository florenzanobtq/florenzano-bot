// ==============================
// 📦 Importações
// ==============================
const {
  default: makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion,
  initAuthCreds,
} = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const qrcode = require("qrcode");
const { Client } = require("pg");

// ==============================
// 🗄️ Configuração do PostgreSQL (Railway injeta automaticamente)
// ==============================
const client = new Client({
  user: process.env.PGUSER,
  host: process.env.PGHOST,
  database: process.env.PGDATABASE,
  password: process.env.PGPASSWORD,
  port: process.env.PGPORT,
  ssl: { rejectUnauthorized: false },
});

// Conecta uma única vez
async function connectDatabase() {
  try {
    await client.connect();
    console.log("✅ PostgreSQL conectado com sucesso!");
    await client.query(`
      CREATE TABLE IF NOT EXISTS auth (
        id SERIAL PRIMARY KEY,
        key TEXT UNIQUE NOT NULL,
        value TEXT
      );
    `);
    console.log("✅ Tabela 'auth' verificada/criada.");
  } catch (err) {
    console.error("❌ Erro ao conectar ao PostgreSQL:", err);
    process.exit(1);
  }
}

// ==============================
// 🔐 Funções de autenticação no banco
// ==============================
const AUTH_KEY = "creds";

async function readAuthState() {
  try {
    const result = await client.query("SELECT value FROM auth WHERE key = $1", [AUTH_KEY]);
    if (result.rows.length === 0) {
      return { creds: null, keys: {} };
    }
    return {
      creds: JSON.parse(result.rows[0].value),
      keys: {},
    };
  } catch (err) {
    console.error("⚠️ Erro ao ler autenticação:", err);
    return { creds: null, keys: {} };
  }
}

async function saveAuthState(authState) {
  if (!authState?.creds) return;
  try {
    const value = JSON.stringify(authState.creds);
    await client.query(
      `INSERT INTO auth (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [AUTH_KEY, value]
    );
  } catch (err) {
    console.error("⚠️ Erro ao salvar autenticação:", err);
  }
}

// ==============================
// 🚀 Inicialização do bot
// ==============================
let reconnecting = false;

async function startBot() {
  try {
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`📲 Usando versão do WhatsApp: v${version.join(".")} (última? ${isLatest})`);

    const { creds, keys } = await readAuthState();
    const authState = creds ? { creds, keys } : { creds: initAuthCreds(), keys: {} };

    const sock = makeWASocket({
      auth: authState,
      version,
      printQRInTerminal: false,
    });

    // ==============================
    // 📡 Evento de conexão
    // ==============================
    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        const qrBase64 = await qrcode.toDataURL(qr);
        console.log("📱 Escaneie este QR Code no seu WhatsApp:");
        console.log(qrBase64);
      }

      if (connection === "close") {
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
    // 💾 Atualiza credenciais quando mudarem
    // ==============================
    sock.ev.on("creds.update", async () => {
      if (sock.authState?.creds) {
        await saveAuthState(sock.authState);
      }
    });

  } catch (err) {
    console.error("❌ Erro ao iniciar o bot:", err);
    console.log("⏳ Tentando reiniciar em 10 segundos...");
    setTimeout(startBot, 10000);
  }
}

// ==============================
// ▶️ Execução
// ==============================
(async () => {
  console.log("🚀 Iniciando bot...");
  await connectDatabase();
  await startBot();
})();

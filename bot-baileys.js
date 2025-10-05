// ==============================
// 📦 Importações
// ==============================
const {
  default: makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const qrcode = require("qrcode-terminal");
const { Client } = require("pg");

// ==============================
// 🗄️ Configuração do PostgreSQL (Railway injeta as variáveis automaticamente)
// ==============================
const client = new Client({
  user: process.env.PGUSER,
  host: process.env.PGHOST,
  database: process.env.PGDATABASE,
  password: process.env.PGPASSWORD,
  port: process.env.PGPORT,
  ssl: { rejectUnauthorized: false },
});

// ==============================
// 🔐 Estrutura de chaves de autenticação
// ==============================
const authKeys = { creds: "creds" };

// Função para ler autenticação do PostgreSQL
const readAuthState = async () => {
  const result = await client.query("SELECT value FROM auth WHERE key = $1", [authKeys.creds]);
  if (result.rows.length === 0) {
    return { creds: null, keys: {} };
  }
  return {
    creds: JSON.parse(result.rows[0].value),
    keys: {},
  };
};

// Função para salvar autenticação no PostgreSQL
const saveAuthState = async (authState) => {
  const value = JSON.stringify(authState.creds);
  await client.query(
    `INSERT INTO auth (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [authKeys.creds, value]
  );
};

// ==============================
// 🚀 Função principal do bot
// ==============================
async function startBot() {
  try {
    // Conectar ao banco (somente uma vez)
    if (!client._connected) {
      await client.connect();
      console.log("✅ Conectado ao PostgreSQL com sucesso!");

      await client.query(`
        CREATE TABLE IF NOT EXISTS auth (
          id SERIAL PRIMARY KEY,
          key TEXT UNIQUE NOT NULL,
          value TEXT
        );
      `);
      console.log("✅ Tabela 'auth' verificada/criada.");
    }

    // Lê autenticação do banco
    const { creds, keys } = await readAuthState();

    // Pega a versão mais recente do Baileys
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`📲 Usando versão do WhatsApp: v${version.join(".")} (última? ${isLatest})`);

    // Cria o socket do Baileys
    const sock = makeWASocket({
      auth: { creds, keys },
      version,
    });

    // ==============================
    // 📡 Evento de conexão
    // ==============================
    sock.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log("📱 Escaneie este QR Code para conectar:");
        qrcode.generate(qr, { small: true });
      }

      if (connection === "close") {
        const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
        console.log("⚠️ Conexão fechada. Motivo:", reason);

        console.log("🔁 Tentando reconectar em 5 segundos...");
        setTimeout(() => startBot(), 5000);
      }

      if (connection === "open") {
        console.log("✅ Bot conectado com sucesso!");
      }
    });

    // ==============================
    // 💬 Evento de nova mensagem
    // ==============================
    sock.ev.on("messages.upsert", async ({ messages }) => {
      const msg = messages[0];
      if (!msg.message || msg.key.fromMe) return;

      const sender = msg.key.remoteJid;
      const texto = (
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        ""
      )
        .trim()
        .toLowerCase();

      console.log(`📨 Mensagem recebida de ${sender}: ${texto}`);

      if (["oi", "olá", "menu", "0"].includes(texto)) {
        await sock.sendMessage(sender, {
          text: `👋 Olá! Aqui está o menu:\n\n1️⃣ - Ver catálogo\n2️⃣ - Falar com vendedor\n\nDigite o número da opção.`,
        });
      } else if (texto === "1") {
        await sock.sendMessage(sender, {
          text: `🛍️ Nosso catálogo: https://loja.stoqui.com.br/florenzano-boutique\nDigite *0* para voltar ao menu.`,
        });
      } else if (texto === "2") {
        await sock.sendMessage(sender, {
          text: `👩‍💼 Ok! Um vendedor entrará em contato com você em breve.\nDigite *0* para voltar ao menu.`,
        });
      } else {
        await sock.sendMessage(sender, {
          text: `🤖 Não entendi. Digite *0* para ver o menu novamente.`,
        });
      }
    });

    // ==============================
    // 💾 Atualiza credenciais quando mudar
    // ==============================
    sock.ev.on("creds.update", () => saveAuthState(sock.authState));
  } catch (err) {
    console.error("❌ Erro ao iniciar o bot:", err);
  }
}

// Inicializa o bot
startBot();


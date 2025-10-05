const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const fs = require("fs");
const path = require("path");
const qrcode = require("qrcode-terminal"); // ✅ movido pra cima

const authFolder = "auth_info_baileys";

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(authFolder);
  const { version, isLatest } = await fetchLatestBaileysVersion();

  console.log(`Usando versão do WhatsApp: v${version.join(".")} (última? ${isLatest})`);

  const sock = makeWASocket({
    version,
    auth: state,
  });

  // 📡 Evento de conexão
  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("📱 Escaneie este QR Code para conectar:");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "close") {
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
      if (reason === DisconnectReason.loggedOut) {
        console.log("⚠️ Sessão expirada. Apagando dados salvos...");
        fs.rmSync(path.join(__dirname, authFolder), { recursive: true, force: true });
        console.log("🧹 Sessão antiga removida. Reinicie o bot para escanear o QR novamente.");
      } else {
        console.log("🔁 Tentando reconectar em 5 segundos...");
        setTimeout(() => startBot(), 5000);
      }
    }

    if (connection === "open") {
      console.log("✅ Bot conectado com sucesso!");
    }
  });

  // 💬 Evento de nova mensagem
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

  sock.ev.on("creds.update", saveCreds);
}

startBot();

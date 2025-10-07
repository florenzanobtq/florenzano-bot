// ============ IMPORTAÇÕES ============
const express = require('express');
const { 
    default: makeWASocket, 
    DisconnectReason,
    fetchLatestBaileysVersion,
    initAuthCreds,
} = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const qrcode = require("qrcode");
// Importação correta do cliente PG
const { Client } = require("pg");

// ==============================
// 🗄️ Configuração do PostgreSQL para o Render
// ==============================
// CRÍTICO: Tentamos usar DATABASE_URL primeiro, que é a forma mais robusta no Render.
const connectionConfig = process.env.DATABASE_URL 
    ? { 
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false } // SSL necessário para conexões no Render
    }
    : {
        // Fallback para variáveis separadas, caso DATABASE_URL não exista
        user: process.env.PGUSER,
        host: process.env.PGHOST,
        database: process.env.PGDATABASE,
        password: process.env.PGPASSWORD,
        port: process.env.PGPORT,
        ssl: { rejectUnauthorized: false }, 
    };

const client = new Client(connectionConfig);

// Conecta uma única vez e cria a tabela 'auth'
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
        // Se a conexão falhar, loga o erro e encerra a aplicação
        console.error("❌ Erro ao conectar ao PostgreSQL:", err.message);
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
            // Inicializa novas credenciais se não existirem
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
        // ON CONFLICT para atualizar o registro se a chave 'creds' já existir
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
// 🤖 LÓGICA DO BOT (Com Express para Keep-Alive)
// ==============================
const app = express();
const PORT = process.env.PORT || 3000; 

// Keep-Alive Endpoint
app.get('/', (req, res) => res.send('🤖 Florenzano Bot está online!'));
app.listen(PORT, () => console.log(`🌐 Servidor Express ativo na porta ${PORT}`));

let reconnecting = false;
const delay = ms => new Promise(res => setTimeout(res, ms));

async function startBot() {
    try {
        const { version, isLatest } = await fetchLatestBaileysVersion();
        console.log(`📲 Usando versão do WhatsApp: v${version.join(".")} (última? ${isLatest})`);

        // Lê as credenciais do PostgreSQL
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
                // Gera o QR code em base64 e loga no console do Render
                const qrBase64 = await qrcode.toDataURL(qr);
                console.log("----------------------------------------------------");
                console.log("📱 Escaneie este QR Code no seu WhatsApp:");
                // Logamos o texto do QR Code para ser copiado/escaneado
                console.log(await qrcode.toString(qr, { type: 'terminal' }));
                console.log("----------------------------------------------------");
            }

            if (connection === "close") {
                const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
                console.log("⚠️ Conexão encerrada. Motivo:", reason);

                // Reconneta apenas se não for um logout
                if (reason !== DisconnectReason.loggedOut && !reconnecting) {
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
            
            // Simular digitação
            await sock.presenceSubscribe(sender);
            await sock.sendPresenceUpdate('composing', sender);
            await delay(1500);

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
             // Encerrar digitação
            await sock.sendPresenceUpdate('available', sender);
        });

        // ==============================
        // 💾 Atualiza credenciais quando mudarem (salva no PG)
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
// ▶️ Execução Principal
// ==============================
(async () => {
    console.log("🚀 Iniciando bot...");
    await connectDatabase();
    await startBot();
})();

require('dotenv').config();

const {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs');

// ======================
// EXPRESS + SOCKET.IO
// ======================
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let botState = { status: 'disconnected', qr: null, messages: [], phone: null };
let sock = null;

app.get('/api/status', (req, res) => {
  res.json({ status: botState.status, phone: botState.phone, messageCount: botState.messages.length });
});

app.post('/api/send', async (req, res) => {
  const { number, message } = req.body;
  if (!number || !message) return res.status(400).json({ error: 'number aur message required hai' });
  if (botState.status !== 'connected' || !sock) return res.status(503).json({ error: 'Bot connected nahi hai' });
  try {
    const jid = number.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
    await sock.sendMessage(jid, { text: message });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

server.listen(PORT, () => console.log('Server running on port', PORT));

io.on('connection', (socket) => {
  socket.emit('status', { status: botState.status, phone: botState.phone });
  if (botState.qr) socket.emit('qr', botState.qr);
  if (botState.messages.length > 0) socket.emit('history', botState.messages);
});

// ======================
// WHATSAPP via BAILEYS
// ======================
const AUTH_FOLDER = './auth_info';

async function startWhatsApp() {
  console.log('Starting WhatsApp (baileys)...');

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ['WaBot Pro', 'Chrome', '1.0.0'],
  });

  // QR Code
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('📱 QR generated');
      const qrImage = await qrcode.toDataURL(qr);
      botState.status = 'qr';
      botState.qr = qrImage;
      io.emit('qr', qrImage);
      io.emit('status', { status: 'qr' });
    }

    if (connection === 'open') {
      console.log('✅ Bot Connected!');
      botState.status = 'connected';
      botState.qr = null;
      botState.phone = sock.user?.id?.split(':')[0] || null;
      io.emit('status', { status: 'connected', phone: botState.phone });
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = code !== DisconnectReason.loggedOut;
      console.log('Connection closed, code:', code, '| Reconnect:', shouldReconnect);

      botState.status = 'disconnected';
      botState.qr = null;
      botState.phone = null;
      io.emit('status', { status: 'disconnected' });

      if (shouldReconnect) {
        setTimeout(startWhatsApp, 5000);
      } else {
        // Logged out — clear auth and restart fresh
        if (fs.existsSync(AUTH_FOLDER)) {
          fs.rmSync(AUTH_FOLDER, { recursive: true });
        }
        setTimeout(startWhatsApp, 3000);
      }
    }
  });

  // Save credentials
  sock.ev.on('creds.update', saveCreds);

  // Messages
  sock.ev.on('messages.upsert', async ({ messages: msgs, type }) => {
    if (type !== 'notify') return;

    for (const msg of msgs) {
      if (!msg.message || msg.key.fromMe) continue;

      const text = (
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        ''
      ).toLowerCase().trim();

      const from = msg.key.remoteJid?.replace('@s.whatsapp.net', '') || 'unknown';
      const timestamp = new Date().toLocaleTimeString('en-IN');

      const logEntry = { from, body: text, time: timestamp, type: 'received' };
      botState.messages.unshift(logEntry);
      if (botState.messages.length > 50) botState.messages.pop();
      io.emit('message', logEntry);

      const reply = async (replyText) => {
        await sock.sendMessage(msg.key.remoteJid, { text: replyText });
        const sent = { from: 'Bot', body: replyText, time: timestamp, type: 'sent' };
        botState.messages.unshift(sent);
        io.emit('message', sent);
      };

      if (text === 'hi' || text === 'hello') {
        await reply('Hello 👋 Kaise madad kar sakta hoon?\nType *product* ya *help*');
      } else if (text === 'product' || text === 'products') {
        await reply('🛒 *Humare Products:*\n\n🥛 Milk - ₹50\n🧀 Paneer - ₹300\n👕 Shirt - ₹500');
      } else if (text === 'help') {
        await reply('🤖 *Commands:*\n\nhi - greeting\nproduct - products dekho\nhelp - yeh list');
      }
    }
  });
}

startWhatsApp().catch(err => {
  console.log('Fatal error:', err.message);
  setTimeout(startWhatsApp, 10000);
});

process.on('unhandledRejection', (err) => console.log('Unhandled:', err?.message));
process.on('uncaughtException', (err) => console.log('Uncaught:', err?.message));

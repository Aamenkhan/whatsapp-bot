require('dotenv').config();

const { Client, RemoteAuth } = require('whatsapp-web.js');
const { MongoStore } = require('wwebjs-mongo');
const mongoose = require('mongoose');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const qrcode = require('qrcode');
const path = require('path');

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

// Bot state
let botState = { status: 'disconnected', qr: null, messages: [], phone: null };
let whatsappClient = null;

app.get('/api/status', (req, res) => {
  res.json({ status: botState.status, phone: botState.phone, messageCount: botState.messages.length });
});

app.post('/api/send', async (req, res) => {
  const { number, message } = req.body;
  if (!number || !message) return res.status(400).json({ error: 'number aur message required hai' });
  if (botState.status !== 'connected' || !whatsappClient) return res.status(503).json({ error: 'Bot connected nahi hai' });
  try {
    const chatId = number.replace(/[^0-9]/g, '') + '@c.us';
    await whatsappClient.sendMessage(chatId, message);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

server.listen(PORT, () => console.log('Server running on port', PORT));

// Socket connection
io.on('connection', (socket) => {
  socket.emit('status', { status: botState.status, phone: botState.phone });
  if (botState.qr) socket.emit('qr', botState.qr);
  if (botState.messages.length > 0) socket.emit('history', botState.messages);
});

// ======================
// MONGODB CONNECT
// ======================
mongoose.set("strictQuery", false);

if (!process.env.MONGO_URL) {
  console.error("Missing MONGO_URL in .env");
  process.exit(1);
}

mongoose.connect(process.env.MONGO_URL, { serverSelectionTimeoutMS: 15000 })
  .then(() => {
    console.log("MongoDB Connected ✅");
    startWhatsApp();
  })
  .catch(err => {
    console.log("Mongo Error ❌", err.message);
  });

// ======================
// WHATSAPP — AUTO RESTART
// ======================
async function startWhatsApp() {
  console.log('Starting WhatsApp client...');

  try {
    // Destroy old client if exists
    if (whatsappClient) {
      try { await whatsappClient.destroy(); } catch (_) {}
      whatsappClient = null;
    }

    const store = new MongoStore({ mongoose });

    whatsappClient = new Client({
      authStrategy: new RemoteAuth({
        store,
        backupSyncIntervalMs: 600000,
      }),
      puppeteer: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--no-first-run',
          '--no-zygote',
          '--disable-extensions',
          '--disable-background-networking',
          '--disable-default-apps',
          '--mute-audio',
          '--hide-scrollbars',
        ],
      },
    });

    whatsappClient.on('qr', async (qr) => {
      console.log('📱 QR generated');
      try {
        const qrImage = await qrcode.toDataURL(qr);
        botState.status = 'qr';
        botState.qr = qrImage;
        io.emit('qr', qrImage);
        io.emit('status', { status: 'qr' });
      } catch (e) {
        console.log('QR gen error:', e.message);
      }
    });

    whatsappClient.on('ready', () => {
      console.log('✅ Bot Ready!');
      botState.status = 'connected';
      botState.qr = null;
      const info = whatsappClient.info;
      botState.phone = info ? info.wid.user : null;
      io.emit('status', { status: 'connected', phone: botState.phone });
    });

    whatsappClient.on('auth_failure', (msg) => {
      console.log('❌ Auth failure:', msg);
      botState.status = 'disconnected';
      io.emit('status', { status: 'disconnected' });
      setTimeout(startWhatsApp, 15000);
    });

    whatsappClient.on('disconnected', (reason) => {
      console.log('❌ Disconnected:', reason);
      botState.status = 'disconnected';
      botState.qr = null;
      botState.phone = null;
      io.emit('status', { status: 'disconnected' });
      setTimeout(startWhatsApp, 15000);
    });

    whatsappClient.on('message', async (msg) => {
      const text = msg.body.toLowerCase().trim();
      const from = msg.from.replace('@c.us', '');
      const timestamp = new Date().toLocaleTimeString('en-IN');

      const logEntry = { from, body: msg.body, time: timestamp, type: 'received' };
      botState.messages.unshift(logEntry);
      if (botState.messages.length > 50) botState.messages.pop();
      io.emit('message', logEntry);

      const reply = async (text) => {
        await msg.reply(text);
        const sent = { from: 'Bot', body: text, time: timestamp, type: 'sent' };
        botState.messages.unshift(sent);
        io.emit('message', sent);
      };

      if (text === 'hi' || text === 'hello') return reply('Hello 👋 Kaise madad kar sakta hoon?\nType *product* ya *help*');
      if (text === 'product' || text === 'products') return reply('🛒 *Humare Products:*\n\n🥛 Milk - ₹50\n🧀 Paneer - ₹300\n👕 Shirt - ₹500');
      if (text === 'help') return reply('🤖 *Commands:*\n\nhi - greeting\nproduct - products dekho\nhelp - yeh list');
    });

    await whatsappClient.initialize();

  } catch (err) {
    console.log('WhatsApp start error:', err.message);
    botState.status = 'disconnected';
    io.emit('status', { status: 'disconnected' });
    console.log('Restarting in 20s...');
    setTimeout(startWhatsApp, 20000);
  }
}

// Keep process alive — never crash on unhandled errors
process.on('unhandledRejection', (err) => {
  console.log('Unhandled rejection:', err?.message || err);
});
process.on('uncaughtException', (err) => {
  console.log('Uncaught exception:', err?.message || err);
});

require('dotenv').config();

const { Client, RemoteAuth, MessageMedia } = require('whatsapp-web.js');
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
const io = new Server(server);
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Bot state
let botState = {
  status: 'disconnected', // disconnected | qr | connected
  qr: null,
  messages: [],
  phone: null,
};

app.get('/api/status', (req, res) => {
  res.json({
    status: botState.status,
    phone: botState.phone,
    messageCount: botState.messages.length,
  });
});

app.post('/api/send', async (req, res) => {
  const { number, message } = req.body;
  if (!number || !message) return res.status(400).json({ error: 'number aur message required hai' });
  if (botState.status !== 'connected') return res.status(503).json({ error: 'Bot connected nahi hai' });

  try {
    const chatId = number.replace(/[^0-9]/g, '') + '@c.us';
    await whatsappClient.sendMessage(chatId, message);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

server.listen(PORT, () => {
  console.log('Server running on port', PORT);
});

// ======================
// MONGODB CONNECT
// ======================
mongoose.set("strictQuery", false);

if (!process.env.MONGO_URL) {
  console.error("Missing MONGO_URL in .env");
  process.exit(1);
}

let whatsappClient;

mongoose.connect(process.env.MONGO_URL, {
  serverSelectionTimeoutMS: 10000,
})
.then(() => {
  console.log("MongoDB Connected ✅");

  // ======================
  // WHATSAPP CLIENT
  // ======================
  const store = new MongoStore({ mongoose });

  whatsappClient = new Client({
    authStrategy: new RemoteAuth({
      store: store,
      backupSyncIntervalMs: 300000
    }),
    puppeteer: {
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      headless: true
    }
  });

  // QR Code
  whatsappClient.on('qr', async (qr) => {
    console.log('📱 QR ready - browser mein dekho');
    const qrImage = await qrcode.toDataURL(qr);
    botState.status = 'qr';
    botState.qr = qrImage;
    io.emit('qr', qrImage);
    io.emit('status', { status: 'qr' });
  });

  // Ready
  whatsappClient.on('ready', () => {
    console.log('✅ Bot Ready!');
    botState.status = 'connected';
    botState.qr = null;
    const info = whatsappClient.info;
    botState.phone = info ? info.wid.user : null;
    io.emit('status', { status: 'connected', phone: botState.phone });
  });

  // Disconnected
  whatsappClient.on('disconnected', (reason) => {
    console.log('❌ Disconnected:', reason);
    botState.status = 'disconnected';
    botState.qr = null;
    botState.phone = null;
    io.emit('status', { status: 'disconnected' });
  });

  // Message handler
  whatsappClient.on('message', async (msg) => {
    const text = msg.body.toLowerCase().trim();
    const from = msg.from.replace('@c.us', '');
    const timestamp = new Date().toLocaleTimeString('en-IN');

    // Log message
    const logEntry = { from, body: msg.body, time: timestamp, type: 'received' };
    botState.messages.unshift(logEntry);
    if (botState.messages.length > 50) botState.messages.pop();
    io.emit('message', logEntry);

    // Auto replies
    if (text === "hi" || text === "hello") {
      await msg.reply("Hello 👋 Kaise madad kar sakta hoon?");
      io.emit('message', { from: 'Bot', body: 'Hello 👋 Kaise madad kar sakta hoon?', time: timestamp, type: 'sent' });
      return;
    }

    if (text === "product" || text === "products") {
      const productMsg = "🛒 *Humare Products:*\n\n🥛 Milk - ₹50\n🧀 Paneer - ₹300\n👕 Shirt - ₹500";
      await msg.reply(productMsg);
      io.emit('message', { from: 'Bot', body: productMsg, time: timestamp, type: 'sent' });
      return;
    }

    if (text === "help") {
      const helpMsg = "🤖 *Commands:*\n\nhi - greeting\nproduct - products dekho\nhelp - yeh list";
      await msg.reply(helpMsg);
      io.emit('message', { from: 'Bot', body: helpMsg, time: timestamp, type: 'sent' });
      return;
    }
  });

  // Start client
  whatsappClient.initialize();

})
.catch(err => {
  console.log("Mongo Error ❌", err.message);
  console.log("Tip: Atlas me IP whitelist + DB user credentials verify karo.");
});

// Socket connection
io.on('connection', (socket) => {
  // Send current state to new clients
  socket.emit('status', { status: botState.status, phone: botState.phone });
  if (botState.qr) socket.emit('qr', botState.qr);
  if (botState.messages.length > 0) socket.emit('history', botState.messages);
});

// ======================
// ERROR HANDLING
// ======================
process.on("unhandledRejection", err => {
  console.log("Error:", err);
});

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
const io = new Server(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });
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
// CATALOG — apni photos ke URLs yahan daalo
// ======================
const CATALOG = {
  electronics: {
    emoji: '📱',
    name: 'Electronics',
    image: 'https://images.unsplash.com/photo-1498049794561-7780e7231661?w=600',
    caption: '📱 *Electronics — Thtwaat Marketplace*\n\n• Smartphones\n• Laptops & Tablets\n• Earphones & Speakers\n• Cameras\n• Smart Watches\n\n💬 Koi specific product chahiye? Reply karo!',
  },
  fashion: {
    emoji: '👗',
    name: 'Fashion',
    image: 'https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?w=600',
    caption: '👗 *Fashion — Thtwaat Marketplace*\n\n• Men\'s Clothing\n• Women\'s Clothing\n• Kids Wear\n• Footwear\n• Accessories & Bags\n\n💬 Style dhundh rahe ho? Reply karo!',
  },
  grocery: {
    emoji: '🛒',
    name: 'Grocery',
    image: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=600',
    caption: '🛒 *Grocery — Thtwaat Marketplace*\n\n• Fresh Vegetables & Fruits\n• Dairy Products\n• Snacks & Beverages\n• Spices & Masala\n• Organic Products\n\n💬 Kya chahiye? Reply karo!',
  },
  home: {
    emoji: '🏠',
    name: 'Home & Kitchen',
    image: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=600',
    caption: '🏠 *Home & Kitchen — Thtwaat Marketplace*\n\n• Cookware & Appliances\n• Furniture\n• Bedding & Cushions\n• Decor Items\n• Cleaning Products\n\n💬 Ghar ke liye kuch chahiye? Reply karo!',
  },
  beauty: {
    emoji: '💄',
    name: 'Beauty',
    image: 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=600',
    caption: '💄 *Beauty — Thtwaat Marketplace*\n\n• Skincare\n• Makeup & Cosmetics\n• Haircare\n• Perfumes\n• Men\'s Grooming\n\n💬 Koi product dekhna hai? Reply karo!',
  },
  sports: {
    emoji: '⚽',
    name: 'Sports',
    image: 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=600',
    caption: '⚽ *Sports — Thtwaat Marketplace*\n\n• Cricket & Football\n• Gym Equipment\n• Yoga & Fitness\n• Outdoor & Camping\n• Cycling\n\n💬 Khelne ka kuch chahiye? Reply karo!',
  },
};

const MENU = `🛍️ *Thtwaat Marketplace mein aapka swagat hai!*

Hum ek app mein sab kuch dete hain. Category chuniye:

📱 *electronics* — Phones, Laptops
👗 *fashion* — Clothes, Footwear
🛒 *grocery* — Fresh Food, Daily Items
🏠 *home* — Kitchen, Furniture
💄 *beauty* — Skincare, Makeup
⚽ *sports* — Fitness, Equipment

👉 Category ka naam likho ya *help* likho`;

const CONTACT_MSG = `📞 *Order karna hai?*\n\nHamse seedha baat karo:\n📱 WhatsApp: +91 9407196146\n\nYa koi bhi category likho dekhne ke liye! 🛍️`;

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
    browser: ['Thtwaat Bot', 'Chrome', '1.0.0'],
  });

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
      botState.status = 'disconnected';
      botState.qr = null;
      botState.phone = null;
      io.emit('status', { status: 'disconnected' });

      if (shouldReconnect) {
        setTimeout(startWhatsApp, 5000);
      } else {
        if (fs.existsSync(AUTH_FOLDER)) fs.rmSync(AUTH_FOLDER, { recursive: true });
        setTimeout(startWhatsApp, 3000);
      }
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ messages: msgs, type }) => {
    if (type !== 'notify') return;

    for (const msg of msgs) {
      if (!msg.message || msg.key.fromMe) continue;

      const text = (
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        ''
      ).toLowerCase().trim();

      const jid = msg.key.remoteJid;
      const from = jid?.replace('@s.whatsapp.net', '') || 'unknown';
      const timestamp = new Date().toLocaleTimeString('en-IN');

      // Log
      const logEntry = { from, body: text, time: timestamp, type: 'received' };
      botState.messages.unshift(logEntry);
      if (botState.messages.length > 50) botState.messages.pop();
      io.emit('message', logEntry);

      const sendText = async (t) => {
        await sock.sendMessage(jid, { text: t });
        botState.messages.unshift({ from: 'Bot', body: t, time: timestamp, type: 'sent' });
        io.emit('message', { from: 'Bot', body: t, time: timestamp, type: 'sent' });
      };

      const sendImage = async (imageUrl, caption) => {
        await sock.sendMessage(jid, {
          image: { url: imageUrl },
          caption,
        });
        botState.messages.unshift({ from: 'Bot', body: caption, time: timestamp, type: 'sent' });
        io.emit('message', { from: 'Bot', body: caption, time: timestamp, type: 'sent' });
      };

      // Routing
      if (text === 'hi' || text === 'hello' || text === 'menu' || text === 'start') {
        await sendText(MENU);

      } else if (CATALOG[text]) {
        const cat = CATALOG[text];
        await sendImage(cat.image, cat.caption);
        await sendText('📦 Order karna hai? *order* likho ya seedha call/message karo: +91 9407196146');

      } else if (text === 'order' || text === 'buy' || text === 'kharidna') {
        await sendText(CONTACT_MSG);

      } else if (text === 'help') {
        await sendText(`🆘 *Help — Thtwaat Marketplace*\n\n*hi* — Welcome menu\n*electronics* — Electronics products\n*fashion* — Fashion & Clothing\n*grocery* — Grocery items\n*home* — Home & Kitchen\n*beauty* — Beauty products\n*sports* — Sports items\n*order* — Order karna hai\n\n📞 Direct contact: +91 9407196146`);

      } else {
        await sendText(`😊 "${text}" samajh nahi aaya.\n\n*hi* likho — full menu dekhne ke liye\n*help* likho — all commands`);
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

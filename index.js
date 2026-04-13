const { Client, RemoteAuth } = require('whatsapp-web.js');
const { MongoStore } = require('wwebjs-mongo');
const mongoose = require('mongoose');
const qrcode = require('qrcode-terminal');
const express = require('express');

// ======================
// EXPRESS SERVER (IMPORTANT FOR RENDER)
// ======================
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Bot is running ✅');
});

app.listen(PORT, () => {
  console.log('Server running on port', PORT);
});

// ======================
// MONGODB CONNECTION
// ======================
mongoose.connect(process.env.MONGO_URL)
  .then(() => console.log("MongoDB Connected ✅"))
  .catch(err => console.log("Mongo Error ❌", err));

const store = new MongoStore({ mongoose });

// ======================
// WHATSAPP CLIENT
// ======================
const client = new Client({
  authStrategy: new RemoteAuth({
    store: store,
    backupSyncIntervalMs: 300000
  }),
  puppeteer: {
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    headless: true
  }
});

// ======================
// QR CODE
// ======================
client.on('qr', (qr) => {
  console.log('Scan QR below:');
  qrcode.generate(qr, { small: true });
});

// ======================
// READY
// ======================
client.on('ready', () => {
  console.log('✅ Bot Ready!');
});

// ======================
// MESSAGES
// ======================
client.on('message', async (msg) => {
  const text = msg.body.toLowerCase().trim();

  if (text === "hi") {
    return msg.reply("Hello 👋");
  }

  if (text === "product") {
    return msg.reply("milk ₹50\npaneer ₹300\nshirt ₹500");
  }
});

// ======================
// ERROR HANDLING
// ======================
process.on("unhandledRejection", err => {
  console.log("Error:", err);
});

// ======================
// START BOT
// ======================
client.initialize();
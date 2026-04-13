const { Client, RemoteAuth } = require('whatsapp-web.js');
const { MongoStore } = require('wwebjs-mongo');
const mongoose = require('mongoose');
const qrcode = require('qrcode-terminal');
const express = require('express');

// ======================
// EXPRESS SERVER
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
// START EVERYTHING AFTER MONGO CONNECT
// ======================
mongoose.connect(process.env.MONGO_URL)
  .then(() => {
    console.log("MongoDB Connected ✅");

    const store = new MongoStore({ mongoose });

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

    // QR
    client.on('qr', (qr) => {
      console.log('Scan QR below:');
      qrcode.generate(qr, { small: true });
    });

    // Ready
    client.on('ready', () => {
      console.log('✅ Bot Ready!');
    });

    // Messages
    client.on('message', async (msg) => {
      const text = msg.body.toLowerCase().trim();

      if (text === "hi") {
        return msg.reply("Hello 👋");
      }

      if (text === "product") {
        return msg.reply("milk ₹50\npaneer ₹300\nshirt ₹500");
      }
    });

    // Start
    client.initialize();
  })
  .catch(err => {
    console.log("Mongo Error ❌", err);
  });

// ======================
// ERROR HANDLING
// ======================
process.on("unhandledRejection", err => {
  console.log("Error:", err);
});
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const axios = require('axios');
const qrcode = require('qrcode-terminal');
const gTTS = require('gtts');
const express = require('express');

const APP_LINK = "https://drive.google.com/uc?export=download&id=1RSwoYB96kY-HfZ55FusPhVSH5_V0lOj5";
const ADMIN = "919407196146@c.us";

const app = express();
const PORT = process.env.PORT || 3000;

// 🌐 Express server (Railway)
app.get('/', (req, res) => {
  res.send('Bot is running ✅');
});

app.listen(PORT, () => {
  console.log('Server running on port', PORT);
});

// ✅ SINGLE CLIENT (FIXED)
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    headless: true
  }
});

// 🔑 API KEY
const PEXELS_KEY = "YOUR_PEXELS_API_KEY";

// 🛒 Products
const products = {
  milk: { price: 50 },
  paneer: { price: 300 },
  shirt: { price: 500 }
};

// 🧠 Memory
let orders = {};
let customers = [];
let repeatCustomers = {};

// ======================
// QR
// ======================
client.on('qr', qr => {
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log('✅ Bot Ready!');
});

// ======================
client.on('message', async msg => {
  const text = msg.body.toLowerCase().trim();
  const user = msg.from;

  if (text === "hi") {
    return msg.reply("Hello 👋");
  }

  if (text === "product") {
    return msg.reply("milk ₹50\npaneer ₹300\nshirt ₹500");
  }
});

// ======================
process.on("unhandledRejection", err => {
  console.log("Error:", err);
});

// START
client.initialize();
const APP_LINK = "https://drive.google.com/uc?export=download&id=1RSwoYB96kY-HfZ55FusPhVSH5_V0lOj5";
const ADMIN = "919407196146@c.us";

const client = new Client({
  puppeteer: {
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    headless: true
  }
});

const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const axios = require('axios');
const qrcode = require('qrcode-terminal');
const gTTS = require('gtts');

const client = new Client({
  authStrategy: new LocalAuth()
});

// 🔑 API KEY (PEXELS)
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
// 📸 IMAGE FETCH
// ======================
async function fetchImage(productName) {
  try {
    const res = await axios.get(
      `https://api.pexels.com/v1/search?query=${productName}&per_page=1`,
      {
        headers: { Authorization: PEXELS_KEY }
      }
    );
    return res.data.photos[0]?.src?.medium;
  } catch {
    return null;
  }
}

// ======================
// 📤 SEND IMAGE
// ======================
async function sendProductImage(chatId, productName) {
  const imageUrl = await fetchImage(productName);

  if (!imageUrl) {
    return client.sendMessage(chatId, "😔 फोटो नहीं मिला");
  }

  const res = await axios.get(imageUrl, { responseType: 'arraybuffer' });

  const media = new MessageMedia(
    'image/jpeg',
    Buffer.from(res.data, 'binary').toString('base64')
  );

  await client.sendMessage(chatId, media, {
    caption: `🛒 ${productName}\n💰 ₹${products[productName].price}`
  });
}

// ======================
client.on('qr', qr => {
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log('✅ Thtwaat Bot Ready!');
});

// ======================
client.on('message', async msg => {

  const text = msg.body.toLowerCase().trim();
  const user = msg.from;

  // ======================
  // 👑 ADMIN
  // ======================
  if (user === ADMIN && text === "orders") {
    return msg.reply("📦 Total Orders: " + customers.length);
  }

  if (user === ADMIN && text === "money") {
    let total = 0;
    customers.forEach(c => {
      total += products[c.product]?.price || 0;
    });
    return msg.reply(`💰 Total कमाई: ₹${total}`);
  }

  // ======================
  // 🙏 GREETING (BRAND STYLE)
  // ======================
  if (["hi","hello","hii","namaste"].includes(text)) {

    let extra = "";

    if (repeatCustomers[user]) {
      extra = "\n🎉 Welcome back! आपको special discount मिलेगा";
    }

    const reply = `🙏 नमस्ते!

*Thtwaat Marketplace* में आपका स्वागत है 🛒

📱 App डाउनलोड करें:
${APP_LINK}

👉 "product" लिखें सामान देखने के लिए
👉 नाम भेजें फोटो देखने के लिए${extra}`;

    await msg.reply(reply);

    const gtts = new gTTS("नमस्ते! आपका स्वागत है हमारे स्टोर में", 'hi');
    gtts.save('./voice.mp3', async () => {
      const media = MessageMedia.fromFilePath('./voice.mp3');
      await msg.reply(media);
    });

    return;
  }

  // ======================
  // 🛒 PRODUCT LIST
  // ======================
  if (text === "product") {
    let list = "🛒 हमारे best products:\n\n";

    for (let item in products) {
      list += `👉 ${item} - ₹${products[item].price}\n`;
    }

    return msg.reply(list + "\n\n👉 नाम भेजो फोटो देखने के लिए 📸");
  }

  // ======================
  // 🛒 PRODUCT SELECT + IMAGE
  // ======================
  if (products[text]) {

    await sendProductImage(msg.from, text);

    orders[user] = {
      step: "name",
      product: text
    };

    return msg.reply(`🔥 बढ़िया choice!

👉 अपना नाम बताओ 😊`);
  }

  // ======================
  // 📦 ORDER FLOW
  // ======================
  if (orders[user]) {

    if (orders[user].step === "name") {
      orders[user].name = msg.body;
      orders[user].step = "address";
      return msg.reply("📍 अपना address भेजो:");
    }

    if (orders[user].step === "address") {

      orders[user].address = msg.body;

      const price = products[orders[user].product].price;
      const orderId = "ORD" + Math.floor(Math.random()*100000);

      const reply = `✅ ऑर्डर सफल 🎉

🆔 ${orderId}
🛒 ${orders[user].product}
💰 ₹${price}

🎁 अगली बार discount मिलेगा!

🙏 धन्यवाद ❤️`;

      msg.reply(reply);

      customers.push({
        phone: user,
        ...orders[user],
        orderId
      });

      repeatCustomers[user] = true;

      delete orders[user];

      return;
    }
  }

  // ======================
  // ⭐ FEEDBACK SYSTEM
  // ======================
  if (text === "feedback") {
    return msg.reply("⭐ 1 से 5 तक rating दें:");
  }

  if (["1","2","3","4","5"].includes(text)) {
    return msg.reply("🙏 धन्यवाद! आपका feedback मिल गया");
  }

  // ======================
  // 🤖 SMART HUMAN CHAT
  // ======================
  if (text.includes("price")) {
    return msg.reply("👉 'product' लिखो सारे price देखने के लिए 😊");
  }

  if (text.includes("offer")) {
    return msg.reply("🎁 आज special offer चल रहा है! जल्दी order करो");
  }

  if (text.includes("kaise ho")) {
    return msg.reply("मैं बढ़िया हूँ 😊 आप बताओ?");
  }

  // ======================
  // 🤖 AI CHAT (fallback)
  // ======================
  try {
    const res = await axios.post('http://localhost:11434/api/generate', {
      model: 'gemma:2b',
      prompt: `तुम एक friendly shop assistant हो, हिंदी में इंसान जैसा जवाब दो.\nUser: ${msg.body}`,
      stream: false
    });

    const reply = res.data.response?.trim();

    if (reply) {
      return msg.reply(reply);
    }

  } catch {
    return msg.reply("😊 मैं आपकी मदद के लिए हूँ\n👉 product लिखिए");
  }

});

client.initialize();
const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.send('Bot is running');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Server running on port', PORT);
});
const express = require('express');
const app = express();
const PORT = 3000;

// 🧠 memory
let orders = [];

// ✅ Home route
app.get('/', (req, res) => {
  res.send("✅ Thtwaat API Running");
});

// ✅ Orders route
app.get('/orders', (req, res) => {
  res.json(orders);
});

// ✅ Add order (test)
app.get('/add', (req, res) => {
  const newOrder = {
    id: "ORD" + Math.floor(Math.random() * 10000),
    name: "Test User",
    product: "Milk",
    price: 50
  };

  orders.push(newOrder);

  res.json({
    message: "Order added",
    order: newOrder
  });
});

// 🚀 Start server
app.listen(PORT, () => {
  console.log(`🚀 API running on http://localhost:${PORT}`);
});
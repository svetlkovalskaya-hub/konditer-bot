const express = require('express');
const path = require('path');
const fs = require('fs');
const config = require('./config');
const telegramBot = require('./bot/telegram');
const maxBot = require('./bot/max');

const app = express();

app.get('/', (req, res) => {
  res.send('Помощник кондитера работает');
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/reset-webhook', async (req, res) => {
  try {
    const response = await fetch(`https://api.telegram.org/bot${config.telegramToken}/deleteWebhook`);
    const data = await response.json();
    res.json({ ok: true, telegram: data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.listen(config.port, () => {
  console.log(`Сервер запущен на порту ${config.port}`);
});

const uploadsDir = path.resolve(config.uploadsDir);
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

telegramBot.init();
maxBot.init();

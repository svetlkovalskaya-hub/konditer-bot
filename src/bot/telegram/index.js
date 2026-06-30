const { TelegramBot } = require('node-telegram-bot-api');
const config = require('../../config');
const orderService = require('../../services/orderService');
const dateUtils = require('../../utils/date');
const newOrder = require('./scenes/newOrder');
const admin = require('./admin');

let bot = null;

function init() {
  if (!config.telegramToken) {
    console.error('Не задан TELEGRAM_BOT_TOKEN. Создайте .env файл.');
    return null;
  }

  bot = new TelegramBot(config.telegramToken, { polling: true });

  if (config.adminTelegramId) {
    orderService.setAdmin(config.adminTelegramId, 'Главный админ');
  }

  bot.onText(/\/start/, (msg) => {
    sendMainMenu(bot, msg.chat.id, msg.from.id);
  });

  bot.onText(/\/myorders/, (msg) => {
    const orders = orderService.getOrders(null, 50).filter((o) => String(o.client_id) === String(msg.from.id));
    if (!orders.length) {
      bot.sendMessage(msg.chat.id, 'У вас пока нет заказов.');
      return;
    }
    const text = orders
      .map((o) => `#${o.id} ${dateUtils.formatDate(o.delivery_date)} ${o.delivery_time || ''} — ${o.product_name || '—'} (${o.status})`)
      .join('\n');
    bot.sendMessage(msg.chat.id, `Ваши заказы:\n${text}\n\nЧтобы записаться снова, нажмите /start.`);
  });

  function sendMainMenu(chatId, userId) {
    const isAdmin = orderService.isAdmin(userId);
    const text = isAdmin
      ? 'Привет! Это панель кондитера.\nКоманды: /orders, /order N, /confirm N, /cancel N, /reschedule N YYYY-MM-DD, /addproduct, /products, /blockdate, /unblockdate, /blocked'
      : 'Привет! Я помогу записаться на изделие ручной работы. Нажмите "Записаться" ниже.';

    if (isAdmin) {
      bot.sendMessage(chatId, text);
      return;
    }

    newOrder.resetSession(userId);
    bot.sendMessage(chatId, text, {
      reply_markup: {
        inline_keyboard: [[{ text: 'Записаться', callback_data: 'start_order' }]],
      },
    });
  }

  bot.on('callback_query', (query) => {
    if (query.data === 'start_order') {
      newOrder.startNewOrder(bot, query.message);
      return;
    }
    newOrder.handleCallback(bot, query);
  });

  bot.on('message', (msg) => {
    if (msg.text && msg.text.startsWith('/')) return;
    newOrder.handleMessage(bot, msg);
  });

  admin.register(bot);

  console.log('Telegram-бот запущен');
  return bot;
}

module.exports = { init };

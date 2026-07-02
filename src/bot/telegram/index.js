const { TelegramBot } = require('node-telegram-bot-api');
const config = require('../../config');
const orderService = require('../../services/orderService');
const dateUtils = require('../../utils/date');
const keyboards = require('../../utils/keyboard');
const newOrder = require('./scenes/newOrder');
const admin = require('./admin');

let bot = null;

function init() {
  if (!config.telegramToken) {
    console.error('Не задан TELEGRAM_BOT_TOKEN. Создайте .env файл.');
    return null;
  }

  bot = new TelegramBot(config.telegramToken, { polling: true });

  bot.on('polling_error', (err) => {
    console.error('[polling_error]', err.message || err);
  });

  bot.on('error', (err) => {
    console.error('[bot_error]', err.message || err);
  });

  bot.deleteWebhook().catch((err) => {
    console.error('Не удалось удалить webhook:', err.message);
  });

  if (config.adminTelegramId) {
    orderService.setAdmin(config.adminTelegramId, 'Главный админ');
  }

  bot.setMyCommands([
    { command: 'start', description: 'Начать запись' },
    { command: 'myorders', description: 'Мои заказы' },
  ]);

  bot.onText(/\/start/, (msg) => {
    sendMainMenu(msg.chat.id, msg.from.id);
  });

  function showMyOrders(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const orders = orderService.getOrders(null, 50).filter((o) => String(o.client_id) === String(userId));
    if (!orders.length) {
      bot.sendMessage(chatId, 'У вас пока нет заказов.', keyboards.mainMenuKeyboard());
      return;
    }
    const text = orders
      .map((o) => `#${o.id} ${dateUtils.formatDate(o.delivery_date)} ${o.delivery_time || ''} — ${o.product_name || '—'} (${o.status})`)
      .join('\n');
    bot.sendMessage(chatId, `Ваши заказы:\n${text}\n\nЧтобы записаться снова, нажмите "📝 Записаться".`, keyboards.mainMenuKeyboard());
  }

  bot.onText(/\/myorders/, (msg) => {
    showMyOrders(msg);
  });

  function sendMainMenu(chatId, userId) {
    const isAdmin = orderService.isAdmin(userId);
    const text = isAdmin
      ? 'Привет! Это панель кондитера. Выберите действие внизу экрана или используйте команды: /orders, /order N, /confirm N, /cancel N, /reschedule N YYYY-MM-DD, /addproduct, /products, /blockdate, /unblockdate, /blocked'
      : 'Привет! Я — помощник кондитера. Помогу вам забронировать тортик или другое кондитерское изделие на подходящую дату. Нажмите на кнопку внизу экрана.';

    newOrder.resetSession(userId);
    bot.sendMessage(chatId, text, keyboards.mainMenuKeyboard(isAdmin));
  }

  bot.on('callback_query', (query) => {
    if (query.data === 'start_order') {
      newOrder.startNewOrder(bot, query.message);
      return;
    }
    newOrder.handleCallback(bot, query);
  });

  bot.on('message', (msg) => {
    if (!msg.text || msg.text.startsWith('/')) return;

    const userId = msg.from.id;
    const chatId = msg.chat.id;
    const text = msg.text.trim();

    if (text === '📝 Записаться') {
      newOrder.resetSession(userId);
      newOrder.startNewOrder(bot, msg);
      return;
    }

    if (text === '📋 Мои заказы') {
      showMyOrders(msg);
      return;
    }

    if (text === '🔄 Перенести запись') {
      startReschedule(bot, msg);
      return;
    }

    if (text === '📋 Список заказов') {
      showAdminOrders(msg);
      return;
    }

    if (text === '🔍 Поиск по имени') {
      startSearchByName(bot, msg);
      return;
    }

    const session = newOrder.getSession(userId);
    if (session.step === 'idle') {
      sendMainMenu(chatId, userId);
      return;
    }

    newOrder.handleMessage(bot, msg);
  });

  function showAdminOrders(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (!orderService.isAdmin(userId)) {
      bot.sendMessage(chatId, 'Эта функция только для администратора.', keyboards.mainMenuKeyboard());
      return;
    }
    const orders = orderService.getOrders(null, 50);
    if (!orders.length) {
      bot.sendMessage(chatId, 'Нет заказов.', keyboards.mainMenuKeyboard(true));
      return;
    }
    const text = orders
      .map((o) => `#${o.id} ${dateUtils.formatDate(o.delivery_date)} ${o.delivery_time || ''} — ${o.product_name || '—'} — ${o.client_name || '—'} (${o.status})`)
      .join('\n');
    bot.sendMessage(chatId, `Заказы по датам:\n${text}\n\nДля деталей: /order N`, keyboards.mainMenuKeyboard(true));
  }

  function startSearchByName(bot, msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (!orderService.isAdmin(userId)) {
      bot.sendMessage(chatId, 'Эта функция только для администратора.', keyboards.mainMenuKeyboard());
      return;
    }
    bot.sendMessage(chatId, 'Напишите имя заказчика или часть имени для поиска.');

    const handler = (reply) => {
      if (reply.from.id !== userId || !reply.text || reply.text.startsWith('/')) return;
      bot.removeListener('message', handler);
      const name = reply.text.trim();
      if (!name) {
        bot.sendMessage(chatId, 'Имя не может быть пустым.', keyboards.mainMenuKeyboard(true));
        return;
      }
      const orders = orderService.searchOrdersByClientName(name, 50);
      if (!orders.length) {
        bot.sendMessage(chatId, `Заказов по имени «${name}» не найдено.`, keyboards.mainMenuKeyboard(true));
        return;
      }
      const text = orders
        .map((o) => `#${o.id} ${dateUtils.formatDate(o.delivery_date)} ${o.delivery_time || ''} — ${o.product_name || '—'} — ${o.client_name || '—'} (${o.status})`)
        .join('\n');
      bot.sendMessage(chatId, `Найдено заказов по «${name}»:\n${text}\n\nДля деталей: /order N`, keyboards.mainMenuKeyboard(true));
    };

    bot.on('message', handler);
  }

  function startReschedule(bot, msg) {
    const userId = msg.from.id;
    const chatId = msg.chat.id;
    const orders = orderService.getOrders(null, 50).filter((o) => String(o.client_id) === String(userId) && o.status !== 'cancelled');
    if (!orders.length) {
      bot.sendMessage(chatId, 'У вас пока нет активных заказов, которые можно перенести.', keyboards.mainMenuKeyboard());
      return;
    }
    const rows = orders.map((o) => [{ text: `#${o.id} — ${o.product_name || '—'} — ${dateUtils.formatDate(o.delivery_date)} ${o.delivery_time || ''}`, callback_data: `reschedule_order_${o.id}` }]);
    bot.sendMessage(chatId, 'Выберите заказ для переноса:', {
      reply_markup: { inline_keyboard: rows },
    });
  }

  admin.register(bot);

  console.log('Telegram-бот запущен');
  return bot;
}

module.exports = { init };

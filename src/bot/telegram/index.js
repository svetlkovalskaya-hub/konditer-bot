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
    { command: 'start', description: 'Открыть меню' },
    { command: 'myorders', description: 'Мои заказы' },
  ]);

  bot.onText(/\/start/, (msg) => {
    sendMainMenu(msg.chat.id, msg.from.id);
  });

  bot.onText(/\/myorders/, (msg) => {
    showMyOrders(msg);
  });

  function sendMainMenu(chatId, userId) {
    const isAdmin = orderService.isAdmin(userId);
    if (isAdmin) {
      admin.showAdminPanel(bot, chatId, userId);
      return;
    }
    const text = 'Привет! Я — помощник кондитера. Помогу вам забронировать тортик или другое кондитерское изделие на подходящую дату. Нажмите на кнопку внизу экрана.';
    newOrder.resetSession(userId);
    bot.sendMessage(chatId, text, keyboards.mainMenuKeyboard(false));
  }

  function showMyOrders(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const orders = orderService.getOrders(null, 50).filter((o) => String(o.client_id) === String(userId));
    if (!orders.length) {
      bot.sendMessage(chatId, 'У вас пока нет заказов.', keyboards.mainMenuKeyboard(orderService.isAdmin(userId)));
      return;
    }
    const text = orders
      .map((o) => `#${o.id} ${dateUtils.formatDate(o.delivery_date)} ${o.delivery_time || ''} — ${o.product_name || '—'} (${o.status})`)
      .join('\n');
    bot.sendMessage(chatId, `Ваши заказы:\n${text}\n\nЧтобы записаться снова, нажмите "📝 Записаться".`, keyboards.mainMenuKeyboard(orderService.isAdmin(userId)));
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
    if (msg.chat.type !== 'private') return;

    const userId = msg.from.id;
    const chatId = msg.chat.id;
    const text = msg.text.trim();

    // Admin menu and states
    if (orderService.isAdmin(userId)) {
      if (text === '🏠 Общее меню') {
        admin.showAdminPanel(bot, chatId, userId);
        return;
      }
      if (text === '📋 Список заказов') {
        admin.showOrdersList(bot, chatId);
        return;
      }
      if (text === '🔍 Найти по имени') {
        admin.askSearchByName(bot, chatId, userId);
        return;
      }
      if (text === '📞 Поиск по телефону') {
        admin.askSearchByPhone(bot, chatId, userId);
        return;
      }
      if (text === '❌ Удалить заказ') {
        admin.askDeleteOrder(bot, chatId, userId);
        return;
      }
      if (text === '🔄 Перенести запись') {
        admin.askRescheduleOrder(bot, chatId, userId);
        return;
      }

      const adminState = admin.getAdminState(userId);
      if (adminState.action !== 'idle') {
        admin.handleAdminMessage(bot, msg, userId);
        return;
      }
    }

    // Client menu
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

    // Client active session
    const session = newOrder.getSession(userId);
    if (session && session.step !== 'idle') {
      newOrder.handleMessage(bot, msg);
      return;
    }

    sendMainMenu(chatId, userId);
  });

  function startReschedule(bot, msg) {
    const userId = msg.from.id;
    const chatId = msg.chat.id;
    const orders = orderService.getOrders(null, 50).filter((o) => String(o.client_id) === String(userId) && o.status !== 'cancelled');
    if (!orders.length) {
      bot.sendMessage(chatId, 'У вас пока нет активных заказов, которые можно перенести.', keyboards.mainMenuKeyboard(orderService.isAdmin(userId)));
      return;
    }
    const rows = orders.map((o) => [{ text: `#${o.id} — ${o.product_name || '—'} — ${dateUtils.formatDate(o.delivery_date)} ${o.delivery_time || ''}`, callback_data: `reschedule_order_${o.id}` }]);
    bot.sendMessage(chatId, 'Выберите заказ для переноса:', {
      reply_markup: { inline_keyboard: rows },
    });
  }

  console.log('Telegram-бот запущен');
  return bot;
}

module.exports = { init };

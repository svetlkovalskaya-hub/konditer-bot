const path = require('path');
const fs = require('fs');
const config = require('../../../config');
const orderService = require('../../../services/orderService');
const keyboards = require('../../../utils/keyboard');
const dateUtils = require('../../../utils/date');

const sessions = new Map();

function ensureUploadsDir() {
  const uploadsDir = path.resolve(config.uploadsDir);
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  return uploadsDir;
}

function getSession(userId) {
  if (!sessions.has(userId)) {
    sessions.set(userId, { step: 'idle', photos: [] });
  }
  return sessions.get(userId);
}

function resetSession(userId) {
  sessions.set(userId, { step: 'idle', photos: [], clientId: String(userId) });
}

function startNewOrder(bot, msg) {
  const userId = msg.from.id;
  const session = getSession(userId);
  session.step = 'name';
  session.clientId = String(userId);
  session.clientUsername = msg.from.username || '';
  session.photos = [];

  bot.sendMessage(msg.chat.id, 'Как к вам обращаться? Напишите ваше имя.');
}

function canReschedule(order) {
  const deliveryDateTime = new Date(`${order.delivery_date}T${order.delivery_time || '00:00'}:00`);
  const now = new Date();
  const diffHours = (deliveryDateTime - now) / (1000 * 60 * 60);
  return diffHours >= 24;
}

function handleCallback(bot, query) {
  const userId = query.from.id;
  const chatId = query.message.chat.id;
  const data = query.data;
  const session = getSession(userId);

  bot.answerCallbackQuery(query.id);

  if (data.startsWith('product_')) {
    const productId = Number(data.replace('product_', ''));
    const products = orderService.getProducts();
    const product = products.find((p) => p.id === productId);
    if (!product) {
      bot.sendMessage(chatId, 'Продукт не найден. Начните заново: /start');
      return;
    }
    session.productId = productId;
    session.productName = product.name;
    session.step = 'date';
    bot.sendMessage(chatId, `Выбрано: ${product.name}. Теперь выберите дату:`, keyboards.calendarKeyboard(dateUtils.todayStr()));
    return;
  }

  if (data.startsWith('cal_next_') || data.startsWith('cal_prev_')) {
    const baseDate = data.replace('cal_next_', '').replace('cal_prev_', '');
    bot.editMessageReplyMarkup(
      keyboards.calendarKeyboard(baseDate).reply_markup,
      { chat_id: chatId, message_id: query.message.message_id }
    );
    return;
  }

  if (data.startsWith('busy_')) {
    const dateStr = data.replace('busy_', '');
    bot.sendMessage(chatId, `Дата ${dateUtils.formatDate(dateStr)} занята или недоступна. Пожалуйста, выберите другую.`);
    return;
  }

  if (data.startsWith('date_')) {
    const dateStr = data.replace('date_', '');
    if (!orderService.isDateAvailable(dateStr)) {
      bot.sendMessage(chatId, `Дата ${dateUtils.formatDate(dateStr)} только что занята. Выберите другую.`);
      return;
    }
    session.deliveryDate = dateStr;
    session.step = 'time';
    bot.sendMessage(chatId, 'Выберите время доставки/выдачи:', keyboards.timeKeyboard());
    return;
  }

  if (data.startsWith('time_')) {
    if (data === 'time_custom') {
      session.step = 'time_custom';
      bot.sendMessage(chatId, 'Напишите удобное время в формате ЧЧ:ММ, например 14:30');
      return;
    }
    const time = data.replace('time_', '');
    session.deliveryTime = time;
    session.step = 'delivery_type';
    bot.sendMessage(chatId, 'Как получите заказ?', keyboards.deliveryTypeKeyboard());
    return;
  }

  if (data === 'delivery_type_delivery') {
    session.isPickup = false;
    session.step = 'address';
    bot.sendMessage(chatId, 'Укажите адрес доставки (город, улица, дом, подъезд).');
    return;
  }

  if (data === 'delivery_type_pickup') {
    session.isPickup = true;
    session.address = 'Самовывоз';
    session.step = 'comment';
    bot.sendMessage(chatId, 'Напишите комментарий к заказу: дизайн, пожелания, аллергены. Если нечего добавить — напишите "-".');
    return;
  }

  if (data === 'order_yes') {
    createOrderFromSession(bot, chatId, session, userId).catch((err) => {
      console.error('Ошибка при создании заказа:', err);
      bot.sendMessage(chatId, 'Произошла ошибка при сохранении заказа. Попробуйте ещё раз через /start.');
    });
    return;
  }

  if (data === 'order_no') {
    resetSession(userId);
    bot.sendMessage(chatId, 'Заказ отменён. Если передумаете — нажмите /start.');
    return;
  }

  if (data === 'photo_done') {
    session.step = 'preview';
    sendPreview(bot, chatId, session);
    return;
  }

  if (data.startsWith('reschedule_order_')) {
    const orderId = Number(data.replace('reschedule_order_', ''));
    const order = orderService.getOrderById(orderId);
    if (!order || String(order.client_id) !== String(userId)) {
      bot.sendMessage(chatId, 'Заказ не найден.');
      resetSession(userId);
      return;
    }
    if (!canReschedule(order)) {
      bot.sendMessage(chatId, 'Перенос возможен не позднее чем за сутки до даты и времени выдачи. Сейчас уже поздно перенести этот заказ. Свяжитесь с кондитером напрямую.', keyboards.mainMenuKeyboard());
      resetSession(userId);
      return;
    }
    session.step = 'reschedule_date';
    session.rescheduleOrderId = orderId;
    session.rescheduleOldDate = order.delivery_date;
    session.rescheduleProductName = order.product_name || '—';
    bot.sendMessage(chatId, `Вы переносите заказ #${orderId} (${session.rescheduleProductName}) с ${dateUtils.formatDate(order.delivery_date)}. Выберите новую дату:`, keyboards.calendarKeyboard(dateUtils.todayStr()));
    return;
  }

  if (session.step === 'reschedule_date' && data.startsWith('date_')) {
    const dateStr = data.replace('date_', '');
    if (!orderService.isDateAvailable(dateStr, session.rescheduleOrderId)) {
      bot.sendMessage(chatId, `Дата ${dateUtils.formatDate(dateStr)} занята или недоступна. Выберите другую.`);
      return;
    }
    const result = orderService.rescheduleOrder(session.rescheduleOrderId, dateStr);
    if (!result.ok) {
      bot.sendMessage(chatId, 'Не удалось перенести заказ на эту дату. Попробуйте другую.', keyboards.mainMenuKeyboard());
      resetSession(userId);
      return;
    }
    const productName = session.rescheduleProductName || '—';
    bot.sendMessage(chatId, `Заказ #${session.rescheduleOrderId} (${productName}) перенесён с ${dateUtils.formatDate(session.rescheduleOldDate)} на ${dateUtils.formatDate(dateStr)}.`, keyboards.mainMenuKeyboard());
    notifyAdminReschedule(bot, session.rescheduleOrderId, session.rescheduleOldDate, dateStr, productName);
    resetSession(userId);
    return;
  }

  if (session.step === 'reschedule_date' && (data.startsWith('cal_next_') || data.startsWith('cal_prev_'))) {
    const baseDate = data.replace('cal_next_', '').replace('cal_prev_', '');
    bot.editMessageReplyMarkup(
      keyboards.calendarKeyboard(baseDate).reply_markup,
      { chat_id: chatId, message_id: query.message.message_id }
    );
    return;
  }
}

function handleMessage(bot, msg) {
  const userId = msg.from.id;
  const chatId = msg.chat.id;
  const session = getSession(userId);

  if (msg.text && msg.text.startsWith('/')) return;

  if (session.step === 'name') {
    if (!msg.text) return;
    session.clientName = msg.text.trim();
    session.step = 'phone';
    bot.sendMessage(chatId, 'Напишите ваш контактный телефон, чтобы мы могли связаться по заказу.');
    return;
  }

  if (session.step === 'phone') {
    if (!msg.text) return;
    session.phone = msg.text.trim();
    session.step = 'product';
    const products = orderService.getProducts();
    bot.sendMessage(chatId, `Спасибо, ${session.clientName}! Что хотите заказать? Выберите изделие:`, keyboards.productKeyboard(products));
    return;
  }

  if (session.step === 'time_custom') {
    if (!msg.text) return;
    const time = msg.text.trim();
    if (!/^\d{1,2}:\d{2}$/.test(time)) {
      bot.sendMessage(chatId, 'Пожалуйста, введите время в формате ЧЧ:ММ, например 14:30.');
      return;
    }
    session.deliveryTime = time;
    session.step = 'delivery_type';
    bot.sendMessage(chatId, 'Как получите заказ?', keyboards.deliveryTypeKeyboard());
    return;
  }

  if (session.step === 'address') {
    if (!msg.text) return;
    session.address = msg.text.trim();
    session.step = 'comment';
    bot.sendMessage(chatId, 'Напишите комментарий к заказу: дизайн, пожелания, аллергены. Если нечего добавить — напишите "-".');
    return;
  }

  if (session.step === 'comment') {
    if (!msg.text) return;
    session.comment = msg.text.trim() === '-' ? null : msg.text.trim();
    session.step = 'photos';
    bot.sendMessage(
      chatId,
      'Теперь можно прикрепить фото-примеры (до 5 штук). Когда закончите — нажмите "Готово".',
      {
        reply_markup: {
          inline_keyboard: [[{ text: 'Готово', callback_data: 'photo_done' }]],
        },
      }
    );
    return;
  }

  if (session.step === 'photos') {
    if (msg.photo && msg.photo.length > 0) {
      if (session.photos.length >= config.maxPhotosPerOrder) {
        bot.sendMessage(chatId, `Уже достигнут лимит в ${config.maxPhotosPerOrder} фото.`);
        return;
      }
      const largest = msg.photo[msg.photo.length - 1];
      session.photos.push({ fileId: largest.file_id, fileUniqueId: largest.file_unique_id });
      bot.sendMessage(chatId, `Фото ${session.photos.length}/${config.maxPhotosPerOrder} получено. Можно отправить ещё или нажать "Готово».`);
      return;
    }
    bot.sendMessage(chatId, 'На этом этапе нужно отправить фото или нажать "Готово".');
  }
}

async function createOrderFromSession(bot, chatId, session, userId) {
  console.log('Создание заказа:', { client_id: session.clientId, product_id: session.productId, date: session.deliveryDate });
  const result = orderService.createOrder({
    client_id: session.clientId,
    client_name: session.clientName,
    client_username: session.clientUsername,
    phone: session.phone,
    product_id: session.productId,
    product_name: session.productName,
    delivery_date: session.deliveryDate,
    delivery_time: session.deliveryTime,
    address: session.address,
    is_pickup: session.isPickup,
    comment: session.comment,
    status: 'создан',
  });

  if (!result.ok) {
    const altText = result.alternatives
      .map((d, i) => `${i + 1}. ${dateUtils.formatDate(d)}`)
      .join('\n');
    bot.sendMessage(chatId, `К сожалению, выбранная дата занялась. Ближайшие свободные даты:\n${altText}\n\nВыберите новую дату через /start.`);
    resetSession(userId);
    return;
  }

  const orderId = result.orderId;
  const uploadsDir = ensureUploadsDir();

  for (const photo of session.photos) {
    try {
      const file = await bot.getFile(photo.fileId);
      const ext = path.extname(file.file_path) || '.jpg';
      const localName = `${orderId}_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`;
      const localPath = path.join(uploadsDir, localName);
      const stream = bot.getFileStream(photo.fileId);
      const writeStream = fs.createWriteStream(localPath);
      stream.pipe(writeStream);
      await new Promise((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });
      orderService.addOrderPhoto(orderId, photo.fileId, localPath);
    } catch (err) {
      console.error('Ошибка сохранения фото:', err.message);
      orderService.addOrderPhoto(orderId, photo.fileId, null);
    }
  }

  resetSession(userId);
  bot.sendMessage(chatId, `Заказ #${orderId} создан! Скоро с вами свяжемся для подтверждения.`);
  console.log('Заказ создан:', orderId);

  notifyAdmin(bot, orderId);
}

function sendPreview(bot, chatId, session) {
  const text = [
    'Проверьте заказ:',
    `Имя: ${session.clientName}`,
    `Телефон: ${session.phone}`,
    `Изделие: ${session.productName}`,
    `Дата: ${dateUtils.formatDate(session.deliveryDate)}`,
    `Время: ${session.deliveryTime}`,
    `Получение: ${session.isPickup ? 'Самовывоз' : session.address}`,
    `Комментарий: ${session.comment || '-'}`,
    `Фото: ${session.photos.length}`,
  ].join('\n');

  bot.sendMessage(chatId, text, keyboards.yesNoKeyboard('order'));
}

function notifyAdmin(bot, orderId) {
  const order = orderService.getOrderById(orderId);
  if (!order || !config.adminTelegramId) return;

  const photos = orderService.getOrderPhotos(orderId);
  const text = [
    `🍰 Новый заказ #${orderId}`,
    `Изделие: ${order.product_name || '—'}`,
    `Клиент: ${order.client_name || '—'} @${order.client_username || '—'}`,
    `Телефон: ${order.phone || '—'}`,
    `Дата: ${dateUtils.formatDate(order.delivery_date)} ${order.delivery_time || ''}`,
    `Адрес: ${order.is_pickup ? 'Самовывоз' : order.address}`,
    `Комментарий: ${order.comment || '—'}`,
    `Фото: ${photos.length}`,
    `Статус: ${order.status}`,
  ].join('\n');

  bot.sendMessage(config.adminTelegramId, text);
}

function notifyAdminReschedule(bot, orderId, oldDate, newDate, productName) {
  if (!config.adminTelegramId) return;
  const text = [
    `🔄 Перенос заказа #${orderId}`,
    `Изделие: ${productName || '—'}`,
    `Старая дата: ${dateUtils.formatDate(oldDate)}`,
    `Новая дата: ${dateUtils.formatDate(newDate)}`,
  ].join('\n');
  bot.sendMessage(config.adminTelegramId, text);
}

module.exports = {
  startNewOrder,
  handleCallback,
  handleMessage,
  resetSession,
  getSession,
};

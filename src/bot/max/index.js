const { Bot, ImageAttachment } = require('@maxhub/max-bot-api');
const path = require('path');
const fs = require('fs');
const config = require('../../config');
const orderService = require('../../services/orderService');
const dateUtils = require('../../utils/date');
const keyboards = require('../../utils/maxKeyboard');

const sessions = new Map();
let bot = null;
let telegramNotifyBot = null;

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

function extractUserId(ctx) {
  return ctx.user ? String(ctx.user.id) : (ctx.chatId ? String(ctx.chatId) : null);
}

async function sendMainMenu(ctx) {
  resetSession(extractUserId(ctx));
  await ctx.reply('Привет! Я — помощник кондитера. Помогу записаться на тортик или другое изделие. Что выберете?', {
    attachments: [keyboards.maxMenuKeyboard()],
  });
}

function init(telegramBot) {
  if (telegramBot) telegramNotifyBot = telegramBot;

  if (!config.maxBotToken) {
    console.log('MAX-бот не запущен: не задан MAX_BOT_TOKEN.');
    return null;
  }

  bot = new Bot(config.maxBotToken);

  // Главное меню
  bot.action('start_order', async (ctx) => {
    const userId = extractUserId(ctx);
    const session = getSession(userId);
    session.step = 'name';
    session.clientId = userId;
    session.clientUsername = ctx.user?.username || '';
    session.photos = [];
    await ctx.reply('Как вас зовут? Напишите имя.');
  });

  bot.action('my_orders', async (ctx) => {
    const userId = extractUserId(ctx);
    const orders = orderService.getOrders(null, 50).filter((o) => String(o.client_id) === String(userId));
    if (!orders.length) {
      await ctx.reply('У вас пока нет заказов.', { attachments: [keyboards.maxMenuKeyboard()] });
      return;
    }
    const text = orders
      .map((o) => `#${o.id} ${dateUtils.formatDate(o.delivery_date)} ${o.delivery_time || ''} — ${o.product_name || '—'} (${o.status})`)
      .join('\n');
    await ctx.reply(`Ваши заказы:\n${text}\n\nЧтобы записаться снова, нажмите «📝 Записаться».`, {
      attachments: [keyboards.maxMenuKeyboard()],
    });
  });

  // Обработка сообщений
  bot.on('message_created', async (ctx) => {
    const userId = extractUserId(ctx);
    const chatId = ctx.chatId;
    const session = getSession(userId);
    const text = ctx.message?.body?.text?.trim();

    if (!text) return;

    if (session.step === 'name') {
      session.clientName = text;
      session.step = 'product';
      const products = orderService.getProducts();
      await ctx.reply(`Спасибо, ${session.clientName}! Что хотите заказать? Выберите изделие:`, {
        attachments: [keyboards.productKeyboard(products)],
      });
      return;
    }

    if (session.step === 'time_custom') {
      const time = text;
      if (!/^\d{1,2}:\d{2}$/.test(time)) {
        await ctx.reply('Пожалуйста, введите время в формате ЧЧ:ММ, например 14:30.');
        return;
      }
      session.deliveryTime = time;
      session.step = 'delivery_type';
      await ctx.reply('Как получите заказ?', { attachments: [keyboards.deliveryTypeKeyboard()] });
      return;
    }

    if (session.step === 'address') {
      session.address = text;
      session.step = 'phone';
      await ctx.reply('Напишите ваш контактный телефон, чтобы мы могли связаться по заказу.');
      return;
    }

    if (session.step === 'phone') {
      session.phone = text;
      session.step = 'comment';
      await ctx.reply('Напишите комментарий к заказу: дизайн, пожелания, аллергены. Если нечего добавить — напишите «-».');
      return;
    }

    if (session.step === 'comment') {
      session.comment = text === '-' ? null : text;
      session.step = 'photos';
      await ctx.reply('Теперь можно прикрепить фото-примеры (до 5 штук). Когда закончите — напишите «Готово».');
      return;
    }

    if (session.step === 'photos') {
      if (text.toLowerCase() === 'готово') {
        session.step = 'preview';
        await sendPreview(ctx, session);
        return;
      }
      await ctx.reply('На этом этапе отправьте фото или напишите «Готово».');
    }
  });

  // Обработка callback-кнопок
  bot.on('message_callback', async (ctx) => {
    const userId = extractUserId(ctx);
    const chatId = ctx.chatId;
    const session = getSession(userId);
    const data = ctx.callback?.payload || '';

    try {
      await ctx.answerOnCallback();
    } catch (err) {
      // игнорируем ошибки ответа на callback
    }

    if (data === 'start_order' || data === 'my_orders') return; // уже обработаны через bot.action

    if (data.startsWith('product_')) {
      const productId = Number(data.replace('product_', ''));
      const products = orderService.getProducts();
      const product = products.find((p) => p.id === productId);
      if (!product) {
        await ctx.reply('Продукт не найден. Начните заново.');
        return;
      }
      session.productId = productId;
      session.productName = product.name;

      if (product.name.trim().toLowerCase() === 'торт') {
        session.step = 'cake_type';
        await ctx.reply('Выберите вид торта:', { attachments: [keyboards.cakeTypeKeyboard(config.cakeTypes)] });
        return;
      }

      session.step = 'date';
      await ctx.reply(`Выбрано: ${product.name}. Теперь выберите дату:`, {
        attachments: [keyboards.calendarKeyboard(dateUtils.todayStr())],
      });
      return;
    }

    if (data.startsWith('cake_flavor_')) {
      const flavor = data.replace('cake_flavor_', '');
      session.cakeFlavor = flavor;
      session.productName = `${session.cakeName} (${flavor})`;
      session.step = 'cake_confirm_flavor';
      await ctx.reply(`Отлично: ${session.cakeName}, вкус ${flavor}. Подтверждаете?`, {
        attachments: [keyboards.flavorConfirmKeyboard(session.cakeIndex)],
      });
      return;
    }

    if (data === 'cake_confirm_yes') {
      session.step = 'date';
      const chosenName = session.cakeName || session.productName;
      const flavorText = session.cakeFlavor ? ` (${session.cakeFlavor})` : '';
      await ctx.reply(`Отличный выбор: ${chosenName}${flavorText}. Теперь выберите дату:`, {
        attachments: [keyboards.calendarKeyboard(dateUtils.todayStr())],
      });
      return;
    }

    if (data === 'cake_confirm_back') {
      session.cakeIndex = null;
      session.cakeName = null;
      session.cakeFlavor = null;
      session.step = 'cake_type';
      await ctx.reply('Выберите вид торта:', { attachments: [keyboards.cakeTypeKeyboard(config.cakeTypes)] });
      return;
    }

    if (data.startsWith('cake_')) {
      const cakeIndex = Number(data.replace('cake_', ''));
      const cake = config.cakeTypes[cakeIndex];
      if (!cake) {
        await ctx.reply('Торт не найден. Начните заново.');
        return;
      }
      session.cakeIndex = cakeIndex;
      session.cakeName = cake.name;
      session.productName = cake.name;
      session.cakeFlavor = null;
      session.step = 'cake_confirm';

      const caption = cake.flavors
        ? `Вы выбрали: ${cake.name}. Выберите вкус:`
        : `Вы выбрали: ${cake.name}. Подтверждаете?`;
      const keyboard = keyboards.cakeConfirmKeyboard(cake);

      if (cake.photoFile && fs.existsSync(cake.photoFile)) {
        try {
          const image = await bot.api.uploadImage({ source: path.resolve(cake.photoFile) });
          await ctx.reply(caption, { attachments: [image.toJson(), keyboard] });
        } catch (err) {
          console.error('Ошибка загрузки фото в MAX:', err.message);
          await ctx.reply(caption + '\n\n(Фото этого торта пока не добавлено)', { attachments: [keyboard] });
        }
      } else {
        await ctx.reply(caption, { attachments: [keyboard] });
      }
      return;
    }

    if (data.startsWith('cal_next_') || data.startsWith('cal_prev_')) {
      const baseDate = data.replace('cal_next_', '').replace('cal_prev_', '');
      await ctx.reply('Выберите дату:', { attachments: [keyboards.calendarKeyboard(baseDate)] });
      return;
    }

    if (data.startsWith('busy_')) {
      const dateStr = data.replace('busy_', '');
      await ctx.reply(`Дата ${dateUtils.formatDate(dateStr)} занята или недоступна. Пожалуйста, выберите другую.`);
      return;
    }

    if (data.startsWith('date_')) {
      const dateStr = data.replace('date_', '');
      if (!orderService.isDateAvailable(dateStr)) {
        await ctx.reply(`Дата ${dateUtils.formatDate(dateStr)} только что занялась. Выберите другую.`);
        return;
      }
      session.deliveryDate = dateStr;
      session.step = 'time';
      await ctx.reply('Выберите время доставки/выдачи:', { attachments: [keyboards.timeKeyboard()] });
      return;
    }

    if (data.startsWith('time_')) {
      if (data === 'time_custom') {
        session.step = 'time_custom';
        await ctx.reply('Напишите удобное время в формате ЧЧ:ММ, например 14:30');
        return;
      }
      const time = data.replace('time_', '');
      session.deliveryTime = time;
      session.step = 'delivery_type';
      await ctx.reply('Как получите заказ?', { attachments: [keyboards.deliveryTypeKeyboard()] });
      return;
    }

    if (data === 'delivery_type_delivery') {
      session.isPickup = false;
      session.step = 'address';
      await ctx.reply('Укажите адрес доставки (город, улица, дом, подъезд).');
      return;
    }

    if (data === 'delivery_type_pickup') {
      session.isPickup = true;
      session.address = 'Самовывоз';
      session.step = 'phone';
      await ctx.reply('Напишите ваш контактный телефон, чтобы мы могли связаться по заказу.');
      return;
    }

    if (data === 'order_yes') {
      try {
        await createOrderFromSession(ctx, session, userId);
      } catch (err) {
        console.error('Ошибка при создании заказа:', err);
        await ctx.reply('Произошла ошибка при сохранении заказа. Попробуйте ещё раз через /start.');
      }
      return;
    }

    if (data === 'order_no') {
      resetSession(userId);
      await ctx.reply('Заказ отменён. Если передумаете — нажмите «📝 Записаться».');
      return;
    }
  });

  // Обработка фото
  bot.on('message_created', async (ctx) => {
    const userId = extractUserId(ctx);
    const session = getSession(userId);
    if (session.step !== 'photos') return;

    const attachments = ctx.message?.body?.attachments || [];
    const imageAttachment = attachments.find((a) => a.type === 'image');
    if (!imageAttachment) return;

    if (session.photos.length >= config.maxPhotosPerOrder) {
      await ctx.reply(`Уже достигнут лимит в ${config.maxPhotosPerOrder} фото.`);
      return;
    }

    const imageToken = imageAttachment.payload?.token;
    if (imageToken) {
      session.photos.push({ fileId: imageToken, fileUniqueId: imageToken });
      await ctx.reply(`Фото ${session.photos.length}/${config.maxPhotosPerOrder} получено. Можно отправить ещё или написать «Готово».`);
    }
  });

  bot.start();
  console.log('MAX-бот запущен');
  return bot;
}

async function sendPreview(ctx, session) {
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

  await ctx.reply(text, { attachments: [keyboards.yesNoKeyboard('order')] });
}

async function createOrderFromSession(ctx, session, userId) {
  console.log('Создание MAX-заказа:', { client_id: session.clientId, product_id: session.productId, date: session.deliveryDate });
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
    await ctx.reply(`К сожалению, выбранная дата занялась. Ближайшие свободные даты:\n${altText}\n\nВыберите новую дату через /start.`);
    resetSession(userId);
    return;
  }

  const orderId = result.orderId;

  for (const photo of session.photos) {
    orderService.addOrderPhoto(orderId, photo.fileId, null);
  }

  resetSession(userId);
  await ctx.reply(`Заказ #${orderId} создан! Скоро с вами свяжемся для подтверждения.`);
  console.log('MAX-заказ создан:', orderId);

  notifyAdmin(orderId);
}

function notifyAdmin(orderId) {
  if (!telegramNotifyBot || !config.adminTelegramId) return;
  const order = orderService.getOrderById(orderId);
  if (!order) return;

  const photos = orderService.getOrderPhotos(orderId);
  const text = [
    `🍰 Новый заказ #${orderId} (MAX)`,
    `Изделие: ${order.product_name || '—'}`,
    `Клиент: ${order.client_name || '—'} @${order.client_username || '—'}`,
    `Телефон: ${order.phone || '—'}`,
    `Дата: ${dateUtils.formatDate(order.delivery_date)} ${order.delivery_time || ''}`,
    `Адрес: ${order.is_pickup ? 'Самовывоз' : order.address}`,
    `Комментарий: ${order.comment || '—'}`,
    `Фото: ${photos.length}`,
    `Статус: ${order.status}`,
  ].join('\n');

  telegramNotifyBot.sendMessage(config.adminTelegramId, text);
}

module.exports = { init };

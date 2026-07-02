const keyboards = require('../../utils/keyboard');
const orderService = require('../../services/orderService');

const adminStates = new Map();

function getAdminState(userId) {
  return adminStates.get(userId) || { action: 'idle' };
}

function setAdminState(userId, state) {
  adminStates.set(userId, state);
}

function resetAdminState(userId) {
  adminStates.set(userId, { action: 'idle' });
}

function formatOrderShort(order) {
  const date = orderService.formatDate(order.delivery_date);
  const time = order.delivery_time || '—';
  const product = order.product_name || '—';
  const client = order.client_name || order.client_username || `id${order.client_id}`;
  const phone = order.phone || '—';
  const status = order.status || '—';
  return `${date} ${time}\n${product}\n${client}\n${phone}\nЗаказ #${order.id}\n${status}`;
}

function formatOrderFull(order) {
  const lines = [
    `Заказ #${order.id}`,
    `Статус: ${order.status}`,
    '',
    `👤 Клиент: ${order.client_name || order.client_username || `id${order.client_id}`}`,
  ];
  if (order.phone) lines.push(`📞 Телефон: ${order.phone}`);
  if (order.client_username) lines.push(`💬 Telegram: @${order.client_username}`);
  lines.push(
    `🎂 Изделие: ${order.product_name || '—'}`,
    `📅 Дата: ${orderService.formatDate(order.delivery_date)}`,
    `⏰ Время: ${order.delivery_time || '—'}`,
    order.is_pickup ? '🔁 Способ получения: самовывоз' : `📍 Адрес: ${order.address || '—'}`,
  );
  if (order.comment) lines.push(`💬 Комментарий: ${order.comment}`);
  lines.push('', `Создан: ${order.created_at}`);
  return lines.join('\n');
}

async function showAdminPanel(bot, chatId, userId) {
  resetAdminState(userId);
  await bot.sendMessage(chatId, 'Привет! Это панель кондитера. Выберите действие:', keyboards.mainMenuKeyboard(true));
}

async function showOrdersList(bot, chatId) {
  const orders = orderService.getOrders(null, 50);
  if (!orders.length) {
    await bot.sendMessage(chatId, 'Заказов пока нет.', keyboards.mainMenuKeyboard(true));
    return;
  }
  for (let i = 0; i < orders.length; i += 5) {
    const chunk = orders.slice(i, i + 5);
    const text = chunk.map(formatOrderShort).join('\n\n');
    await bot.sendMessage(chatId, text, keyboards.mainMenuKeyboard(true));
  }
}

async function askSearchByName(bot, chatId, userId) {
  setAdminState(userId, { action: 'search_name' });
  await bot.sendMessage(chatId, 'Введите имя клиента или его часть:', keyboards.mainMenuKeyboard(true));
}

async function askSearchByPhone(bot, chatId, userId) {
  setAdminState(userId, { action: 'search_phone' });
  await bot.sendMessage(chatId, 'Введите номер телефона клиента:', keyboards.mainMenuKeyboard(true));
}

async function askDeleteOrder(bot, chatId, userId) {
  setAdminState(userId, { action: 'delete_order' });
  await bot.sendMessage(chatId, 'Введите номер заказа, который нужно удалить:', keyboards.mainMenuKeyboard(true));
}

async function askRescheduleOrder(bot, chatId, userId) {
  setAdminState(userId, { action: 'reschedule_order_number' });
  await bot.sendMessage(chatId, 'Введите номер заказа, который нужно перенести:', keyboards.mainMenuKeyboard(true));
}

async function handleAdminMessage(bot, msg, userId) {
  const chatId = msg.chat.id;
  const text = msg.text ? msg.text.trim() : '';
  const state = getAdminState(userId);

  if (state.action === 'search_name') {
    resetAdminState(userId);
    if (!text) {
      await bot.sendMessage(chatId, 'Имя не может быть пустым.', keyboards.mainMenuKeyboard(true));
      return;
    }
    const orders = orderService.searchOrdersByClientName(text, 50);
    if (!orders.length) {
      await bot.sendMessage(chatId, `Не нашла заказов по имени «${text}».`, keyboards.mainMenuKeyboard(true));
      return;
    }
    const textOut = orders.map(formatOrderFull).join('\n\n────────────\n\n');
    await bot.sendMessage(chatId, textOut, keyboards.mainMenuKeyboard(true));
    return;
  }

  if (state.action === 'search_phone') {
    resetAdminState(userId);
    if (!text) {
      await bot.sendMessage(chatId, 'Номер телефона не может быть пустым.', keyboards.mainMenuKeyboard(true));
      return;
    }
    const orders = orderService.searchOrdersByPhone(text, 50);
    if (!orders.length) {
      await bot.sendMessage(chatId, `Не нашла заказов по номеру «${text}».`, keyboards.mainMenuKeyboard(true));
      return;
    }
    const textOut = orders.map(formatOrderFull).join('\n\n────────────\n\n');
    await bot.sendMessage(chatId, textOut, keyboards.mainMenuKeyboard(true));
    return;
  }

  if (state.action === 'delete_order') {
    const orderId = parseInt(text, 10);
    if (!orderId || orderId <= 0) {
      await bot.sendMessage(chatId, 'Введите, пожалуйста, корректный номер заказа.', keyboards.mainMenuKeyboard(true));
      return;
    }
    const order = orderService.getOrderById(orderId);
    if (!order) {
      resetAdminState(userId);
      await bot.sendMessage(chatId, `Заказ #${orderId} не найден.`, keyboards.mainMenuKeyboard(true));
      return;
    }
    orderService.deleteOrder(orderId);
    resetAdminState(userId);
    await bot.sendMessage(chatId, `Заказ #${orderId} удалён из активного списка.`, keyboards.mainMenuKeyboard(true));
    return;
  }

  if (state.action === 'reschedule_order_number') {
    const orderId = parseInt(text, 10);
    if (!orderId || orderId <= 0) {
      await bot.sendMessage(chatId, 'Введите, пожалуйста, корректный номер заказа.', keyboards.mainMenuKeyboard(true));
      return;
    }
    const order = orderService.getOrderById(orderId);
    if (!order) {
      resetAdminState(userId);
      await bot.sendMessage(chatId, `Заказ #${orderId} не найден.`, keyboards.mainMenuKeyboard(true));
      return;
    }
    setAdminState(userId, { action: 'reschedule_order_date', orderId });
    await bot.sendMessage(
      chatId,
      `Заказ #${orderId} — ${order.product_name || '—'} на ${orderService.formatDate(order.delivery_date)} ${order.delivery_time || ''}.\n\nВведите новую дату в формате ГГГГ-ММ-ДД:`,
      keyboards.mainMenuKeyboard(true)
    );
    return;
  }

  if (state.action === 'reschedule_order_date') {
    const newDate = text;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
      await bot.sendMessage(chatId, 'Дата должна быть в формате ГГГГ-ММ-ДД. Попробуйте ещё раз:', keyboards.mainMenuKeyboard(true));
      return;
    }
    const result = orderService.rescheduleOrder(state.orderId, newDate);
    resetAdminState(userId);
    if (!result.ok) {
      if (result.error === 'not_found') {
        await bot.sendMessage(chatId, 'Заказ не найден.', keyboards.mainMenuKeyboard(true));
      } else if (result.error === 'cancelled') {
        await bot.sendMessage(chatId, 'Этот заказ отменён, переносить нельзя.', keyboards.mainMenuKeyboard(true));
      } else if (result.error === 'date_unavailable') {
        const alternatives = result.alternatives.map(orderService.formatDate).join(', ');
        await bot.sendMessage(chatId, `Эта дата недоступна.\nБлижайшие свободные даты: ${alternatives || 'нет'}`, keyboards.mainMenuKeyboard(true));
      } else {
        await bot.sendMessage(chatId, 'Не удалось перенести заказ.', keyboards.mainMenuKeyboard(true));
      }
      return;
    }
    await bot.sendMessage(chatId, `Заказ #${result.orderId} перенесён на ${orderService.formatDate(newDate)}.`, keyboards.mainMenuKeyboard(true));
  }
}

module.exports = {
  showAdminPanel,
  showOrdersList,
  askSearchByName,
  askSearchByPhone,
  askDeleteOrder,
  askRescheduleOrder,
  handleAdminMessage,
  getAdminState,
  resetAdminState,
};

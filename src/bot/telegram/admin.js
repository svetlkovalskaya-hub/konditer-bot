const orderService = require('../../services/orderService');
const dateUtils = require('../../utils/date');
const config = require('../../config');

function isAdmin(bot, msg, next) {
  if (!orderService.isAdmin(msg.from.id)) {
    bot.sendMessage(msg.chat.id, 'Эта команда только для администратора.');
    return;
  }
  next();
}

function register(bot) {
  bot.onText(/\/addproduct/, (msg) => {
    isAdmin(bot, msg, () => {
      bot.sendMessage(msg.chat.id, 'Напишите название продукта. Можно сразу с описанием через |, например:\nТорт|Классический торт на заказ');
      const handler = (reply) => {
        if (reply.from.id !== msg.from.id || !reply.text || reply.text.startsWith('/')) return;
        bot.removeListener('message', handler);
        const [name, description] = reply.text.split('|').map((s) => s.trim());
        if (!name) {
          bot.sendMessage(msg.chat.id, 'Название не может быть пустым. Попробуйте /addproduct ещё раз.');
          return;
        }
        orderService.addProduct(name, description || null);
        bot.sendMessage(msg.chat.id, `Продукт «${name}» добавлен.`);
      };
      bot.on('message', handler);
    });
  });

  bot.onText(/\/products/, (msg) => {
    isAdmin(bot, msg, () => {
      const products = orderService.getProducts(false);
      if (!products.length) {
        bot.sendMessage(msg.chat.id, 'Пока нет продуктов.');
        return;
      }
      const text = products
        .map((p) => `${p.is_active ? '✅' : '⏸'} ${p.id}. ${p.name}${p.description ? ` — ${p.description}` : ''}`)
        .join('\n');
      bot.sendMessage(msg.chat.id, `Каталог:\n${text}`);
    });
  });

  bot.onText(/\/orders/, (msg) => {
    isAdmin(bot, msg, () => {
      const orders = orderService.getOrders(null, 20);
      if (!orders.length) {
        bot.sendMessage(msg.chat.id, 'Нет заказов.');
        return;
      }
      const text = orders
        .map((o) => `#${o.id} ${dateUtils.formatDate(o.delivery_date)} ${o.delivery_time || ''} — ${o.product_name || '—'} (${o.status})`)
        .join('\n');
      bot.sendMessage(msg.chat.id, `Последние заказы:\n${text}\n\nДля деталей: /order N`);
    });
  });

  bot.onText(/\/order (\d+)/, (msg, match) => {
    isAdmin(bot, msg, () => {
      const orderId = Number(match[1]);
      const order = orderService.getOrderById(orderId);
      if (!order) {
        bot.sendMessage(msg.chat.id, `Заказ #${orderId} не найден.`);
        return;
      }
      const photos = orderService.getOrderPhotos(orderId);
      const text = [
        `Заказ #${order.id}`,
        `Статус: ${order.status}`,
        `Изделие: ${order.product_name || '—'}`,
        `Клиент: ${order.client_name || '—'} @${order.client_username || '—'} ID: ${order.client_id}`,
        `Дата: ${dateUtils.formatDate(order.delivery_date)} ${order.delivery_time || ''}`,
        `Адрес: ${order.is_pickup ? 'Самовывоз' : order.address}`,
        `Комментарий: ${order.comment || '—'}`,
        `Фото: ${photos.length}`,
      ].join('\n');

      bot.sendMessage(msg.chat.id, text);

      for (const photo of photos) {
        if (photo.file_id) {
          bot.sendPhoto(msg.chat.id, photo.file_id);
        }
      }
    });
  });

  bot.onText(/\/confirm (\d+)/, (msg, match) => {
    isAdmin(bot, msg, () => {
      const orderId = Number(match[1]);
      orderService.updateOrderStatus(orderId, 'confirmed');
      bot.sendMessage(msg.chat.id, `Заказ #${orderId} подтверждён.`);
      notifyClient(bot, orderId, 'Ваш заказ подтверждён!');
    });
  });

  bot.onText(/\/cancel (\d+)/, (msg, match) => {
    isAdmin(bot, msg, () => {
      const orderId = Number(match[1]);
      orderService.updateOrderStatus(orderId, 'cancelled');
      bot.sendMessage(msg.chat.id, `Заказ #${orderId} отменён.`);
      notifyClient(bot, orderId, 'К сожалению, ваш заказ отменён. Свяжитесь с нами, если это ошибка.');
    });
  });

  bot.onText(/\/reschedule (\d+) (\d{4}-\d{2}-\d{2})/, (msg, match) => {
    isAdmin(bot, msg, () => {
      const orderId = Number(match[1]);
      const newDate = match[2];
      const result = orderService.rescheduleOrder(orderId, newDate);
      if (!result.ok) {
        if (result.error === 'not_found') {
          bot.sendMessage(msg.chat.id, `Заказ #${orderId} не найден.`);
        } else if (result.error === 'cancelled') {
          bot.sendMessage(msg.chat.id, 'Нельзя перенести отменённый заказ.');
        } else if (result.error === 'date_unavailable') {
          const altText = result.alternatives
            .map((d, i) => `${i + 1}. ${dateUtils.formatDate(d)}`)
            .join('\n');
          bot.sendMessage(msg.chat.id, `Дата ${dateUtils.formatDate(newDate)} занята. Альтернативы:\n${altText}`);
        }
        return;
      }
      bot.sendMessage(msg.chat.id, `Заказ #${orderId} перенесён на ${dateUtils.formatDate(newDate)}.`);
      notifyClient(bot, orderId, `Ваш заказ перенесён на ${dateUtils.formatDate(newDate)}.`);
    });
  });

  bot.onText(/\/blockdate( .+)?/, (msg, match) => {
    isAdmin(bot, msg, () => {
      const rest = match[1] ? match[1].trim() : '';
      const [dateStr, ...reasonParts] = rest.split(' ');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        bot.sendMessage(msg.chat.id, 'Формат: /blockdate YYYY-MM-DD [причина]');
        return;
      }
      const reason = reasonParts.join(' ') || null;
      const result = orderService.blockDate(dateStr, reason);
      if (!result.ok) {
        bot.sendMessage(msg.chat.id, `Дата ${dateUtils.formatDate(dateStr)} уже заблокирована.`);
        return;
      }
      bot.sendMessage(msg.chat.id, `Дата ${dateUtils.formatDate(dateStr)} заблокирована.`);
    });
  });

  bot.onText(/\/unblockdate (\d{4}-\d{2}-\d{2})/, (msg, match) => {
    isAdmin(bot, msg, () => {
      const dateStr = match[1];
      const result = orderService.unblockDate(dateStr);
      bot.sendMessage(
        msg.chat.id,
        result.ok
          ? `Дата ${dateUtils.formatDate(dateStr)} разблокирована.`
          : `Дата ${dateUtils.formatDate(dateStr)} не была заблокирована.`
      );
    });
  });

  bot.onText(/\/blocked/, (msg) => {
    isAdmin(bot, msg, () => {
      const dates = orderService.getBlockedDates();
      if (!dates.length) {
        bot.sendMessage(msg.chat.id, 'Нет заблокированных дат.');
        return;
      }
      const text = dates.map((d) => `${dateUtils.formatDate(d.date)}${d.reason ? ` — ${d.reason}` : ''}`).join('\n');
      bot.sendMessage(msg.chat.id, `Заблокированные даты:\n${text}`);
    });
  });

  bot.onText(/\/setadmin (\d+)/, (msg, match) => {
    if (!config.adminTelegramId || String(msg.from.id) !== config.adminTelegramId) {
      bot.sendMessage(msg.chat.id, 'Только первый админ может назначать других админов.');
      return;
    }
    const telegramId = match[1];
    orderService.setAdmin(telegramId);
    bot.sendMessage(msg.chat.id, `Администратор ${telegramId} добавлен.`);
  });
}

function notifyClient(bot, orderId, text) {
  const order = orderService.getOrderById(orderId);
  if (!order) return;
  bot.sendMessage(order.client_id, text).catch((err) => {
    console.error('Не удалось уведомить клиента:', err.message);
  });
}

module.exports = { register };

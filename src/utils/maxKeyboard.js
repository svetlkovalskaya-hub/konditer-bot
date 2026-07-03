const { Keyboard } = require('@maxhub/max-bot-api');
const dateUtils = require('./date');
const orderService = require('../services/orderService');

function toMaxInlineKeyboard(rows) {
  if (!rows || !rows.length) return null;
  const maxRows = rows.map((row) =>
    row.map((btn) => Keyboard.button.callback(btn.text, btn.callback_data))
  );
  return Keyboard.inlineKeyboard(maxRows);
}

function maxMenuKeyboard() {
  return Keyboard.inlineKeyboard([
    [Keyboard.button.callback('📝 Записаться', 'start_order')],
    [Keyboard.button.callback('📋 Мои заказы', 'my_orders')],
  ]);
}

function productKeyboard(products) {
  const rows = products.map((p) => [{ text: p.name, callback_data: `product_${p.id}` }]);
  return toMaxInlineKeyboard(rows);
}

function cakeTypeKeyboard(cakeTypes) {
  const rows = cakeTypes.map((c, i) => [{ text: c.name, callback_data: `cake_${i}` }]);
  return toMaxInlineKeyboard(rows);
}

function calendarKeyboard(baseDateStr) {
  const days = dateUtils.generateCalendarDays(baseDateStr, 21);
  const rows = [];
  let currentRow = [];

  days.forEach((dateStr, index) => {
    const available = orderService.isDateAvailable(dateStr);
    const label = available ? dateUtils.formatDate(dateStr) : `❌ ${dateUtils.formatDate(dateStr)}`;
    const callback = available ? `date_${dateStr}` : `busy_${dateStr}`;
    currentRow.push({ text: label, callback_data: callback });
    if (currentRow.length === 3 || index === days.length - 1) {
      rows.push(currentRow);
      currentRow = [];
    }
  });

  rows.push([
    { text: '←', callback_data: `cal_prev_${dateUtils.addDays(baseDateStr, -21)}` },
    { text: '→', callback_data: `cal_next_${dateUtils.addDays(baseDateStr, 21)}` },
  ]);

  return toMaxInlineKeyboard(rows);
}

function timeKeyboard() {
  const times = [
    '10:00', '11:00', '12:00', '13:00', '14:00',
    '15:00', '16:00', '17:00', '18:00', '19:00',
  ];
  const rows = [];
  let currentRow = [];
  times.forEach((t, i) => {
    currentRow.push({ text: t, callback_data: `time_${t}` });
    if (currentRow.length === 3 || i === times.length - 1) {
      rows.push(currentRow);
      currentRow = [];
    }
  });
  rows.push([{ text: 'Другое время', callback_data: 'time_custom' }]);
  return toMaxInlineKeyboard(rows);
}

function deliveryTypeKeyboard() {
  return toMaxInlineKeyboard([
    [{ text: '🚚 Доставка', callback_data: 'delivery_type_delivery' }],
    [{ text: '🏠 Самовывоз', callback_data: 'delivery_type_pickup' }],
  ]);
}

function yesNoKeyboard(prefix) {
  return toMaxInlineKeyboard([
    [
      { text: 'Да', callback_data: `${prefix}_yes` },
      { text: 'Нет', callback_data: `${prefix}_no` },
    ],
  ]);
}

function cakeConfirmKeyboard(cake) {
  const flavorButtons = Array.isArray(cake.flavors)
    ? cake.flavors.map((f) => [{ text: `☑️ ${f}`, callback_data: `cake_flavor_${f}` }])
    : [];
  const confirmButton = cake.flavors
    ? []
    : [[{ text: '✅ Подтверждаю', callback_data: 'cake_confirm_yes' }]];

  return toMaxInlineKeyboard([
    ...flavorButtons,
    ...confirmButton,
    [{ text: '← Назад к списку', callback_data: 'cake_confirm_back' }],
  ]);
}

function flavorConfirmKeyboard(cakeIndex) {
  return toMaxInlineKeyboard([
    [{ text: '✅ Подтверждаю', callback_data: 'cake_confirm_yes' }],
    [{ text: '← Назад', callback_data: `cake_${cakeIndex}` }],
  ]);
}

module.exports = {
  maxMenuKeyboard,
  productKeyboard,
  cakeTypeKeyboard,
  calendarKeyboard,
  timeKeyboard,
  deliveryTypeKeyboard,
  yesNoKeyboard,
  cakeConfirmKeyboard,
  flavorConfirmKeyboard,
};

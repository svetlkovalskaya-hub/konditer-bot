const dateUtils = require('./date');
const orderService = require('../services/orderService');

function productKeyboard(products) {
  return {
    reply_markup: {
      inline_keyboard: products.map((p) => [
        { text: p.name, callback_data: `product_${p.id}` },
      ]),
    },
  };
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

  return {
    reply_markup: {
      inline_keyboard: rows,
    },
  };
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

  return {
    reply_markup: {
      inline_keyboard: rows,
    },
  };
}

function deliveryTypeKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🚚 Доставка', callback_data: 'delivery_type_delivery' }],
        [{ text: '🏠 Самовывоз', callback_data: 'delivery_type_pickup' }],
      ],
    },
  };
}

function yesNoKeyboard(prefix) {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: 'Да', callback_data: `${prefix}_yes` },
          { text: 'Нет', callback_data: `${prefix}_no` },
        ],
      ],
    },
  };
}

function mainMenuKeyboard(isAdmin = false) {
  if (isAdmin) {
    return {
      reply_markup: {
        keyboard: [
          [{ text: '📋 Список заказов' }, { text: '🔍 Поиск по имени' }],
        ],
        resize_keyboard: true,
        one_time_keyboard: false,
      },
    };
  }
  return {
    reply_markup: {
      keyboard: [
        [{ text: '📝 Записаться' }, { text: '📋 Мои заказы' }],
        [{ text: '🔄 Перенести запись' }],
      ],
      resize_keyboard: true,
      one_time_keyboard: false,
    },
  };
}

function removeKeyboard() {
  return {
    reply_markup: {
      remove_keyboard: true,
    },
  };
}

module.exports = {
  productKeyboard,
  calendarKeyboard,
  timeKeyboard,
  deliveryTypeKeyboard,
  yesNoKeyboard,
  mainMenuKeyboard,
  removeKeyboard,
};

// MAX-бот: заглушка для будущего подключения.
// Когда появится API MAX, здесь будет его инициализация и обработка сообщений.
// Бизнес-логика уже вынесена в src/services/orderService.js.

const orderService = require('../../services/orderService');
const dateUtils = require('../../utils/date');

function init() {
  console.log('MAX-бот не подключён. Это заглушка.');
  console.log('Доступные функции общей логики:');
  console.log('- orderService.createOrder(...)');
  console.log('- orderService.rescheduleOrder(orderId, newDate)');
  console.log('- orderService.getProducts()');
  return {
    isPlaceholder: true,
    orderService,
    dateUtils,
  };
}

module.exports = { init };

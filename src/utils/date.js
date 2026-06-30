function todayStr() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDate(dateStr) {
  const [y, m, d] = dateStr.split('-');
  return `${d}.${m}.${y}`;
}

function parseDate(dateStr) {
  return new Date(dateStr + 'T00:00:00');
}

function addDays(dateStr, days) {
  const date = parseDate(dateStr);
  date.setDate(date.getDate() + days);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function generateCalendarDays(baseDateStr, daysCount = 14) {
  const result = [];
  const today = todayStr();
  let current = parseDate(baseDateStr);
  for (let i = 0; i < daysCount; i++) {
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, '0');
    const d = String(current.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;
    if (dateStr >= today) {
      result.push(dateStr);
    }
    current.setDate(current.getDate() + 1);
  }
  return result;
}

module.exports = {
  todayStr,
  formatDate,
  parseDate,
  addDays,
  generateCalendarDays,
};

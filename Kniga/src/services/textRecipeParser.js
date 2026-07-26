const NUMBER_EMOJIS = /[0123456789]️?⃣/g;
const BULLET_EMOJIS = /[🔹🔸✅⬜️🔘▪️▫️◾️◽️•]/g;

function cleanLine(line) {
  return line
    .replace(NUMBER_EMOJIS, '')
    .replace(BULLET_EMOJIS, '')
    .replace(/^\s*[-–—.]\s*/, '')
    .replace(/^\d+[).]\s*/, '')
    .trim();
}

function cleanRecipeTitle(value) {
  if (!value || typeof value !== 'string') return '';
  return value
    .replace(/[:\-–—]\s*рецепт/gi, '')
    .replace(/рецепт\s*[:\-–—]/gi, '')
    .replace(/рецепт/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*[:\-–—]\s*$/, '')
    .trim();
}

function parseOcrRecipeText(text) {
  const result = {
    title: null,
    ingredients: null,
    instructions: null,
    portions: null,
  };

  if (!text || !text.trim()) return result;

  const lines = text.split('\n').map((s) => s.trim()).filter(Boolean);
  if (!lines.length) return result;

  result.title = cleanRecipeTitle(lines[0]);

  const ingredients = [];
  const instructions = [];

  const prepIndex = lines.findIndex((line) => /^приготовление/i.test(line));
  const ingMarkerIndex = lines.findIndex((line) => /^(ингредиенты|состав|продукты|что понадобится)/i.test(line));

  if (prepIndex !== -1) {
    const ingStart = ingMarkerIndex !== -1 && ingMarkerIndex < prepIndex ? ingMarkerIndex + 1 : 1;
    for (let i = ingStart; i < prepIndex; i++) {
      const cleaned = cleanLine(lines[i]);
      if (cleaned) ingredients.push(cleaned);
    }
    for (let i = prepIndex + 1; i < lines.length; i++) {
      const cleaned = cleanLine(lines[i]);
      if (cleaned) instructions.push(cleaned);
    }
  } else if (ingMarkerIndex !== -1) {
    for (let i = ingMarkerIndex + 1; i < lines.length; i++) {
      const cleaned = cleanLine(lines[i]);
      if (cleaned) ingredients.push(cleaned);
    }
  } else {
    // Без маркеров — остаток текста как инструкции
    result.instructions = lines.slice(1).join('\n') || text;
  }

  if (ingredients.length) result.ingredients = ingredients.join('\n');
  if (instructions.length) {
    result.instructions = instructions.map((s, i) => `${i + 1}. ${s}`).join('\n\n');
  }

  return result;
}

module.exports = { parseOcrRecipeText };

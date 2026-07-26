const config = require('../config');

// Смайлы-цифры, которые часто используются в рецептах VK вместо номеров пунктов
const NUMBER_EMOJIS = /[0123456789]️?⃣/g;
const BULLET_EMOJIS = /[🔹🔸✅⬜️🔘▪️▫️◾️◽️]/g;

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

function findDishTitleInLines(lines) {
  // Ищем короткую строку без цифр, без вопросов, без ссылок — похоже на название блюда
  for (const line of lines.slice(1)) {
    const cleaned = cleanLine(line);
    if (!cleaned) continue;
    if (/\?|http|www|\.ru|\.com|подписк|канал|групп|автор|репост/i.test(cleaned)) continue;
    if (/^\d/.test(cleaned)) continue;
    if (cleaned.length < 80 && cleaned.length > 3) {
      return cleaned;
    }
  }
  return null;
}

const INGREDIENT_UNITS = /(\d+[,.]?\d*)\s*(г|кг|мл|л|ст\s*л|ст\.\s*л|ч\s*л|ч\.\s*л|щепотка|капля|шт|штук|пучок|головк|зубчик|стакан|ложек|ложки|ложка|грамм|миллилитр|литр|по\s*вкусу|щепот|долька|кусочек|пакетик|банк|бухан|батон|лист|листов|стебел|веточек|ветка|горсть|звездоч|горошин|кружок|стакана|яйц|яйца|яйцо)/i;

function looksLikeIngredient(line) {
  return INGREDIENT_UNITS.test(line);
}

function parseVkWallUrl(url) {
  const match = url.match(/vk\.(ru|com)\/wall(-?\d+)_(\d+)/i);
  if (!match) return null;
  return {
    ownerId: match[2],
    postId: match[3],
  };
}

function isVkUrl(url) {
  return /vk\.(ru|com)\/wall/i.test(url);
}

async function parseVkPost(url) {
  if (!config.vkServiceToken) {
    throw new Error('VK_SERVICE_TOKEN не задан. Добавь его в .env, чтобы читать посты VK.');
  }

  const parsed = parseVkWallUrl(url);
  if (!parsed) {
    throw new Error('Не удалось распознать ссылку на пост VK. Ожидается формат: https://vk.com/wall-123_456 или https://vk.ru/wall-123_456');
  }

  const apiUrl = `https://api.vk.com/method/wall.getById?posts=${parsed.ownerId}_${parsed.postId}&extended=1&access_token=${config.vkServiceToken}&v=5.199`;

  let data;
  try {
    const response = await fetch(apiUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    data = await response.json();
  } catch (err) {
    throw new Error(`Ошибка запроса к VK API: ${err.message}`);
  }

  if (data.error) {
    throw new Error(`VK API ошибка: ${data.error.error_msg || JSON.stringify(data.error)}`);
  }

  const post = data.response?.items?.[0];
  if (!post) {
    throw new Error('VK не вернул пост. Возможно, он удалён или группа закрыта.');
  }

  const result = {
    title: null,
    ingredients: null,
    instructions: null,
    imageUrl: null,
    sourceUrl: url,
    portions: null,
    isDraft: false,
  };

  const attachments = post.attachments || [];
  const videoAttachment = attachments.find((a) => a.type === 'video');

  let text = post.text || '';

  // Если пост пустой, но есть видео-клип — берём описание из видео
  if (!text.trim() && videoAttachment && videoAttachment.video) {
    text = videoAttachment.video.description || '';
    result.isDraft = true;
  }

  if (text) {
    const lines = text.split('\n').map((s) => s.trim()).filter(Boolean);

    // Для клипов VK первая строка часто — вопрос/подводка, а не название блюда.
    // Ищем название блюда среди строк, а если не нашли — берём первую строку.
    if (result.isDraft) {
      result.title = cleanRecipeTitle(findDishTitleInLines(lines)) || cleanRecipeTitle(lines[0]) || 'Рецепт из VK';
    } else {
      result.title = cleanRecipeTitle(lines[0]) || 'Рецепт из VK';
    }

    const ingredients = [];
    const instructions = [];

    // Ищем ключевые заголовки: "Приготовление" и маркеры ингредиентов
    const prepIndex = lines.findIndex((line) => /^приготовление/i.test(line));
    const ingMarkerIndex = lines.findIndex((line) => /^(ингредиенты|состав|продукты|что понадобится)/i.test(line));

    if (prepIndex !== -1) {
      // Всё между заголовком (или маркером ингредиентов) и "Приготовление" — ингредиенты
      const ingStart = ingMarkerIndex !== -1 && ingMarkerIndex < prepIndex ? ingMarkerIndex + 1 : 1;
      for (let i = ingStart; i < prepIndex; i++) {
        const cleaned = cleanLine(lines[i]);
        if (cleaned) ingredients.push(cleaned);
      }

      // Всё после "Приготовление" — инструкции
      for (let i = prepIndex + 1; i < lines.length; i++) {
        const cleaned = cleanLine(lines[i]);
        if (cleaned) instructions.push(cleaned);
      }
    } else if (ingMarkerIndex !== -1) {
      // Есть маркер ингредиентов, но нет раздела приготовления — собираем всё в ингредиенты
      for (let i = ingMarkerIndex + 1; i < lines.length; i++) {
        const cleaned = cleanLine(lines[i]);
        if (cleaned) ingredients.push(cleaned);
      }
    } else {
      // Ни заголовков ни маркеров — пробуем угадать по формату:
      // строки с количеством и единицей измерения считаем ингредиентами,
      // остальное — инструкции.
      const body = lines.slice(1);
      const titleLine = result.isDraft ? cleanRecipeTitle(findDishTitleInLines(body) || lines[0]) : null;

      let titleFoundIndex = -1;
      if (titleLine) {
        titleFoundIndex = body.findIndex((line) => cleanLine(line) === titleLine);
      }

      const startFrom = titleFoundIndex !== -1 ? titleFoundIndex + 1 : 0;
      const candidateBody = body.slice(startFrom);

      for (const line of candidateBody) {
        const cleaned = cleanLine(line);
        if (!cleaned) continue;
        if (result.isDraft && cleaned === titleLine) continue;
        if (looksLikeIngredient(cleaned)) {
          ingredients.push(cleaned);
        } else {
          instructions.push(cleaned);
        }
      }

      if (!ingredients.length && !instructions.length) {
        result.instructions = lines.slice(1).join('\n') || text;
      }
    }

    if (ingredients.length) result.ingredients = ingredients.join('\n');
    if (instructions.length) {
      result.instructions = instructions.map((s, i) => `${i + 1}. ${s}`).join('\n\n');
    }
  }

  // Картинка из поста или обложка видео
  const photoAttachment = attachments.find((a) => a.type === 'photo');
  if (photoAttachment && photoAttachment.photo) {
    const sizes = photoAttachment.photo.sizes || [];
    const best = sizes
      .filter((s) => s.url)
      .sort((a, b) => (b.width || 0) - (a.width || 0))[0];
    if (best) result.imageUrl = best.url;
  } else if (videoAttachment && videoAttachment.video) {
    const images = videoAttachment.video.image || [];
    const best = images
      .filter((s) => s.url)
      .sort((a, b) => (b.width || 0) - (a.width || 0))[0];
    if (best) result.imageUrl = best.url;
  }

  return result;
}

module.exports = {
  isVkUrl,
  parseVkPost,
};

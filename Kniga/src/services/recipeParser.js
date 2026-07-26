const cheerio = require('cheerio');

if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

function stripHtml(value) {
  if (!value || typeof value !== 'string') return '';
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toAbsoluteUrl(value, baseUrl) {
  if (!value) return null;
  let url = value;
  if (Array.isArray(url)) url = url[0];
  if (url && typeof url === 'object') url = url.url;
  if (!url || typeof url !== 'string') return null;
  try {
    return new URL(url, baseUrl).href;
  } catch {
    return url;
  }
}

function extractRecipeSchema($) {
  const scripts = $('script[type="application/ld+json"]').toArray();
  for (const el of scripts) {
    let data;
    try {
      const text = $(el).text().trim();
      if (!text) continue;
      data = JSON.parse(text);
    } catch {
      continue;
    }

    const candidates = Array.isArray(data)
      ? data
      : data['@graph']
        ? data['@graph']
        : [data];

    for (const item of candidates) {
      if (!item || !item['@type']) continue;
      const types = Array.isArray(item['@type']) ? item['@type'] : [item['@type']];
      if (types.includes('Recipe')) return item;
    }
  }
  return null;
}

function flattenHowToSteps(raw) {
  if (!raw) return [];

  if (typeof raw === 'string') {
    return raw
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  if (!Array.isArray(raw)) return [];

  const result = [];
  for (const item of raw) {
    if (typeof item === 'string') {
      if (item.trim()) result.push(item.trim());
      continue;
    }
    if (!item || typeof item !== 'object') continue;

    const type = Array.isArray(item['@type']) ? item['@type'] : [item['@type']];

    if (type.includes('HowToSection') && Array.isArray(item.itemListElement)) {
      result.push(...flattenHowToSteps(item.itemListElement));
    } else {
      const text = item.text || item.name || item.description || '';
      if (text.trim()) result.push(text.trim());
    }
  }

  return result;
}

function normalizeInstructions(recipe) {
  const steps = flattenHowToSteps(recipe.recipeInstructions);
  if (!steps.length) return null;
  return steps.map((s, i) => `${i + 1}. ${stripHtml(s)}`).join('\n');
}

function normalizeIngredients(recipe) {
  const raw = recipe.recipeIngredient;
  if (!raw) return null;
  const arr = Array.isArray(raw) ? raw : [raw];
  return arr
    .map((s) => (typeof s === 'string' ? stripHtml(s) : ''))
    .filter(Boolean)
    .join('\n');
}

function findSectionItems($, keywords) {
  const items = [];
  $('h1, h2, h3, h4, h5, h6').each((_, el) => {
    const headingText = $(el).text().trim().toLowerCase();
    if (!keywords.some((k) => headingText.includes(k))) return;

    let next = $(el).next();
    while (next.length && items.length < 50) {
      const tag = (next.prop('tagName') || '').toLowerCase();
      if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) break;

      if (['ul', 'ol'].includes(tag)) {
        next.find('li').each((__, li) => {
          const text = $(li).text().trim();
          if (text) items.push(text);
        });
      } else if (['p', 'div'].includes(tag)) {
        const text = next.text().trim();
        if (text) items.push(text);
      }
      next = next.next();
    }
  });
  return items;
}

function heuristicIngredients($) {
  const items = findSectionItems($, ['ингредиенты', 'ингредиент']);
  if (!items.length) return null;
  return items.map((s) => stripHtml(s)).filter(Boolean).join('\n');
}

function heuristicInstructions($) {
  const items = findSectionItems($, ['приготовление', 'способ приготовления', 'пошагово', 'готовим', 'инструкция']);
  if (!items.length) return null;
  return items.map((s, i) => `${i + 1}. ${stripHtml(s)}`).filter((s) => !/^\d+\.$/.test(s)).join('\n');
}

async function parseRecipe(url) {
  const result = {
    title: null,
    ingredients: null,
    instructions: null,
    imageUrl: null,
    sourceUrl: url,
    portions: null,
  };

  let html;
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        Accept: 'text/html',
      },
    });
    if (!response.ok) {
      throw new Error(`Сайт вернул ошибку ${response.status}`);
    }
    html = await response.text();
  } catch (err) {
    throw new Error(`Не удалось открыть ссылку: ${err.message}`);
  }

  const $ = cheerio.load(html);

  const ogTitle =
    $('meta[property="og:title"]').attr('content') ||
    $('meta[name="twitter:title"]').attr('content');
  const ogImage =
    $('meta[property="og:image"]').attr('content') ||
    $('meta[name="twitter:image"]').attr('content');
  const ogDesc =
    $('meta[property="og:description"]').attr('content') ||
    $('meta[name="description"]').attr('content');
  const h1 = $('h1').first().text().trim();

  const recipe = extractRecipeSchema($);

  if (recipe) {
    result.title = stripHtml(recipe.name) || ogTitle || h1 || null;
    result.ingredients = normalizeIngredients(recipe);
    result.instructions = normalizeInstructions(recipe);
    result.imageUrl = toAbsoluteUrl(recipe.image, url) || toAbsoluteUrl(ogImage, url);
    result.portions = recipe.recipeYield ? String(recipe.recipeYield) : null;
  }

  // Fallback, если schema.org не дал данных
  if (!result.title) result.title = ogTitle || h1 || null;
  if (!result.imageUrl) result.imageUrl = toAbsoluteUrl(ogImage, url);
  if (!result.ingredients) result.ingredients = heuristicIngredients($);
  if (!result.instructions) result.instructions = heuristicInstructions($) || ogDesc || null;

  return result;
}

module.exports = { parseRecipe };

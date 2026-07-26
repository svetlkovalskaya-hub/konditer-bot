const { Bot, ImageAttachment } = require('@maxhub/max-bot-api');
const path = require('path');
const fs = require('fs');
const config = require('../../config');
const recipeService = require('../../services/recipeService');
const recipeParser = require('../../services/recipeParser');
const vkParser = require('../../services/vkParser');
const ocrService = require('../../services/ocrService');
const { parseOcrRecipeText } = require('../../services/textRecipeParser');
const keyboards = require('./keyboards');
const session = require('./session');

const RECIPES_PER_PAGE = 5;
let bot = null;

function extractUserId(ctx) {
  return ctx.user ? String(ctx.user.id) : ctx.chatId ? String(ctx.chatId) : null;
}

function isUrl(text) {
  return /^https?:\/\//i.test(text);
}

function getImageUrlFromMessage(ctx) {
  const attachments = ctx.message?.body?.attachments || [];
  const image = attachments.find((a) => a.type === 'image');
  if (!image) return null;
  return image.payload?.url || null;
}

function formatRecipeText(recipe) {
  const lines = [];
  lines.push(`📖 ${recipe.title || 'Без названия'}`);
  if (recipe.portions) lines.push(`🍽 Порций: ${recipe.portions}`);
  if (recipe.ingredients) {
    lines.push(`\n🥕 Ингредиенты:\n${recipe.ingredients}`);
  }
  if (recipe.instructions) {
    lines.push(`\n👩‍🍳 Приготовление:\n${recipe.instructions}`);
  }
  if (recipe.source_url) {
    lines.push(`\n🔗 Источник: ${recipe.source_url}`);
  }
  return lines.join('\n');
}

function splitText(text, limit = 3800) {
  const chunks = [];
  let current = '';
  for (const line of text.split('\n')) {
    if ((current + '\n' + line).length > limit && current) {
      chunks.push(current.trim());
      current = line;
    } else {
      current = current ? current + '\n' + line : line;
    }
  }
  if (current) chunks.push(current.trim());
  return chunks;
}

function formatRecipeForEdit(recipe) {
  const lines = [
    'Название: ' + (recipe.title || ''),
    '',
    'Ингредиенты:',
    recipe.ingredients || '',
    '',
    'Приготовление:',
    recipe.instructions || '',
    '',
    'Порции: ' + (recipe.portions || '-'),
  ];
  return lines.join('\n');
}

function parseFullRecipeEdit(text) {
  const markers = {
    title: 'Название:',
    ingredients: 'Ингредиенты:',
    instructions: 'Приготовление:',
    portions: 'Порции:',
  };

  const positions = {};
  for (const [field, marker] of Object.entries(markers)) {
    const idx = text.indexOf(marker);
    if (idx !== -1) positions[field] = idx;
  }

  if (!positions.title && !positions.ingredients && !positions.instructions) {
    return null;
  }

  const sortedFields = Object.keys(positions).sort((a, b) => positions[a] - positions[b]);
  const result = {};

  for (let i = 0; i < sortedFields.length; i++) {
    const field = sortedFields[i];
    const start = positions[field] + markers[field].length;
    const end = i + 1 < sortedFields.length ? positions[sortedFields[i + 1]] : text.length;
    let value = text.slice(start, end).trim();

    if (field === 'title' || field === 'portions') {
      value = value.replace(/\n/g, ' ').trim();
    }
    if (field === 'portions' && value === '-') {
      value = null;
    }
    if (value) result[field] = value;
  }

  return result;
}

async function uploadImageFromUrl(imageUrl) {
  if (!imageUrl) return null;
  try {
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        Accept: 'image/webp,image/apng,image/*,*/*',
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length) return null;

    const parsedUrl = new URL(imageUrl);
    const ext = path.extname(parsedUrl.pathname) || '.jpg';
    const tmpName = `recipe-img-${Date.now()}${ext}`;
    const tmpPath = path.join(config.uploadsDir, tmpName);
    fs.writeFileSync(tmpPath, buffer);

    const uploaded = await bot.api.uploadImage({ source: tmpPath });
    try {
      fs.unlinkSync(tmpPath);
    } catch {}
    return uploaded;
  } catch (err) {
    console.error('Ошибка загрузки фото рецепта:', err.message);
    return null;
  }
}

function createImageAttachment(recipe) {
  if (recipe.image_path) {
    return new ImageAttachment({ token: recipe.image_path });
  }
  if (recipe.image_url) {
    return new ImageAttachment({ url: recipe.image_url });
  }
  return null;
}

async function sendRecipeCard(ctx, recipe) {
  const text = formatRecipeText(recipe);
  const chunks = splitText(text);
  const image = createImageAttachment(recipe) || (await uploadImageFromUrl(recipe.image_url));

  if (image && chunks.length === 1) {
    await ctx.reply(chunks[0], { attachments: [image.toJson(), keyboards.recipeCardActions(recipe.id)] });
    return;
  }

  if (image) {
    await ctx.reply('Фото блюда:', { attachments: [image.toJson()] });
  }

  for (let i = 0; i < chunks.length; i++) {
    const isLast = i === chunks.length - 1;
    const kb = isLast ? keyboards.recipeCardActions(recipe.id) : null;
    await ctx.reply(chunks[i], kb ? { attachments: [kb] } : {});
  }
}

async function sendPreview(ctx, draft) {
  const text = formatRecipeText({
    title: draft.title,
    portions: draft.portions,
    ingredients: draft.ingredients,
    instructions: draft.instructions,
    source_url: draft.source_url,
  });

  const chunks = splitText(text);
  const image = draft.image_url ? await uploadImageFromUrl(draft.image_url) : null;

  if (image && chunks.length === 1) {
    await ctx.reply(chunks[0], { attachments: [image.toJson(), keyboards.previewActions()] });
    return;
  }

  if (image) {
    await ctx.reply('Фото блюда:', { attachments: [image.toJson()] });
  }

  for (let i = 0; i < chunks.length; i++) {
    const isLast = i === chunks.length - 1;
    const kb = isLast ? keyboards.previewActions() : null;
    await ctx.reply(chunks[i], kb ? { attachments: [kb] } : {});
  }
}

async function showRecipeList(ctx, userId, page = 0) {
  const total = recipeService.countRecipesByUser(userId);
  const totalPages = Math.ceil(total / RECIPES_PER_PAGE) || 1;
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const recipes = recipeService.getRecipesByUser(userId, RECIPES_PER_PAGE, safePage * RECIPES_PER_PAGE);

  if (!recipes.length) {
    await ctx.reply('У тебя пока нет сохранённых рецептов. Добавь первый!', {
      attachments: [keyboards.mainMenu()],
    });
    return;
  }

  await ctx.reply(`📚 Твои рецепты (${total}):`, {
    attachments: [keyboards.recipeList(recipes, safePage, totalPages)],
  });
}

async function saveDraft(ctx, userId) {
  const s = session.getSession(userId);
  const draft = s.draft || {};

  if (!draft.title) {
    await ctx.reply('Название обязательно. Начни заново.', { attachments: [keyboards.mainMenu()] });
    session.resetSession(userId);
    return;
  }

  const result = recipeService.createRecipe({
    user_id: userId,
    title: draft.title,
    source_url: draft.source_url || null,
    image_url: draft.image_url || null,
    image_path: draft.image_path || null,
    ingredients: draft.ingredients || null,
    instructions: draft.instructions || null,
    portions: draft.portions || null,
  });

  session.resetSession(userId);
  await ctx.reply(`✅ Рецепт «${draft.title}» сохранён (#${result.id}).`, {
    attachments: [keyboards.mainMenu()],
  });
}

async function sendShoppingList(ctx, recipe) {
  if (!recipe.ingredients) {
    await ctx.reply('В этом рецепте нет списка ингредиентов.', {
      attachments: [keyboards.recipeCardActions(recipe.id)],
    });
    return;
  }

  const lines = recipe.ingredients
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `🔹 ${line}`);

  const header = `🛒 Список покупок: ${recipe.title}`;
  const footer = recipe.source_url ? `\n\n🔗 Источник: ${recipe.source_url}` : '';
  const text = [header, ...lines, footer].join('\n');

  await ctx.reply(text, { attachments: [keyboards.recipeCardActions(recipe.id)] });
}

async function handleShoplistMenu(ctx, userId) {
  const recipes = recipeService.getRecipesByUser(userId, 50, 0);
  if (!recipes.length) {
    await ctx.reply('Сначала сохрани хотя бы один рецепт.', { attachments: [keyboards.mainMenu()] });
    return;
  }
  await ctx.reply('Выбери рецепт для списка покупок:', {
    attachments: [keyboards.shoplistMenu(recipes)],
  });
}

async function sendMainMenu(ctx, header = 'Главное меню') {
  const userId = extractUserId(ctx);
  if (userId) session.resetSession(userId);
  await ctx.reply(`${header}\n\nЧто будем делать?`, { attachments: [keyboards.mainMenu()] });
}

function init() {
  if (!config.maxRecipeBotToken) {
    console.log('MAX-бот рецептов не запущен: не задан MAX_RECIPE_BOT_TOKEN.');
    return null;
  }

  bot = new Bot(config.maxRecipeBotToken);

  bot.on('message_created', async (ctx) => {
    const userId = extractUserId(ctx);
    if (!userId) return;

    const s = session.getSession(userId);
    const text = (ctx.message?.body?.text || '').trim();
    const attachments = ctx.message?.body?.attachments || [];
    const imageAttachment = attachments.find((a) => a.type === 'image');

    if (text === '/start') {
      await sendMainMenu(ctx);
      return;
    }

    // Режим ожидания скриншота
    if (s.mode === 'await_screenshot') {
      const imageUrl = getImageUrlFromMessage(ctx);
      if (!imageUrl) {
        await ctx.reply('Пришли, пожалуйста, картинку со скриншотом рецепта.');
        return;
      }

      await ctx.reply('Распознаю текст на скриншоте...');
      try {
        const rawText = await ocrService.recognizeText(imageUrl, config.uploadsDir);
        const parsed = parseOcrRecipeText(rawText);

        s.draft = {
          title: parsed.title,
          source_url: null,
          image_url: imageUrl,
          ingredients: parsed.ingredients,
          instructions: parsed.instructions,
          portions: parsed.portions,
        };
        s.mode = 'preview';

        if (!parsed.title && !parsed.ingredients && !parsed.instructions) {
          await ctx.reply('Не удалось распознать текст на скриншоте. Попробуй другую картинку или добавь рецепт вручную.', {
            attachments: [keyboards.mainMenu()],
          });
          session.resetSession(userId);
          return;
        }

        await ctx.reply('Текст распознан. Проверь и, если нужно, отредактируй перед сохранением.');
        await sendPreview(ctx, s.draft);
      } catch (err) {
        console.error('Ошибка OCR:', err.message);
        await ctx.reply(`Не удалось распознать скриншот: ${err.message}\n\nПопробуй добавить рецепт вручную.`, {
          attachments: [keyboards.mainMenu()],
        });
        session.resetSession(userId);
      }
      return;
    }

    // Режим ожидания ссылки
    if (s.mode === 'await_link') {
      if (!isUrl(text)) {
        await ctx.reply('Это не похоже на ссылку. Пришли URL рецепта, начинающийся с http:// или https://');
        return;
      }

      await ctx.reply('Секунду, смотрю, что там на сайте...');
      try {
        const parsed = vkParser.isVkUrl(text)
          ? await vkParser.parseVkPost(text)
          : await recipeParser.parseRecipe(text);
        s.draft = {
          title: parsed.title,
          source_url: parsed.sourceUrl,
          image_url: parsed.imageUrl,
          ingredients: parsed.ingredients,
          instructions: parsed.instructions,
          portions: parsed.portions,
        };
        s.mode = 'preview';
        await sendPreview(ctx, s.draft);
      } catch (err) {
        console.error('Ошибка парсинга рецепта:', err.message);
        await ctx.reply(`Не удалось распарсить ссылку: ${err.message}\n\nПопробуй добавить рецепт вручную.`, {
          attachments: [keyboards.mainMenu()],
        });
        session.resetSession(userId);
      }
      return;
    }

    // Ручное добавление
    if (s.mode === 'manual') {
      if (s.step === 'title') {
        s.draft.title = text;
        s.step = 'ingredients';
        await ctx.reply('Напиши ингредиенты списком (каждый с новой строки).');
        return;
      }

      if (s.step === 'ingredients') {
        s.draft.ingredients = text;
        s.step = 'instructions';
        await ctx.reply('Напиши способ приготовления.');
        return;
      }

      if (s.step === 'instructions') {
        s.draft.instructions = text;
        s.step = 'portions';
        await ctx.reply('Сколько порций? (напиши «-», если не знаешь)');
        return;
      }

      if (s.step === 'portions') {
        s.draft.portions = text === '-' ? null : text;
        s.step = 'source';
        await ctx.reply('Ссылка на источник? (напиши «-», если нет)');
        return;
      }

      if (s.step === 'source') {
        s.draft.source_url = text === '-' || !isUrl(text) ? null : text;
        s.step = 'photo';
        await ctx.reply('Пришли ссылку на фото блюда или напиши «-».');
        return;
      }

      if (s.step === 'photo') {
        if (isUrl(text)) {
          s.draft.image_url = text;
        } else if (imageAttachment?.payload?.token) {
          s.draft.image_path = imageAttachment.payload.token;
        }
        await saveDraft(ctx, userId);
        return;
      }
    }

    // Поиск
    if (s.mode === 'search') {
      if (!text) {
        await ctx.reply('Напиши запрос для поиска.');
        return;
      }

      const recipes =
        s.searchType === 'ingredient'
          ? recipeService.searchByIngredient(userId, text, 20)
          : recipeService.searchByTitle(userId, text, 20);

      session.resetSession(userId);

      if (!recipes.length) {
        await ctx.reply('Ничего не нашлось. Попробуй другой запрос.', { attachments: [keyboards.mainMenu()] });
        return;
      }

      await ctx.reply(`Нашла ${recipes.length} рецепт(ов):`, {
        attachments: [keyboards.recipeList(recipes, 0, 1)],
      });
      return;
    }

    // Редактирование поля
    if (s.mode === 'edit_field' && s.recipeId) {
      const field = s.step;
      if (!field) {
        await ctx.reply('Что именно редактировать?', { attachments: [keyboards.mainMenu()] });
        return;
      }

      let value = text;
      if ((field === 'source_url' || field === 'image_url') && text && !isUrl(text)) {
        await ctx.reply('Нужна ссылка, начинающаяся с http:// или https://. Попробуй ещё раз.');
        return;
      }

      if (text === '-') value = null;
      const update = {};
      update[field] = value;

      const result = recipeService.updateRecipe(s.recipeId, userId, update);
      session.resetSession(userId);

      if (!result.ok) {
        await ctx.reply('Не удалось обновить рецепт. Попробуй ещё раз.', { attachments: [keyboards.mainMenu()] });
        return;
      }

      const recipe = recipeService.getRecipeByIdAndUser(s.recipeId, userId);
      await ctx.reply('✅ Сохранено.');
      if (recipe) await sendRecipeCard(ctx, recipe);
      else await sendMainMenu(ctx);
      return;
    }

    // Редактирование всего рецепта сразу
    if (s.mode === 'edit_all') {
      const parsed = parseFullRecipeEdit(text);
      if (!parsed) {
        await ctx.reply('Не получилось распознать формат. Сохрани названия разделов: Название:, Ингредиенты:, Приготовление:, Порции:.');
        return;
      }

      // Редактируем черновик перед сохранением
      if (s.draft && !s.recipeId) {
        Object.assign(s.draft, parsed);
        s.mode = 'preview';
        await sendPreview(ctx, s.draft);
        return;
      }

      // Редактируем уже сохранённый рецепт
      if (s.recipeId) {
        const result = recipeService.updateRecipe(s.recipeId, userId, parsed);
        session.resetSession(userId);

        if (!result.ok) {
          await ctx.reply('Не удалось обновить рецепт. Попробуй ещё раз.', { attachments: [keyboards.mainMenu()] });
          return;
        }

        const recipe = recipeService.getRecipeByIdAndUser(s.recipeId, userId);
        await ctx.reply('✅ Рецепт обновлён.');
        if (recipe) await sendRecipeCard(ctx, recipe);
        else await sendMainMenu(ctx);
      }
      return;
    }

    // По умолчанию: если прислали картинку — предлагаем распознать
    const imageUrl = getImageUrlFromMessage(ctx);
    if (imageUrl) {
      session.setMode(userId, 'await_screenshot');
      await ctx.reply('Хочешь добавить рецепт по скриншоту? Пришли эту же картинку ещё раз или нажми "📸 Добавить по скриншоту" в меню, и я распознаю текст.');
      return;
    }

    // По умолчанию: если прислали ссылку — сразу парсим
    if (isUrl(text)) {
      session.setMode(userId, 'await_link');
      await ctx.reply('Секунду, смотрю, что там на сайте...');
      try {
        const parsed = vkParser.isVkUrl(text)
          ? await vkParser.parseVkPost(text)
          : await recipeParser.parseRecipe(text);
        console.log('PARSED RECIPE:', JSON.stringify(parsed, null, 2));
        const s2 = session.getSession(userId);
        s2.draft = {
          title: parsed.title,
          source_url: parsed.sourceUrl,
          image_url: parsed.imageUrl,
          ingredients: parsed.ingredients,
          instructions: parsed.instructions,
          portions: parsed.portions,
        };
        s2.mode = 'preview';
        if (parsed.isDraft) {
          await ctx.reply('⚠️ VK не отдал полное описание клипа. Я собрала черновик из того, что есть. Дополни и отредактируй перед сохранением.');
        }
        await sendPreview(ctx, s2.draft);
      } catch (err) {
        console.error('FULL PARSE ERROR:', err.stack || err.message);
        console.error('Ошибка парсинга рецепта:', err.message);
        await ctx.reply(`Не удалось распарсить ссылку: ${err.message}\n\nПопробуй добавить рецепт вручную.`, {
          attachments: [keyboards.mainMenu()],
        });
        session.resetSession(userId);
      }
      return;
    }

    await sendMainMenu(ctx, 'Не поняла команду');
  });

  bot.on('message_callback', async (ctx) => {
    const userId = extractUserId(ctx);
    if (!userId) return;

    const data = ctx.callback?.payload || '';
    try {
      await ctx.answerOnCallback();
    } catch {
      // игнорируем
    }

    if (data === 'menu') {
      await sendMainMenu(ctx);
      return;
    }

    if (data === 'myrecipes') {
      await showRecipeList(ctx, userId, 0);
      return;
    }

    if (data.startsWith('recipe_page_')) {
      const page = Number(data.replace('recipe_page_', ''));
      await showRecipeList(ctx, userId, page);
      return;
    }

    if (data.startsWith('recipe_open_')) {
      const id = Number(data.replace('recipe_open_', ''));
      const recipe = recipeService.getRecipeByIdAndUser(id, userId);
      if (!recipe) {
        await ctx.reply('Рецепт не найден.', { attachments: [keyboards.mainMenu()] });
        return;
      }
      await sendRecipeCard(ctx, recipe);
      return;
    }

    if (data.startsWith('recipe_editmenu_')) {
      const id = Number(data.replace('recipe_editmenu_', ''));
      const recipe = recipeService.getRecipeByIdAndUser(id, userId);
      if (!recipe) {
        await ctx.reply('Рецепт не найден.', { attachments: [keyboards.mainMenu()] });
        return;
      }
      await ctx.reply('Выбери способ редактирования:', {
        attachments: [keyboards.editMenu(id)],
      });
      return;
    }

    if (data.startsWith('recipe_edit_all_')) {
      const id = Number(data.replace('recipe_edit_all_', ''));
      const recipe = recipeService.getRecipeByIdAndUser(id, userId);
      if (!recipe) {
        await ctx.reply('Рецепт не найден.', { attachments: [keyboards.mainMenu()] });
        return;
      }
      session.setMode(userId, 'edit_all', { recipeId: id });
      await ctx.reply(
        `Отредактируй рецепт ниже и пришли обратно. Не меняй названия разделов — я по ним разберу текст.`,
      );
      await ctx.reply(formatRecipeForEdit(recipe));
      return;
    }

    if (data.startsWith('recipe_edit_')) {
      const id = Number(data.replace('recipe_edit_', ''));
      const recipe = recipeService.getRecipeByIdAndUser(id, userId);
      if (!recipe) {
        await ctx.reply('Рецепт не найден.', { attachments: [keyboards.mainMenu()] });
        return;
      }
      await ctx.reply(`Что исправляем в рецепте «${recipe.title}»?`, {
        attachments: [keyboards.editFieldMenu(id)],
      });
      return;
    }

    if (data.startsWith('edit_field_')) {
      const parts = data.replace('edit_field_', '').split('_');
      const field = parts.pop();
      const id = Number(parts.join('_'));
      if (!id || !field) return;

      session.setMode(userId, 'edit_field', { recipeId: id, step: field });

      const labels = {
        title: 'Напиши новое название.',
        ingredients: 'Напиши новый список ингредиентов.',
        instructions: 'Напиши новый способ приготовления.',
        portions: 'Напиши количество порций (или «-»).',
        source_url: 'Напиши новую ссылку на источник (или «-»).',
        image_url: 'Напиши новую ссылку на фото (или «-»).',
      };
      await ctx.reply(labels[field] || 'Напиши новое значение.');
      return;
    }

    if (data.startsWith('recipe_shop_')) {
      const id = Number(data.replace('recipe_shop_', ''));
      const recipe = recipeService.getRecipeByIdAndUser(id, userId);
      if (!recipe) {
        await ctx.reply('Рецепт не найден.', { attachments: [keyboards.mainMenu()] });
        return;
      }
      await sendShoppingList(ctx, recipe);
      return;
    }

    if (data === 'shoplist') {
      await handleShoplistMenu(ctx, userId);
      return;
    }

    if (data.startsWith('recipe_delete_')) {
      const id = Number(data.replace('recipe_delete_', ''));
      const recipe = recipeService.getRecipeByIdAndUser(id, userId);
      if (!recipe) {
        await ctx.reply('Рецепт не найден.', { attachments: [keyboards.mainMenu()] });
        return;
      }
      await ctx.reply(`Удалить рецепт «${recipe.title}»?`, {
        attachments: [keyboards.confirmDelete(id)],
      });
      return;
    }

    if (data.startsWith('delete_confirm_')) {
      const id = Number(data.replace('delete_confirm_', ''));
      const result = recipeService.deleteRecipe(id, userId);
      if (!result.ok) {
        await ctx.reply('Не удалось удалить рецепт.', { attachments: [keyboards.mainMenu()] });
        return;
      }
      await ctx.reply('🗑 Рецепт удалён.', { attachments: [keyboards.mainMenu()] });
      return;
    }

    if (data === 'add_link') {
      session.setMode(userId, 'await_link');
      await ctx.reply('Пришли ссылку на рецепт.');
      return;
    }

    if (data === 'add_screenshot') {
      session.setMode(userId, 'await_screenshot');
      await ctx.reply('Пришли скриншот рецепта. Я распознаю текст и соберу черновик.');
      return;
    }

    if (data === 'add_manual') {
      session.setMode(userId, 'manual', { step: 'title' });
      await ctx.reply('Напиши название блюда.');
      return;
    }

    if (data === 'search') {
      await ctx.reply('Искать по:', { attachments: [keyboards.searchMenu()] });
      return;
    }

    if (data === 'search_title') {
      session.setMode(userId, 'search', { searchType: 'title' });
      await ctx.reply('Напиши название блюда или его часть.');
      return;
    }

    if (data === 'search_ingredient') {
      session.setMode(userId, 'search', { searchType: 'ingredient' });
      await ctx.reply('Напиши ингредиент, который должен быть в рецепте.');
      return;
    }

    if (data === 'preview_save') {
      await saveDraft(ctx, userId);
      return;
    }

    if (data === 'preview_edit') {
      const s = session.getSession(userId);
      if (!s.draft) {
        await ctx.reply('Нечего редактировать. Начни сначала.', { attachments: [keyboards.mainMenu()] });
        return;
      }
      session.setMode(userId, 'edit_all', { draft: s.draft });
      await ctx.reply(
        `Отредактируй рецепт ниже и пришли обратно. Не меняй названия разделов — я по ним разберу текст.`,
      );
      await ctx.reply(formatRecipeForEdit(s.draft));
      return;
    }
  });

  bot.start();
  console.log('MAX-бот рецептов запущен');
  return bot;
}

module.exports = { init };

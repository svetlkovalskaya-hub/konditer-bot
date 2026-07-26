const { Keyboard } = require('@maxhub/max-bot-api');

function toInline(rows) {
  if (!rows || !rows.length) return null;
  return Keyboard.inlineKeyboard(
    rows.map((row) =>
      row.map((btn) => Keyboard.button.callback(btn.text, btn.callback_data))
    )
  );
}

function mainMenu() {
  return toInline([
    [{ text: '📚 Мои рецепты', callback_data: 'myrecipes' }],
    [{ text: '➕ Добавить рецепт по ссылке', callback_data: 'add_link' }],
    [{ text: '📸 Добавить по скриншоту', callback_data: 'add_screenshot' }],
    [{ text: '✍️ Добавить рецепт вручную', callback_data: 'add_manual' }],
    [
      { text: '🔍 Поиск', callback_data: 'search' },
      { text: '🛒 Список покупок', callback_data: 'shoplist' },
    ],
  ]);
}

function backToMenu() {
  return toInline([[{ text: '« В меню', callback_data: 'menu' }]]);
}

function searchMenu() {
  return toInline([
    [{ text: '🔍 По названию', callback_data: 'search_title' }],
    [{ text: '🥕 По ингредиенту', callback_data: 'search_ingredient' }],
    [{ text: '« Назад', callback_data: 'menu' }],
  ]);
}

function recipeList(recipes, page, totalPages) {
  const rows = recipes.map((r) => [
    { text: r.title || `Рецепт #${r.id}`, callback_data: `recipe_open_${r.id}` },
  ]);

  const nav = [];
  if (page > 0) nav.push({ text: '←', callback_data: `recipe_page_${page - 1}` });
  if (totalPages > 1) nav.push({ text: `${page + 1}/${totalPages}`, callback_data: 'noop' });
  if (page + 1 < totalPages) nav.push({ text: '→', callback_data: `recipe_page_${page + 1}` });
  if (nav.length) rows.push(nav);

  rows.push([{ text: '« В меню', callback_data: 'menu' }]);
  return toInline(rows);
}

function recipeCardActions(recipeId) {
  return toInline([
    [
      { text: '✏️ Редактировать', callback_data: `recipe_editmenu_${recipeId}` },
      { text: '🛒 Список покупок', callback_data: `recipe_shop_${recipeId}` },
    ],
    [
      { text: '🗑 Удалить', callback_data: `recipe_delete_${recipeId}` },
      { text: '« К списку', callback_data: 'myrecipes' },
    ],
  ]);
}

function editMenu(recipeId) {
  return toInline([
    [{ text: '✏️ По частям', callback_data: `recipe_edit_${recipeId}` }],
    [{ text: '📝 Весь рецепт сразу', callback_data: `recipe_edit_all_${recipeId}` }],
    [{ text: '« Назад к рецепту', callback_data: `recipe_open_${recipeId}` }],
  ]);
}

function editFieldMenu(recipeId) {
  return toInline([
    [{ text: 'Название', callback_data: `edit_field_${recipeId}_title` }],
    [{ text: 'Ингредиенты', callback_data: `edit_field_${recipeId}_ingredients` }],
    [{ text: 'Способ приготовления', callback_data: `edit_field_${recipeId}_instructions` }],
    [{ text: 'Порции', callback_data: `edit_field_${recipeId}_portions` }],
    [{ text: 'Ссылка на источник', callback_data: `edit_field_${recipeId}_source_url` }],
    [
      { text: '📷 Заменить фото', callback_data: `edit_field_${recipeId}_image` },
      { text: '🗑 Удалить фото', callback_data: `recipe_clear_image_${recipeId}` },
    ],
    [{ text: '« Назад к рецепту', callback_data: `recipe_open_${recipeId}` }],
  ]);
}

function previewActions() {
  return toInline([
    [
      { text: '💾 Сохранить', callback_data: 'preview_save' },
      { text: '✏️ Редактировать', callback_data: 'preview_edit' },
    ],
    [{ text: '« Отмена', callback_data: 'menu' }],
  ]);
}

function confirmDelete(recipeId) {
  return toInline([
    [
      { text: '✅ Да, удалить', callback_data: `delete_confirm_${recipeId}` },
      { text: '« Отмена', callback_data: `recipe_open_${recipeId}` },
    ],
  ]);
}

function shoplistMenu(recipes) {
  const rows = recipes.slice(0, 50).map((r) => [
    { text: r.title || `Рецепт #${r.id}`, callback_data: `recipe_shop_${r.id}` },
  ]);
  rows.push([{ text: '« В меню', callback_data: 'menu' }]);
  return toInline(rows);
}

module.exports = {
  mainMenu,
  backToMenu,
  searchMenu,
  recipeList,
  recipeCardActions,
  editMenu,
  editFieldMenu,
  previewActions,
  confirmDelete,
  shoplistMenu,
};

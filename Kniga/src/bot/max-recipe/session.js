const sessions = new Map();

function getSession(userId) {
  if (!sessions.has(userId)) {
    sessions.set(userId, {
      mode: 'idle',
      step: null,
      draft: {},
      recipeId: null,
      page: 0,
      searchType: null,
    });
  }
  return sessions.get(userId);
}

function resetSession(userId) {
  sessions.set(userId, {
    mode: 'idle',
    step: null,
    draft: {},
    recipeId: null,
    page: 0,
    searchType: null,
  });
}

function setMode(userId, mode, extra = {}) {
  const session = getSession(userId);
  session.mode = mode;
  session.step = extra.step || null;
  if (extra.draft) session.draft = extra.draft;
  if (extra.recipeId !== undefined) session.recipeId = extra.recipeId;
  if (extra.page !== undefined) session.page = extra.page;
  if (extra.searchType !== undefined) session.searchType = extra.searchType;
}

module.exports = {
  getSession,
  resetSession,
  setMode,
};

if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

function getDataDir() {
  if (process.env.RENDER_DISK_MOUNT_PATH) {
    return process.env.RENDER_DISK_MOUNT_PATH;
  }
  return './data';
}

module.exports = {
  maxRecipeBotToken: process.env.MAX_RECIPE_BOT_TOKEN || null,
  vkServiceToken: process.env.VK_SERVICE_TOKEN || null,
  port: process.env.PORT || 3001,
  nodeEnv: process.env.NODE_ENV || 'development',
  dataDir: getDataDir(),
  uploadsDir: process.env.RENDER_DISK_MOUNT_PATH
    ? `${process.env.RENDER_DISK_MOUNT_PATH}/uploads`
    : './uploads',
};

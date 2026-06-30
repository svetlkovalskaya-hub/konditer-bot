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
  telegramToken: process.env.TELEGRAM_BOT_TOKEN,
  adminTelegramId: process.env.ADMIN_TELEGRAM_ID ? String(process.env.ADMIN_TELEGRAM_ID) : null,
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  dataDir: getDataDir(),
  uploadsDir: process.env.RENDER_DISK_MOUNT_PATH ? `${process.env.RENDER_DISK_MOUNT_PATH}/uploads` : './uploads',
  maxPhotosPerOrder: 5,
};

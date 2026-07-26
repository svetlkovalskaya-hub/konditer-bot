const { createWorker } = require('tesseract.js');
const fs = require('fs');
const path = require('path');

let worker = null;

async function getWorker() {
  if (!worker) {
    worker = await createWorker('rus');
  }
  return worker;
}

async function downloadIfNeeded(imageUrlOrPath, uploadsDir) {
  if (fs.existsSync(imageUrlOrPath)) return imageUrlOrPath;

  const response = await fetch(imageUrlOrPath, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      Accept: 'image/*,*/*',
    },
  });
  if (!response.ok) throw new Error(`Не удалось скачать картинку: ${response.status}`);

  const buffer = Buffer.from(await response.arrayBuffer());
  const ext = path.extname(new URL(imageUrlOrPath).pathname) || '.jpg';
  const tmpPath = path.join(uploadsDir, `ocr-${Date.now()}${ext}`);
  fs.writeFileSync(tmpPath, buffer);
  return tmpPath;
}

async function recognizeText(imageUrlOrPath, uploadsDir) {
  const localPath = await downloadIfNeeded(imageUrlOrPath, uploadsDir);
  const w = await getWorker();
  const result = await w.recognize(localPath);

  try {
    if (localPath !== imageUrlOrPath) fs.unlinkSync(localPath);
  } catch {}

  return result.data.text || '';
}

async function terminateWorker() {
  if (worker) {
    await worker.terminate();
    worker = null;
  }
}

module.exports = {
  recognizeText,
  terminateWorker,
};

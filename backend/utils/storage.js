// Image storage: the uploads/ folder when running locally, Netlify Blobs when
// deployed (serverless functions have no permanent disk).
const fs = require('fs');
const path = require('path');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
const STORE_NAME = 'uploads';

const onNetlify = () => Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);
const blobs = () => require('@netlify/blobs').getStore(STORE_NAME);
const safeName = name => path.basename(String(name));

async function saveImage(filename, buffer, contentType) {
  if (onNetlify()) {
    await blobs().set(safeName(filename), new Blob([buffer], { type: contentType }), { metadata: { contentType } });
    return;
  }
  await fs.promises.mkdir(UPLOAD_DIR, { recursive: true });
  await fs.promises.writeFile(path.join(UPLOAD_DIR, safeName(filename)), buffer);
}

// Returns { body: Buffer, contentType } or null
async function readImage(filename) {
  if (onNetlify()) {
    const entry = await blobs().getWithMetadata(safeName(filename), { type: 'arrayBuffer' });
    return entry ? { body: Buffer.from(entry.data), contentType: entry.metadata.contentType } : null;
  }
  try {
    const body = await fs.promises.readFile(path.join(UPLOAD_DIR, safeName(filename)));
    return { body, contentType: null };
  } catch {
    return null;
  }
}

async function removeImage(filename) {
  if (!filename) return;
  if (onNetlify()) return blobs().delete(safeName(filename));
  return fs.promises.unlink(path.join(UPLOAD_DIR, safeName(filename))).catch(() => {});
}

module.exports = { saveImage, readImage, removeImage, UPLOAD_DIR };

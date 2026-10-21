const multer = require('multer');
const crypto = require('crypto');
const { saveImage, removeImage } = require('../utils/storage');

// Netlify Functions accept requests up to 6 MB, so photos are capped at 4 MB
// (the frontend shrinks large photos before uploading)
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

const IMAGE_TYPES = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif'
};

const parser = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES },
  fileFilter: (req, file, cb) => {
    if (IMAGE_TYPES[file.mimetype]) return cb(null, true);
    const error = new Error('Only JPG, PNG, WEBP or GIF images are allowed');
    error.status = 400;
    cb(error);
  }
});

// Saves the uploaded image and sets req.file.filename for the controllers.
// The extension comes from the checked type, not the user's file name.
async function persist(req, res, next) {
  if (!req.file) return next();
  try {
    const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${IMAGE_TYPES[req.file.mimetype]}`;
    await saveImage(filename, req.file.buffer, req.file.mimetype);
    req.file.filename = filename;
    next();
  } catch (error) {
    next(error);
  }
}

// Deletes an uploaded image; a missing file is not an error
function removeUpload(filename) {
  Promise.resolve(removeImage(filename)).catch(() => {});
}

module.exports = {
  single: field => [parser.single(field), persist],
  removeUpload,
  MAX_IMAGE_BYTES
};

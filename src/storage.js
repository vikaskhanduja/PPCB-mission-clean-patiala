import { v2 as cloudinary } from 'cloudinary';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

export const cloudinaryEnabled = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET
);

if (cloudinaryEnabled) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
  console.log('☁️  File storage: Cloudinary');
} else {
  console.log('💾 File storage: local disk (set CLOUDINARY_* env vars for persistent storage)');
}

/**
 * Stores an uploaded file buffer (image or document).
 * Images are resized/compressed; other files (PDF, Word, Excel) are stored as-is ("raw").
 * Returns { url, publicId } — url is absolute (Cloudinary) or /uploads/... (local fallback).
 */
export async function storeFile(file, folder = 'mission-clean-patiala') {
  const isImage = file.mimetype?.startsWith('image/');

  if (cloudinaryEnabled) {
    const options = isImage
      ? {
          folder,
          resource_type: 'image',
          // Shrink large phone photos, auto format/quality to save free-tier quota
          transformation: [{ width: 1600, height: 1600, crop: 'limit', quality: 'auto', fetch_format: 'auto' }],
        }
      : {
          folder,
          // "raw" keeps PDFs/docs downloadable on free accounts (PDF delivery as "image" is blocked by default)
          resource_type: 'raw',
          use_filename: true,
          unique_filename: true,
          filename_override: file.originalname,
        };
    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(options, (err, res) => (err ? reject(err) : resolve(res))).end(file.buffer);
    });
    return { url: result.secure_url, publicId: result.public_id };
  }

  await mkdir('uploads', { recursive: true });
  const filename = randomUUID() + path.extname(file.originalname || '').toLowerCase();
  await writeFile(path.join('uploads', filename), file.buffer);
  return { url: '/uploads/' + filename, publicId: null };
}

// Backwards-compatible alias
export const storePhoto = (file) => storeFile(file);

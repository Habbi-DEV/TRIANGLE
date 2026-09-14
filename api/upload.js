import supabase from './_lib/db-client.js';
import { setCors, requireAdmin } from './_lib/auth.js';
import { internalError, audit, rateLimit } from './_lib/validate.js';

const EXT_MIME = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  webp: 'image/webp', bmp: 'image/bmp', tif: 'image/tiff', tiff: 'image/tiff',
  avif: 'image/avif', heic: 'image/heic', heif: 'image/heif',
};
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_FOLDERS = new Set(['Banniere', 'Categories', 'Logo', 'Menu Triangle', 'Sauces', 'Supplements']);
const DEFAULT_FOLDER = 'Menu Triangle';

// Magic-byte signatures (FIX content-spoof: don't trust extension alone)
const SIGNATURES = [
  { ext: ['jpg', 'jpeg'], magic: [[0xff, 0xd8, 0xff]] },
  { ext: ['png'], magic: [[0x89, 0x50, 0x4e, 0x47]] },
  { ext: ['gif'], magic: [[0x47, 0x49, 0x46]] },
  { ext: ['webp'], magic: [[0x52, 0x49, 0x46, 0x46]] },
  { ext: ['bmp'], magic: [[0x42, 0x4d]] },
  { ext: ['avif', 'heic', 'heif'], magic: [[0x00, 0x00, 0x00]] }, // ftyp box — checked loosely
];
function hasValidSignature(buf, ext) {
  const rule = SIGNATURES.find((r) => r.ext.includes(ext));
  if (!rule) return true;
  return rule.magic.some((sig) => sig.every((b, i) => buf[i] === b));
}

export default async function handler(req, res) {
  setCors(req, res, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    if (!rateLimit(req, res, { max: 20, windowMs: 60_000, key: 'upload' })) return;

    const { fileName, fileBase64, contentType, folder } = req.body || {};
    if (!fileName || !fileBase64) return res.status(400).json({ error: 'fileName and fileBase64 are required' });
    // FIX: pre-check base64 length BEFORE decode (avoid memory exhaustion)
    if (typeof fileBase64 !== 'string' || fileBase64.length > Math.ceil(MAX_BYTES * 4 / 3) + 1024) {
      return res.status(413).json({ error: 'Image is too large (max 5 MB)' });
    }

    const targetFolder = ALLOWED_FOLDERS.has(folder) ? folder : DEFAULT_FOLDER;
    const ext = String(fileName).split('.').pop()?.toLowerCase();
    const resolvedType = EXT_MIME[ext];
    if (!resolvedType) return res.status(400).json({ error: 'Unsupported file type' });
    if (contentType && contentType !== resolvedType) {
      return res.status(400).json({ error: 'File extension does not match its content type' });
    }

    let buffer;
    try {
      buffer = Buffer.from(fileBase64, 'base64');
    } catch { return res.status(400).json({ error: 'Invalid file encoding' }); }
    if (buffer.length > MAX_BYTES) return res.status(413).json({ error: 'Image is too large (max 5 MB)' });
    if (buffer.length === 0) return res.status(400).json({ error: 'Empty file' });
    if (!hasValidSignature(buffer, ext)) {
      return res.status(400).json({ error: 'File content does not match its extension' });
    }
    // Block polyglot HTML/JS inside image bytes
    const head = buffer.slice(0, 512).toString('latin1').toLowerCase();
    if (head.includes('<script') || head.includes('<html') || head.includes('<?php')) {
      return res.status(400).json({ error: 'Suspicious file content rejected' });
    }

    const base = String(fileName).split('/').pop().replace(/[^a-zA-Z0-9.\-_]/g, '_').slice(0, 100);
    const safeName = `${targetFolder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${base}`;
    if (safeName.includes('..')) return res.status(400).json({ error: 'Invalid file name' });

    const { error } = await supabase.storage.from('menu-images')
      .upload(safeName, buffer, { contentType: resolvedType, upsert: false });
    if (error) return internalError(res, error, 'upload');
    await audit(supabase, { actorId: admin.id, action: 'media.upload', entity: 'storage', entityId: safeName });

    const { data: urlData } = supabase.storage.from('menu-images').getPublicUrl(safeName);
    return res.status(200).json({ url: urlData.publicUrl });
  } catch (err) {
    return internalError(res, err, 'upload API error');
  }
}

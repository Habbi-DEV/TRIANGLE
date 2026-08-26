import supabase from './db-client.js';

// Only real, rasterized image formats. SVG is deliberately excluded: it can
// carry embedded <script>/on* handlers and gets rendered as HTML by browsers
// when opened directly, which turns an "image upload" into a stored-XSS
// vector against anyone who opens the file's public URL.
const EXT_MIME = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  webp: 'image/webp', bmp: 'image/bmp',
  tiff: 'image/tiff', tif: 'image/tiff', avif: 'image/avif',
  heic: 'image/heic', heif: 'image/heif',
};
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

async function requireAdmin(req, res) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    res.status(401).json({ error: 'Invalid session' });
    return null;
  }
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') {
    res.status(403).json({ error: 'Admin access required' });
    return null;
  }
  return user;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // Uploads change what customers see on the public menu, so this is
    // admin-only — previously any authenticated staff member (including
    // cashier/kitchen/delivery accounts) could upload arbitrary files.
    if (!(await requireAdmin(req, res))) return;

    const { fileName, fileBase64, contentType } = req.body || {};
    if (!fileName || !fileBase64) return res.status(400).json({ error: 'fileName and fileBase64 are required' });

    const ext = fileName.split('.').pop()?.toLowerCase();
    const resolvedType = EXT_MIME[ext];
    if (!resolvedType) {
      return res.status(400).json({ error: 'Unsupported file type. Allowed: jpg, png, gif, webp, bmp, tiff, avif, heic' });
    }
    // Sanity-check the declared content type against the extension rather
    // than trusting the client-sent contentType outright.
    if (contentType && contentType !== resolvedType) {
      return res.status(400).json({ error: 'File extension does not match its content type' });
    }

    const safeName = `products/${Date.now()}-${fileName.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`;
    const buffer = Buffer.from(fileBase64, 'base64');

    if (buffer.length > MAX_BYTES) {
      return res.status(400).json({ error: 'Image is too large (max 5 MB)' });
    }
    if (buffer.length === 0) {
      return res.status(400).json({ error: 'Empty file' });
    }

    const { error } = await supabase.storage
      .from('menu-images')
      .upload(safeName, buffer, { contentType: resolvedType, upsert: true });
    if (error) throw error;

    const { data: urlData } = supabase.storage.from('menu-images').getPublicUrl(safeName);
    return res.status(200).json({ url: urlData.publicUrl });
  } catch (err) {
    console.error('upload API error:', err);
    res.status(500).json({ error: err.message });
  }
}
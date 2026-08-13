import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';

const hashCache = new Map();

const sha256Source = (source) =>
  `'sha256-${createHash('sha256').update(source, 'utf8').digest('base64')}'`;

const getInlineSourceHashes = (filePath) => {
  const stat = fs.statSync(filePath);
  const cached = hashCache.get(filePath);
  if (cached?.mtimeMs === stat.mtimeMs && cached?.size === stat.size) return cached.hashes;

  const html = fs.readFileSync(filePath, 'utf8');
  const scriptHashes = [];
  const styleHashes = [];

  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/\bsrc\s*=/i.test(match[1])) scriptHashes.push(sha256Source(match[2]));
  }
  for (const match of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    styleHashes.push(sha256Source(match[1]));
  }

  const hashes = {
    scriptHashes: [...new Set(scriptHashes)],
    styleHashes: [...new Set(styleHashes)],
  };
  hashCache.set(filePath, { mtimeMs: stat.mtimeMs, size: stat.size, hashes });
  return hashes;
};

const productionFrameAncestors = [
  "'self'",
  'https://autospf.shop',
  'https://www.autospf.shop',
];

const developmentFrameAncestors = [
  ...productionFrameAncestors,
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3100',
  'https://localhost:3100',
];

export const buildStaticArCsp = (filePath, nodeEnv = 'development') => {
  if (path.extname(filePath).toLowerCase() !== '.html') return '';

  const { scriptHashes } = getInlineSourceHashes(filePath);
  const normalizedPath = filePath.split(path.sep).join('/');
  const isWebAr = normalizedPath.includes('/public/webar/');
  const isMindAr = normalizedPath.endsWith('/webar/mindar.html');

  const externalScripts = isMindAr
    ? [
      'https://unpkg.com/three@0.151.3/',
      'https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image-three.prod.js',
    ]
    : isWebAr
      ? [
        'https://ajax.googleapis.com/ajax/libs/model-viewer/4.0.0/model-viewer.min.js',
        'https://unpkg.com/three@0.160.1/',
      ]
      : ['https://ajax.googleapis.com/ajax/libs/model-viewer/4.0.0/model-viewer.min.js'];

  const frameAncestors = isWebAr
    ? (nodeEnv === 'production' ? productionFrameAncestors : developmentFrameAncestors)
    : ["'self'"];

  return [
    "default-src 'none'",
    `script-src 'self' 'wasm-unsafe-eval' ${scriptHashes.join(' ')} ${externalScripts.join(' ')}`,
    "script-src-attr 'none'",
    "style-src 'self'",
    // Model Viewer injects runtime style elements that cannot carry a server
    // nonce/hash. This exception is isolated to CSS; scripts remain hash-only.
    "style-src-elem 'self' 'unsafe-inline'",
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob: https://www.gstatic.com https://res.cloudinary.com",
    "font-src 'self'",
    "connect-src 'self' blob: https://www.gstatic.com https://assets.meshy.ai https://res.cloudinary.com https://storage.googleapis.com",
    "worker-src 'self' blob:",
    "media-src 'self' blob:",
    "model-src 'self' blob: https://assets.meshy.ai https://res.cloudinary.com https://storage.googleapis.com",
    "frame-src 'self' blob:",
    `frame-ancestors ${frameAncestors.join(' ')}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
};

export const getInlineCspHashes = getInlineSourceHashes;

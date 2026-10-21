import { createHash } from 'node:crypto';
import type { ImageTransform, StorageAdapter } from './types';

/**
 * Cloudinary. The browser posts the file with a signed form; images are resized and converted on the fly.
 * Env: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET.
 * Keys are stored without an extension and uploaded as resource type "image" for images, video and PDF, "raw" otherwise.
 */
export function signParams(params: Record<string, string>, secret: string): string {
  const base = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join('&');
  return createHash('sha1').update(base + secret).digest('hex');
}

const typeFor = (mime: string) => (mime.startsWith('video/') ? 'video' : mime.startsWith('image/') || mime === 'application/pdf' ? 'image' : 'raw');

export function createCloudinaryStorage(env: NodeJS.ProcessEnv = process.env): StorageAdapter {
  const cloud = env.CLOUDINARY_CLOUD_NAME ?? '';
  const apiKey = env.CLOUDINARY_API_KEY ?? '';
  const secret = env.CLOUDINARY_API_SECRET ?? '';
  const configured = Boolean(cloud && apiKey && secret);
  // Keys look like "<type>/<public id>" so URLs and deletes know the resource type.
  const split = (key: string) => {
    const [type, ...rest] = key.split('/');
    return { type: type ?? 'image', publicId: rest.join('/') };
  };

  return {
    id: 'cloudinary',
    configured,
    async signUpload({ key, mime }) {
      const type = typeFor(mime);
      const publicId = key;
      const timestamp = String(Math.floor(Date.now() / 1000));
      const params = { public_id: publicId, timestamp, overwrite: 'true', invalidate: 'true' };
      return {
        url: `https://api.cloudinary.com/v1_1/${cloud}/${type}/upload`,
        method: 'POST',
        fields: { ...params, api_key: apiKey, signature: signParams(params, secret) },
        key: `${type}/${publicId}`,
      };
    },
    async read(key, bytes) {
      const { type, publicId } = split(key);
      const response = await fetch(`https://res.cloudinary.com/${cloud}/${type}/upload/${publicId}`, { headers: { Range: `bytes=0-${bytes - 1}` } });
      if (!response.ok) throw new Error(`Cloudinary answered ${response.status} when reading ${key}.`);
      return new Uint8Array(await response.arrayBuffer()).slice(0, bytes);
    },
    async delete(key) {
      const { type, publicId } = split(key);
      const timestamp = String(Math.floor(Date.now() / 1000));
      const params = { public_id: publicId, timestamp, invalidate: 'true' };
      const body = new URLSearchParams({ ...params, api_key: apiKey, signature: signParams(params, secret) });
      const response = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/${type}/destroy`, { method: 'POST', body });
      if (!response.ok) throw new Error(`Cloudinary answered ${response.status} when deleting ${key}.`);
    },
    url(key, t?: ImageTransform) {
      const { type, publicId } = split(key);
      if (type !== 'image' || !t) return `https://res.cloudinary.com/${cloud}/${type}/upload/${publicId}`;
      const parts = [`f_${t.format ?? 'auto'}`, 'q_auto'];
      if (t.width) parts.push(`w_${Math.round(t.width)}`);
      if (t.height) parts.push(`h_${Math.round(t.height)}`, 'c_fill');
      if (t.focal && t.height) parts.push('g_xy_center', `x_${t.focal.x.toFixed(3)}`, `y_${t.focal.y.toFixed(3)}`, 'fl_relative');
      return `https://res.cloudinary.com/${cloud}/image/upload/${parts.join(',')}/${publicId}`;
    },
  };
}

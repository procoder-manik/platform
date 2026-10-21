import { createCloudinaryStorage } from './cloudinary';
import { localStorage_ } from './local';
import { noneStorage } from './none';
import { createS3Storage } from './s3';
import type { StorageAdapter } from './types';

export type { StorageAdapter, SignedUpload, ImageTransform } from './types';

/** Picks the media provider from STORAGE_PROVIDER: cloudinary, s3 or (development only) local. */
export function getStorage(): StorageAdapter {
  const id = (process.env.STORAGE_PROVIDER ?? '').trim();
  if (id === 'cloudinary') return createCloudinaryStorage();
  if (id === 's3' || id === 'r2') return createS3Storage();
  if ((id === 'local' || id === '') && process.env.NODE_ENV !== 'production') return localStorage_;
  return noneStorage;
}

/** Finds the adapter that stored a file, so old files keep working after a provider change. */
export function storageFor(providerId: string): StorageAdapter {
  if (providerId === 'cloudinary') return createCloudinaryStorage();
  if (providerId === 's3') return createS3Storage();
  if (providerId === 'local') return localStorage_;
  return noneStorage;
}

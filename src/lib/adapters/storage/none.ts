import { AdapterNotConfiguredError } from '../errors';
import type { StorageAdapter } from './types';

const hint = 'Set STORAGE_PROVIDER to cloudinary or s3 and add its keys. See docs/SETUP.md.';

/** Used until a provider is configured. Reading URLs works; uploads explain what is missing. */
export const noneStorage: StorageAdapter = {
  id: 'none',
  configured: false,
  async signUpload() {
    throw new AdapterNotConfiguredError('storage', hint);
  },
  async read() {
    throw new AdapterNotConfiguredError('storage', hint);
  },
  async delete() {
    throw new AdapterNotConfiguredError('storage', hint);
  },
  url(key) {
    return key;
  },
};

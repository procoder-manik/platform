export interface SignedUpload {
  /** Where the browser sends the file. */
  url: string;
  method: 'POST' | 'PUT';
  /** Form fields for multipart POST uploads (Cloudinary). The file goes in the "file" field. */
  fields?: Record<string, string>;
  headers?: Record<string, string>;
  /** The storage key the file will have once uploaded. */
  key: string;
}

export interface ImageTransform {
  width?: number;
  height?: number;
  format?: 'auto' | 'webp' | 'avif';
  focal?: { x: number; y: number };
}

/** Media storage. Vercel's disk is read-only, so files go straight from the browser to the provider. */
export interface StorageAdapter {
  readonly id: string;
  /** False when the provider is missing settings; the media library explains what to add. */
  readonly configured: boolean;
  signUpload(input: { key: string; mime: string; size: number }): Promise<SignedUpload>;
  /** Reads up to `bytes` bytes from the start of a stored file, to check its real type. */
  read(key: string, bytes: number): Promise<Uint8Array>;
  delete(key: string): Promise<void>;
  /** Public address, optionally resized and converted on the fly. */
  url(key: string, transform?: ImageTransform): string;
}

/**
 * External integration boundary for binary storage (architecture spec
 * Section 30). The first implementation is local disk (matches the
 * default STORAGE_PROVIDER=local); swapping to S3/GCS/etc. later only
 * means adding a class that implements this interface and updating the
 * provider factory - no changes to MediaService or its callers.
 */
export interface StorageProvider {
  /** Persists a buffer under storageKey, returning nothing - callers already chose the key. */
  save(storageKey: string, buffer: Buffer): Promise<void>;
  read(storageKey: string): Promise<Buffer>;
  delete(storageKey: string): Promise<void>;
}

export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');

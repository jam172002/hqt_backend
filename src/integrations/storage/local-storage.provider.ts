import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { AppConfig } from '../../config/configuration';
import type { StorageProvider } from './storage-provider.interface';

@Injectable()
export class LocalStorageProvider implements StorageProvider {
  private readonly rootDir: string;

  constructor(configService: ConfigService<AppConfig, true>) {
    this.rootDir = configService.get('storage.localPath', { infer: true });
  }

  async save(storageKey: string, buffer: Buffer): Promise<void> {
    const fullPath = this.resolvePath(storageKey);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, buffer);
  }

  async read(storageKey: string): Promise<Buffer> {
    return fs.readFile(this.resolvePath(storageKey));
  }

  async delete(storageKey: string): Promise<void> {
    await fs.rm(this.resolvePath(storageKey), { force: true });
  }

  /** Rejects any key that would escape rootDir (defense in depth against path traversal). */
  private resolvePath(storageKey: string): string {
    const fullPath = path.resolve(this.rootDir, storageKey);
    if (!fullPath.startsWith(path.resolve(this.rootDir))) {
      throw new Error('Invalid storage key');
    }
    return fullPath;
  }
}

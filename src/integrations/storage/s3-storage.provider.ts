import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration';
import type { StorageProvider } from './storage-provider.interface';

/**
 * S3-compatible object storage (Cloudflare R2, AWS S3, MinIO...). Files stay
 * private in the bucket and are still served through the API's
 * /media/:id/file route, so visibility rules keep applying.
 */
@Injectable()
export class S3StorageProvider implements StorageProvider {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(configService: ConfigService<AppConfig, true>) {
    const storage = configService.get('storage', { infer: true });
    if (!storage.bucket || !storage.s3.accessKeyId || !storage.s3.secretAccessKey) {
      throw new Error(
        'STORAGE_PROVIDER=s3 requires STORAGE_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY',
      );
    }
    this.bucket = storage.bucket;
    this.client = new S3Client({
      region: storage.s3.region,
      endpoint: storage.s3.endpoint,
      credentials: {
        accessKeyId: storage.s3.accessKeyId,
        secretAccessKey: storage.s3.secretAccessKey,
      },
    });
  }

  async save(storageKey: string, buffer: Buffer): Promise<void> {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: storageKey, Body: buffer }));
  }

  async read(storageKey: string): Promise<Buffer> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: storageKey }));
    if (!res.Body) {
      throw new Error(`Object ${storageKey} has no body`);
    }
    return Buffer.from(await res.Body.transformToByteArray());
  }

  async delete(storageKey: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: storageKey }));
  }
}

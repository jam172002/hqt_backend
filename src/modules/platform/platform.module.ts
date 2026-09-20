import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import type { AppConfig } from '../../config/configuration';
import { LocalStorageProvider } from '../../integrations/storage/local-storage.provider';
import { S3StorageProvider } from '../../integrations/storage/s3-storage.provider';
import { STORAGE_PROVIDER } from '../../integrations/storage/storage-provider.interface';
import { AuditController } from './audit/audit.controller';
import { AuditInterceptor } from './audit/audit.interceptor';
import { AuditService } from './audit/audit.service';
import { MediaController } from './media/media.controller';
import { MediaService } from './media/media.service';
import { SettingsController } from './settings/settings.controller';
import { SettingsService } from './settings/settings.service';

/**
 * Owns media metadata/storage, the audit trail, and system settings
 * (architecture spec Section 5/17-19). The first storage implementation
 * is local disk (STORAGE_PROVIDER=local) - see LocalStorageProvider and
 * the StorageProvider interface for the swap-out seam.
 */
@Module({
  controllers: [MediaController, AuditController, SettingsController],
  providers: [
    {
      provide: STORAGE_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) =>
        config.get('storage.provider', { infer: true }) === 's3'
          ? new S3StorageProvider(config)
          : new LocalStorageProvider(config),
    },
    MediaService,
    AuditService,
    SettingsService,
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class PlatformModule {}

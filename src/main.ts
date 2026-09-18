import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import type { AppConfig } from './config/configuration';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService<AppConfig, true>);

  // Media files (course covers, teacher photos) are served from this API and
  // embedded cross-origin as <img> tags on the separate website origin -
  // Helmet's default same-origin CORP would silently block every one of them.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.enableCors();
  app.setGlobalPrefix('api/v1', { exclude: ['health/live', 'health/ready'] });

  // DTO validation at the API boundary (architecture spec Section 14.1).
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Every API error is mapped to the same consistent envelope.
  app.useGlobalFilters(new AllExceptionsFilter());

  app.enableShutdownHooks();

  const port = configService.get('port', { infer: true });
  await app.listen(port);
  console.log(`HQT backend listening on http://localhost:${port}/api/v1`);
}

void bootstrap();

export interface AppConfig {
  env: string;
  port: number;
  url?: string;
  database: {
    url: string;
  };
  jwt: {
    accessSecret: string;
    accessExpiresIn: string;
    refreshExpiresIn: string;
  };
  redis: {
    url?: string;
  };
  storage: {
    provider: string;
    bucket?: string;
    localPath: string;
    maxUploadBytes: number;
  };
}

export default (): AppConfig => ({
  env: process.env.APP_ENV ?? 'development',
  // Render (and most PaaS hosts) assign the listen port at runtime via PORT -
  // APP_PORT remains the local-dev override (see .env.example).
  port: parseInt(process.env.PORT ?? process.env.APP_PORT ?? '3000', 10),
  url: process.env.APP_URL,
  database: {
    url: process.env.DATABASE_URL as string,
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET as string,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '30d',
  },
  redis: {
    url: process.env.REDIS_URL,
  },
  storage: {
    provider: process.env.STORAGE_PROVIDER ?? 'local',
    bucket: process.env.STORAGE_BUCKET,
    localPath: process.env.STORAGE_LOCAL_PATH ?? './uploads',
    maxUploadBytes: parseInt(process.env.STORAGE_MAX_UPLOAD_BYTES ?? String(10 * 1024 * 1024), 10),
  },
});

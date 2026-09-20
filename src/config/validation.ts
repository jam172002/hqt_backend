import * as Joi from 'joi';

/**
 * Fails application startup fast when required production configuration is
 * missing, per the architecture spec's "Configuration Management" rules.
 */
export const configValidationSchema = Joi.object({
  APP_ENV: Joi.string().valid('development', 'staging', 'production', 'test').default('development'),
  APP_PORT: Joi.number().port().default(3000),
  APP_URL: Joi.string().uri().optional(),

  DATABASE_URL: Joi.string().uri({ scheme: [/postgres(ql)?/] }).required(),

  JWT_ACCESS_SECRET: Joi.string().min(16).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  // Refresh tokens are opaque (session id + random secret, bcrypt-hashed
  // server-side) rather than signed JWTs, so no refresh signing secret is
  // needed - only how long a session stays valid.
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('30d'),

  REDIS_URL: Joi.string().uri().optional(),

  STORAGE_PROVIDER: Joi.string().valid('local', 's3').default('local'),
  S3_ENDPOINT: Joi.string().uri().optional(),
  S3_REGION: Joi.string().default('auto'),
  S3_ACCESS_KEY_ID: Joi.string().optional(),
  S3_SECRET_ACCESS_KEY: Joi.string().optional(),
  STORAGE_BUCKET: Joi.string().optional(),
  STORAGE_LOCAL_PATH: Joi.string().default('./uploads'),
  STORAGE_MAX_UPLOAD_BYTES: Joi.number().default(10 * 1024 * 1024),

  PAYMENT_PROVIDER_NAME: Joi.string().allow('').optional(),
  PAYMENT_PROVIDER_API_KEY: Joi.string().allow('').optional(),
  PAYMENT_PROVIDER_WEBHOOK_SECRET: Joi.string().allow('').optional(),

  MEETING_PROVIDER_NAME: Joi.string().allow('').optional(),
  MEETING_PROVIDER_API_KEY: Joi.string().allow('').optional(),

  PUSH_PROVIDER_NAME: Joi.string().allow('').optional(),
  PUSH_PROVIDER_API_KEY: Joi.string().allow('').optional(),

  EMAIL_PROVIDER_NAME: Joi.string().allow('').optional(),
  EMAIL_PROVIDER_API_KEY: Joi.string().allow('').optional(),

  SMS_PROVIDER_NAME: Joi.string().allow('').optional(),
  SMS_PROVIDER_API_KEY: Joi.string().allow('').optional(),

  WHATSAPP_PROVIDER_NAME: Joi.string().allow('').optional(),
  WHATSAPP_PROVIDER_API_KEY: Joi.string().allow('').optional(),
});

/**
 * @nestjs/config v12 dropped native Joi support in favour of the
 * "Standard Schema" spec (Zod/Valibot/ArkType) for `validationSchema`.
 * This adapts our existing Joi schema to the plain `validate` function
 * shape instead, which is still first-class and lets us keep Joi.
 */
export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const result: Joi.ValidationResult<Record<string, unknown>> = configValidationSchema.validate(
    config,
    { abortEarly: false, allowUnknown: true },
  );

  if (result.error) {
    throw new Error(`Config validation error: ${result.error.message}`);
  }

  return result.value;
}

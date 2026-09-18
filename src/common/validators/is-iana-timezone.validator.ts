import { registerDecorator, type ValidationOptions } from 'class-validator';

const SUPPORTED_TIMEZONES = new Set(Intl.supportedValuesOf('timeZone'));

/**
 * Validates against the runtime's actual IANA timezone database rather
 * than a loose regex - matches the architecture spec's "Store timezone
 * VARCHAR using IANA identifiers" rule (Section "Time Zone Rules").
 */
export function IsIanaTimezone(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isIanaTimezone',
      target: object.constructor,
      propertyName,
      options: {
        message: `${propertyName} must be a valid IANA timezone (e.g. "Asia/Karachi")`,
        ...validationOptions,
      },
      validator: {
        validate(value: unknown): boolean {
          return typeof value === 'string' && SUPPORTED_TIMEZONES.has(value);
        },
      },
    });
  };
}

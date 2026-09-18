import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

interface FieldError {
  field: string;
  message: string;
}

interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    fieldErrors?: FieldError[];
    requestId?: string;
  };
}

/**
 * Every API error, expected or not, is mapped to the same envelope shape
 * (architecture spec Section 14.1). Never leaks stack traces or internal
 * provider responses in production (Section 16).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = (request.headers['x-request-id'] as string) ?? undefined;

    const { status, code, message, fieldErrors } = this.resolve(exception);
    const internalErrorThreshold: number = HttpStatus.INTERNAL_SERVER_ERROR;

    if (status >= internalErrorThreshold) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status} [${code}]`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    const body: ErrorEnvelope = {
      error: { code, message, ...(fieldErrors ? { fieldErrors } : {}), requestId },
    };

    response.status(status).json(body);
  }

  private resolve(exception: unknown): {
    status: number;
    code: string;
    message: string;
    fieldErrors?: FieldError[];
  } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();

      if (typeof body === 'object' && body !== null) {
        const payload = body as Record<string, unknown>;
        const rawMessage = payload.message;

        if (Array.isArray(rawMessage)) {
          return {
            status,
            code: this.codeFromStatus(status),
            message: 'Validation failed',
            fieldErrors: this.toFieldErrors(rawMessage),
          };
        }

        return {
          status,
          code: this.codeFromStatus(status),
          message: typeof rawMessage === 'string' ? rawMessage : exception.message,
        };
      }

      return { status, code: this.codeFromStatus(status), message: exception.message };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
    };
  }

  private codeFromStatus(status: number): string {
    return HttpStatus[status] ?? 'ERROR';
  }

  /** class-validator produces plain string messages like "email must be an email". */
  private toFieldErrors(messages: unknown[]): FieldError[] {
    return messages.map((message) => {
      const text = String(message);
      const field = text.split(' ')[0] ?? 'unknown';
      return { field, message: text };
    });
  }
}

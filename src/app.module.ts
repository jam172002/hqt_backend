import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import configuration from './config/configuration';
import { validateEnv } from './config/validation';
import { ThrottleGuard } from './common/guards/throttle.guard';
import { HealthController } from './common/health/health.controller';
import { RequestIdMiddleware } from './common/logging/request-id.middleware';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { PeopleModule } from './modules/people/people.module';
import { CoursesModule } from './modules/courses/courses.module';
import { EnrollmentModule } from './modules/enrollment/enrollment.module';
import { SchedulingModule } from './modules/scheduling/scheduling.module';
import { LearningModule } from './modules/learning/learning.module';
import { CrmModule } from './modules/crm/crm.module';
import { CommunicationModule } from './modules/communication/communication.module';
import { BillingModule } from './modules/billing/billing.module';
import { CmsModule } from './modules/cms/cms.module';
import { PlatformModule } from './modules/platform/platform.module';
// All domain modules from the architecture spec's Implementation
// Sequence (Section 33) are now wired in.

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
    }),
    // In-process cron (architecture spec Section 18) - sufficient for a
    // single backend instance; a queue (Redis/BullMQ) is called out there
    // as "an infrastructure choice ... when operationally justified", not
    // a hard requirement, so it's deferred until horizontal scaling needs it.
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    PeopleModule,
    CoursesModule,
    EnrollmentModule,
    SchedulingModule,
    LearningModule,
    CrmModule,
    CommunicationModule,
    BillingModule,
    CmsModule,
    PlatformModule,
  ],
  controllers: [HealthController],
  providers: [
    // Opt-in per route via @Throttle() (SRS Section 46 "spam protection") -
    // registered globally so it can gate any route, but a no-op everywhere
    // that decorator isn't applied. See ThrottleGuard's own header comment
    // for why this is a small custom guard rather than @nestjs/throttler
    // (which doesn't support NestJS 12 yet).
    { provide: APP_GUARD, useClass: ThrottleGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}

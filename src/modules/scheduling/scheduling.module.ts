import { Module } from '@nestjs/common';
import { AvailabilityController } from './availability.controller';
import { AvailabilityService } from './availability.service';
import { ClassScheduleController } from './class-schedule.controller';
import { ClassScheduleService } from './class-schedule.service';
import { ClassSessionController } from './class-session.controller';
import { ClassSessionService } from './class-session.service';
import { SessionGenerationJob } from './jobs/session-generation.job';

/**
 * Owns teacher availability, recurring class schedules, and concrete
 * class sessions (architecture spec Section 5/8). Depends on People and
 * Enrollment for FK validation - allowed direction, both built earlier.
 */
@Module({
  controllers: [AvailabilityController, ClassScheduleController, ClassSessionController],
  providers: [AvailabilityService, ClassScheduleService, ClassSessionService, SessionGenerationJob],
  exports: [AvailabilityService, ClassScheduleService, ClassSessionService],
})
export class SchedulingModule {}

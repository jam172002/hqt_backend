import { Module } from '@nestjs/common';
import { EnrollmentController } from './enrollment.controller';
import { EnrollmentService } from './enrollment.service';

/**
 * Owns enrollments and enrollment-teacher assignment history
 * (architecture spec Section 5). Depends on People and Courses for FK
 * validation (allowed directions: "People -> Enrollment", "Courses ->
 * Enrollment") - reads their tables directly via PrismaService rather
 * than importing those modules, since these are simple existence/status
 * checks, not business-logic calls into their services.
 */
@Module({
  controllers: [EnrollmentController],
  providers: [EnrollmentService],
  exports: [EnrollmentService],
})
export class EnrollmentModule {}

import { Module } from '@nestjs/common';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { HomeworkController } from './homework.controller';
import { HomeworkService } from './homework.service';
import { LearningAccessService } from './learning-access.service';
import { LessonRecordController } from './lesson-record.controller';
import { LessonRecordService } from './lesson-record.service';
import { ProgressController } from './progress.controller';
import { ProgressService } from './progress.service';

/**
 * Owns attendance, lesson records, homework/submissions, and progress
 * (architecture spec Section 5/11). Depends on Scheduling (ClassSession)
 * and Enrollment - allowed direction, both built earlier.
 */
@Module({
  controllers: [
    AttendanceController,
    LessonRecordController,
    HomeworkController,
    ProgressController,
  ],
  providers: [
    LearningAccessService,
    AttendanceService,
    LessonRecordService,
    HomeworkService,
    ProgressService,
  ],
})
export class LearningModule {}

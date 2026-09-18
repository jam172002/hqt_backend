import { Module } from '@nestjs/common';
import { CoursesController } from './courses.controller';
import { CoursesService } from './courses.service';

/**
 * Owns courses, course sections/FAQs, and the teacher-course assignment
 * join table (architecture spec Section 5, Courses module). Reads
 * TeacherProfile directly for assignment validation - Courses is built
 * after People, so this follows the allowed dependency direction without
 * needing to import PeopleModule for a single existence check.
 */
@Module({
  controllers: [CoursesController],
  providers: [CoursesService],
  exports: [CoursesService],
})
export class CoursesModule {}

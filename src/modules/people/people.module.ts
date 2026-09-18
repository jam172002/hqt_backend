import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminsController } from './admins/admins.controller';
import { AdminsService } from './admins/admins.service';
import { ParentsController } from './parents/parents.controller';
import { ParentsService } from './parents/parents.service';
import { StudentsController } from './students/students.controller';
import { StudentsService } from './students/students.service';
import { TeachersController } from './teachers/teachers.controller';
import { TeachersService } from './teachers/teachers.service';

/**
 * Owns student/parent/teacher/admin profiles and parent-child
 * relationships (architecture spec Section 5, People module). Depends on
 * AuthModule for provisioning credentialed accounts (teachers, admins) -
 * the allowed "Auth -> People" dependency direction (Section 5.1).
 */
@Module({
  imports: [AuthModule],
  controllers: [StudentsController, ParentsController, TeachersController, AdminsController],
  providers: [StudentsService, ParentsService, TeachersService, AdminsService],
  exports: [StudentsService, ParentsService, TeachersService, AdminsService],
})
export class PeopleModule {}

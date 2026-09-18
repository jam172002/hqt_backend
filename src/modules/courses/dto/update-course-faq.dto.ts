import { PartialType } from '@nestjs/mapped-types';
import { CreateCourseFaqDto } from './create-course-faq.dto';

export class UpdateCourseFaqDto extends PartialType(CreateCourseFaqDto) {}

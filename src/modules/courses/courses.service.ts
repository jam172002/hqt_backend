import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Course, CourseFaq, CourseSection } from '@prisma/client';
import {
  buildPaginationMeta,
  toSkipTake,
  type PaginatedResult,
} from '../../common/pagination/pagination.dto';
import { PrismaService } from '../../prisma/prisma.service';
import type { CreateCourseFaqDto } from './dto/create-course-faq.dto';
import type { CreateCourseSectionDto } from './dto/create-course-section.dto';
import type { CreateCourseDto } from './dto/create-course.dto';
import type { UpdateCourseFaqDto } from './dto/update-course-faq.dto';
import type { UpdateCourseSectionDto } from './dto/update-course-section.dto';
import type { UpdateCourseDto } from './dto/update-course.dto';
import type {
  CourseDetailResponse,
  CourseFaqResponse,
  CourseListItemResponse,
  CourseSectionResponse,
} from './interfaces/course.interface';

const DETAIL_INCLUDE = {
  courseSections: { orderBy: { sortOrder: 'asc' as const } },
  courseFaqs: { orderBy: { sortOrder: 'asc' as const } },
  teacherCourses: { include: { teacher: true } },
};

type CourseWithDetails = Course & {
  courseSections: CourseSection[];
  courseFaqs: CourseFaq[];
  teacherCourses: Array<{
    teacher: { id: string; firstName: string; lastName: string; shortBio: string | null };
  }>;
};

@Injectable()
export class CoursesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCourseDto): Promise<CourseListItemResponse> {
    const existing = await this.prisma.course.findUnique({ where: { slug: dto.slug } });
    if (existing) {
      throw new ConflictException(`A course with slug "${dto.slug}" already exists`);
    }

    const course = await this.prisma.course.create({
      data: {
        slug: dto.slug,
        name: dto.name,
        shortDescription: dto.shortDescription,
        description: dto.description,
        suitableFor: dto.suitableFor,
        ageGroup: dto.ageGroup,
        teachingMethod: dto.teachingMethod,
        classFormat: dto.classFormat,
        sortOrder: dto.sortOrder ?? 0,
      },
    });

    return this.toListItem(course);
  }

  async listPublished(
    page: number,
    limit: number,
  ): Promise<PaginatedResult<CourseListItemResponse>> {
    const { skip, take } = toSkipTake(page, limit);
    const where = { status: 'PUBLISHED' as const, deletedAt: null };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.course.findMany({ where, skip, take, orderBy: { sortOrder: 'asc' } }),
      this.prisma.course.count({ where }),
    ]);

    return {
      data: rows.map((row) => this.toListItem(row)),
      meta: buildPaginationMeta(page, limit, total),
    };
  }

  async getPublishedBySlug(slug: string): Promise<CourseDetailResponse> {
    const course = await this.prisma.course.findFirst({
      where: { slug, status: 'PUBLISHED', deletedAt: null },
      include: DETAIL_INCLUDE,
    });
    if (!course) {
      throw new NotFoundException('Course not found');
    }
    return this.toDetail(course);
  }

  async adminList(page: number, limit: number): Promise<PaginatedResult<CourseListItemResponse>> {
    const { skip, take } = toSkipTake(page, limit);
    const where = { deletedAt: null };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.course.findMany({ where, skip, take, orderBy: { sortOrder: 'asc' } }),
      this.prisma.course.count({ where }),
    ]);

    return {
      data: rows.map((row) => this.toListItem(row)),
      meta: buildPaginationMeta(page, limit, total),
    };
  }

  async adminGetById(id: string): Promise<CourseDetailResponse> {
    const course = await this.findActiveWithDetailsOrThrow(id);
    return this.toDetail(course);
  }

  async update(id: string, dto: UpdateCourseDto): Promise<CourseListItemResponse> {
    await this.findActiveOrThrow(id);

    if (dto.slug) {
      const existing = await this.prisma.course.findUnique({ where: { slug: dto.slug } });
      if (existing && existing.id !== id) {
        throw new ConflictException(`A course with slug "${dto.slug}" already exists`);
      }
    }

    const course = await this.prisma.course.update({
      where: { id },
      data: {
        slug: dto.slug,
        name: dto.name,
        shortDescription: dto.shortDescription,
        description: dto.description,
        suitableFor: dto.suitableFor,
        ageGroup: dto.ageGroup,
        teachingMethod: dto.teachingMethod,
        classFormat: dto.classFormat,
        sortOrder: dto.sortOrder,
        status: dto.status,
      },
    });

    return this.toListItem(course);
  }

  async remove(id: string): Promise<void> {
    await this.findActiveOrThrow(id);
    await this.prisma.course.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async addSection(courseId: string, dto: CreateCourseSectionDto): Promise<CourseSectionResponse> {
    await this.findActiveOrThrow(courseId);
    const section = await this.prisma.courseSection.create({
      data: { courseId, title: dto.title, description: dto.description, sortOrder: dto.sortOrder ?? 0 },
    });
    return this.toSectionResponse(section);
  }

  async updateSection(
    courseId: string,
    sectionId: string,
    dto: UpdateCourseSectionDto,
  ): Promise<CourseSectionResponse> {
    const section = await this.findSectionOrThrow(courseId, sectionId);
    const updated = await this.prisma.courseSection.update({
      where: { id: section.id },
      data: { title: dto.title, description: dto.description, sortOrder: dto.sortOrder },
    });
    return this.toSectionResponse(updated);
  }

  async removeSection(courseId: string, sectionId: string): Promise<void> {
    const section = await this.findSectionOrThrow(courseId, sectionId);
    await this.prisma.courseSection.delete({ where: { id: section.id } });
  }

  async addFaq(courseId: string, dto: CreateCourseFaqDto): Promise<CourseFaqResponse> {
    await this.findActiveOrThrow(courseId);
    const faq = await this.prisma.courseFaq.create({
      data: { courseId, question: dto.question, answer: dto.answer, sortOrder: dto.sortOrder ?? 0 },
    });
    return this.toFaqResponse(faq);
  }

  async updateFaq(
    courseId: string,
    faqId: string,
    dto: UpdateCourseFaqDto,
  ): Promise<CourseFaqResponse> {
    const faq = await this.findFaqOrThrow(courseId, faqId);
    const updated = await this.prisma.courseFaq.update({
      where: { id: faq.id },
      data: { question: dto.question, answer: dto.answer, sortOrder: dto.sortOrder },
    });
    return this.toFaqResponse(updated);
  }

  async removeFaq(courseId: string, faqId: string): Promise<void> {
    const faq = await this.findFaqOrThrow(courseId, faqId);
    await this.prisma.courseFaq.delete({ where: { id: faq.id } });
  }

  async assignTeacher(courseId: string, teacherId: string): Promise<void> {
    await this.findActiveOrThrow(courseId);

    const teacher = await this.prisma.teacherProfile.findUnique({ where: { id: teacherId } });
    if (!teacher) {
      throw new NotFoundException('Teacher not found');
    }

    const existing = await this.prisma.teacherCourse.findUnique({
      where: { teacherId_courseId: { teacherId, courseId } },
    });
    if (existing) {
      throw new ConflictException('Teacher is already assigned to this course');
    }

    await this.prisma.teacherCourse.create({ data: { teacherId, courseId } });
  }

  async unassignTeacher(courseId: string, teacherId: string): Promise<void> {
    const existing = await this.prisma.teacherCourse.findUnique({
      where: { teacherId_courseId: { teacherId, courseId } },
    });
    if (!existing) {
      throw new NotFoundException('Teacher is not assigned to this course');
    }
    await this.prisma.teacherCourse.delete({
      where: { teacherId_courseId: { teacherId, courseId } },
    });
  }

  private async findActiveOrThrow(id: string): Promise<Course> {
    const course = await this.prisma.course.findFirst({ where: { id, deletedAt: null } });
    if (!course) {
      throw new NotFoundException('Course not found');
    }
    return course;
  }

  private async findActiveWithDetailsOrThrow(id: string): Promise<CourseWithDetails> {
    const course = await this.prisma.course.findFirst({
      where: { id, deletedAt: null },
      include: DETAIL_INCLUDE,
    });
    if (!course) {
      throw new NotFoundException('Course not found');
    }
    return course;
  }

  private async findSectionOrThrow(courseId: string, sectionId: string): Promise<CourseSection> {
    const section = await this.prisma.courseSection.findFirst({
      where: { id: sectionId, courseId },
    });
    if (!section) {
      throw new NotFoundException('Course section not found');
    }
    return section;
  }

  private async findFaqOrThrow(courseId: string, faqId: string): Promise<CourseFaq> {
    const faq = await this.prisma.courseFaq.findFirst({ where: { id: faqId, courseId } });
    if (!faq) {
      throw new NotFoundException('Course FAQ not found');
    }
    return faq;
  }

  private toListItem(course: Course): CourseListItemResponse {
    return {
      id: course.id,
      slug: course.slug,
      name: course.name,
      shortDescription: course.shortDescription,
      suitableFor: course.suitableFor,
      ageGroup: course.ageGroup,
      status: course.status,
      sortOrder: course.sortOrder,
      createdAt: course.createdAt,
      updatedAt: course.updatedAt,
    };
  }

  private toDetail(course: CourseWithDetails): CourseDetailResponse {
    return {
      ...this.toListItem(course),
      description: course.description,
      teachingMethod: course.teachingMethod,
      classFormat: course.classFormat,
      sections: course.courseSections
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((section) => this.toSectionResponse(section)),
      faqs: course.courseFaqs
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((faq) => this.toFaqResponse(faq)),
      teachers: course.teacherCourses.map(({ teacher }) => ({
        id: teacher.id,
        firstName: teacher.firstName,
        lastName: teacher.lastName,
        shortBio: teacher.shortBio,
      })),
    };
  }

  private toSectionResponse(section: CourseSection): CourseSectionResponse {
    return {
      id: section.id,
      title: section.title,
      description: section.description,
      sortOrder: section.sortOrder,
    };
  }

  private toFaqResponse(faq: CourseFaq): CourseFaqResponse {
    return { id: faq.id, question: faq.question, answer: faq.answer, sortOrder: faq.sortOrder };
  }
}

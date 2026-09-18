export interface EnrollmentResponse {
  id: string;
  studentId: string;
  courseId: string;
  teacherId: string | null;
  status: string;
  startedAt: Date | null;
  endedAt: Date | null;
  studentTimezone: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  student: { firstName: string; lastName: string | null };
  course: { slug: string; name: string };
  teacher: { firstName: string; lastName: string } | null;
}

export interface AvailabilityRuleResponse {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  timezone: string;
  isActive: boolean;
}

export interface AvailabilityExceptionResponse {
  id: string;
  startsAt: Date;
  endsAt: Date;
  type: string;
  reason: string | null;
}

export interface ClassScheduleResponse {
  id: string;
  enrollmentId: string;
  studentId: string;
  teacherId: string;
  courseId: string;
  timezone: string;
  dayOfWeek: number;
  localStartTime: string;
  durationMinutes: number;
  effectiveFrom: string;
  effectiveUntil: string | null;
  status: string;
  student: { firstName: string; lastName: string | null };
  teacher: { firstName: string; lastName: string };
  course: { slug: string; name: string };
}

export interface ClassSessionResponse {
  id: string;
  classScheduleId: string | null;
  enrollmentId: string;
  studentId: string;
  teacherId: string;
  courseId: string;
  scheduledStartAt: Date;
  scheduledEndAt: Date;
  originalStartAt: Date | null;
  status: string;
  meetingProvider: string | null;
  meetingUrl: string | null;
  cancelledAt: Date | null;
  cancelledBy: string | null;
  cancellationReason: string | null;
  rescheduledFromId: string | null;
  student: { firstName: string; lastName: string | null };
  teacher: { firstName: string; lastName: string };
  course: { slug: string; name: string };
}

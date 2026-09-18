export interface AttendanceRecordResponse {
  id: string;
  classSessionId: string;
  studentId: string;
  status: string;
  markedByTeacherId: string;
  markedAt: Date;
  notes: string | null;
}

export interface LessonRecordResponse {
  id: string;
  classSessionId: string;
  studentId: string;
  teacherId: string;
  enrollmentId: string;
  title: string;
  content: string;
  teacherNotes: string | null;
  performanceRating: number | null;
  generalRemarks: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface HomeworkSubmissionResponse {
  id: string;
  homeworkId: string;
  studentId: string;
  submittedAt: Date;
  content: string | null;
  status: string;
  teacherFeedback: string | null;
  reviewedAt: Date | null;
}

export interface HomeworkResponse {
  id: string;
  enrollmentId: string;
  studentId: string;
  teacherId: string;
  classSessionId: string | null;
  title: string;
  description: string;
  dueAt: Date | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  submissions: HomeworkSubmissionResponse[];
}

export interface StudentProgressResponse {
  id: string;
  enrollmentId: string;
  currentLesson: string | null;
  currentSurah: number | null;
  currentAyah: number | null;
  tajweedProgress: number | null;
  hifzProgress: number | null;
  performance: number | null;
  remarks: string | null;
  updatedByTeacherId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProgressHistoryEntryResponse {
  id: string;
  currentLesson: string | null;
  currentSurah: number | null;
  currentAyah: number | null;
  tajweedProgress: number | null;
  hifzProgress: number | null;
  performance: number | null;
  remarks: string | null;
  changedByTeacherId: string;
  createdAt: Date;
}

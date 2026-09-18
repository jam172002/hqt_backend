export interface TrialRequestResponse {
  id: string;
  studentName: string;
  studentAge: number;
  guardianName: string | null;
  countryCode: string;
  whatsapp: string;
  email: string | null;
  phone: string | null;
  courseId: string;
  preferredDays: unknown;
  preferredTime: string | null;
  timezone: string;
  message: string | null;
  specialRequirements: string | null;
  status: string;
  assignedAdminId: string | null;
  convertedUserId: string | null;
  convertedEnrollmentId: string | null;
  source: string | null;
  createdAt: Date;
  updatedAt: Date;
  course: { slug: string; name: string };
}

export interface ContactInquiryResponse {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  whatsapp: string | null;
  subject: string;
  message: string;
  status: string;
  assignedAdminId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TrialSessionResponse {
  id: string;
  trialRequestId: string;
  teacherId: string | null;
  courseId: string;
  scheduledStartAt: Date;
  scheduledEndAt: Date;
  timezone: string;
  status: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

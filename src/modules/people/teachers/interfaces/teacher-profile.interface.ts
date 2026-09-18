export interface TeacherProfileResponse {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  bio: string;
  shortBio: string | null;
  qualification: string;
  experienceYears: number | null;
  teachingPhilosophy: string | null;
  countryCode: string;
  timezone: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

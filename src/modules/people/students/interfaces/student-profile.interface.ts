export interface StudentProfileResponse {
  id: string;
  userId: string;
  firstName: string;
  lastName: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  countryCode: string;
  timezone: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

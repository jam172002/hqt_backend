export interface AdminProfileResponse {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  jobTitle: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ParentProfileResponse {
  id: string;
  userId: string;
  firstName: string;
  lastName: string | null;
  countryCode: string;
  timezone: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChildResponse {
  relationshipId: string;
  relationshipType: string;
  isPrimary: boolean;
  canViewProgress: boolean;
  canViewPayments: boolean;
  canJoinClass: boolean;
  student: {
    id: string;
    userId: string;
    firstName: string;
    lastName: string | null;
    dateOfBirth: string | null;
    gender: string | null;
    countryCode: string;
    timezone: string;
    status: string;
  };
}

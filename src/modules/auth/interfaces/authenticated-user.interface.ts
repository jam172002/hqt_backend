export interface AuthenticatedUser {
  id: string;
  email: string | null;
  phone: string | null;
  status: string;
  roles: string[];
}

export interface SystemSettingResponse {
  id: string;
  key: string;
  value: unknown;
  description: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MediaFileResponse {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  visibility: string;
  uploadedBy: string | null;
  createdAt: Date;
}

export interface MediaAttachmentResponse {
  id: string;
  mediaFileId: string;
  entityType: string;
  entityId: string;
  createdAt: Date;
  file: MediaFileResponse;
}

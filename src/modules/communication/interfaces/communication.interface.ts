export interface ConversationResponse {
  id: string;
  type: string;
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
  participantUserIds: string[];
}

export interface MessageResponse {
  id: string;
  conversationId: string;
  senderId: string;
  messageType: string;
  body: string;
  createdAt: Date;
  editedAt: Date | null;
}

export interface AnnouncementTargetResponse {
  id: string;
  targetType: string;
  userId: string | null;
  courseId: string | null;
}

export interface AnnouncementResponse {
  id: string;
  title: string;
  body: string;
  status: string;
  publishedAt: Date | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  targets: AnnouncementTargetResponse[];
}

export interface NotificationResponse {
  id: string;
  type: string;
  title: string;
  body: string;
  channel: string;
  status: string;
  readAt: Date | null;
  sentAt: Date | null;
  createdAt: Date;
}

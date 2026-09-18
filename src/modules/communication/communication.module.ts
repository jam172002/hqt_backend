import { Module } from '@nestjs/common';
import { AnnouncementsController } from './announcements.controller';
import { AnnouncementsService } from './announcements.service';
import { MessagingController } from './messaging.controller';
import { MessagingService } from './messaging.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

/**
 * Owns conversations/messages, announcements, and notifications
 * (architecture spec Section 5/12). Messages are conversational content;
 * notifications are delivery events - kept as separate concerns per the
 * architecture spec's explicit distinction (Section 12).
 */
@Module({
  controllers: [MessagingController, AnnouncementsController, NotificationsController],
  providers: [MessagingService, AnnouncementsService, NotificationsService],
  exports: [NotificationsService],
})
export class CommunicationModule {}

import { Module } from '@nestjs/common';
import { ContactInquiryController } from './contact-inquiry.controller';
import { ContactInquiryService } from './contact-inquiry.service';
import { TrialRequestController } from './trial-request.controller';
import { TrialRequestService } from './trial-request.service';
import { TrialSessionController } from './trial-session.controller';
import { TrialSessionService } from './trial-session.service';

/**
 * Owns trial requests, contact inquiries, and trial sessions
 * (architecture spec Section 5/10). The primary "conversion" entry point
 * into Enrollment - see TrialRequestService.convert().
 */
@Module({
  controllers: [TrialRequestController, TrialSessionController, ContactInquiryController],
  providers: [TrialRequestService, TrialSessionService, ContactInquiryService],
})
export class CrmModule {}

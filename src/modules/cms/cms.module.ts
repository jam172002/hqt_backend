import { Module } from '@nestjs/common';
import { FaqsController } from './faqs.controller';
import { FaqsService } from './faqs.service';
import { TestimonialsController } from './testimonials.controller';
import { TestimonialsService } from './testimonials.service';
import { WebsiteContentController } from './website-content.controller';
import { WebsiteContentService } from './website-content.service';

/**
 * Owns testimonials, FAQs, and flexible website content
 * (architecture spec Section 5/17). Courses/teachers/pricing stay in
 * their own domains - website_content is deliberately not a catch-all.
 */
@Module({
  controllers: [TestimonialsController, FaqsController, WebsiteContentController],
  providers: [TestimonialsService, FaqsService, WebsiteContentService],
})
export class CmsModule {}

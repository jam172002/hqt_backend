-- DropIndex
DROP INDEX "trial_requests_course_id_idx";

-- CreateIndex
CREATE INDEX "trial_requests_course_id_status_idx" ON "trial_requests"("course_id", "status");

-- CreateIndex
CREATE INDEX "trial_requests_assigned_admin_id_status_idx" ON "trial_requests"("assigned_admin_id", "status");

-- AddForeignKey
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_profile_media_id_fkey" FOREIGN KEY ("profile_media_id") REFERENCES "media_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_profiles" ADD CONSTRAINT "teacher_profiles_profile_media_id_fkey" FOREIGN KEY ("profile_media_id") REFERENCES "media_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_image_media_id_fkey" FOREIGN KEY ("image_media_id") REFERENCES "media_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "testimonials" ADD CONSTRAINT "testimonials_profile_media_id_fkey" FOREIGN KEY ("profile_media_id") REFERENCES "media_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

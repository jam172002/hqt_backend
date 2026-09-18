import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DateTime } from 'luxon';
import { PrismaService } from '../../../prisma/prisma.service';
import { ClassScheduleService } from '../class-schedule.service';

const ROLLING_WINDOW_DAYS = 21;

/**
 * Keeps every ACTIVE ClassSchedule topped up with concrete ClassSessions
 * for the next ROLLING_WINDOW_DAYS, so admins/teachers never need to
 * remember to call the manual generate-sessions endpoint (architecture
 * spec Section 18: "session generation from recurring schedules" must run
 * as a non-blocking background job). Reuses ClassScheduleService.generateSessions,
 * which is already idempotent - re-running over an overlapping window never
 * duplicates a session.
 */
@Injectable()
export class SessionGenerationJob {
  private readonly logger = new Logger(SessionGenerationJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly classScheduleService: ClassScheduleService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async run(): Promise<void> {
    const activeSchedules = await this.prisma.classSchedule.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, timezone: true },
    });

    let generated = 0;
    for (const schedule of activeSchedules) {
      const from = DateTime.now().setZone(schedule.timezone).toISODate();
      const to = DateTime.now()
        .setZone(schedule.timezone)
        .plus({ days: ROLLING_WINDOW_DAYS })
        .toISODate();
      if (!from || !to) {
        continue;
      }
      try {
        const created = await this.classScheduleService.generateSessions(schedule.id, from, to);
        generated += created.length;
      } catch (error) {
        this.logger.error(
          `Failed to generate sessions for schedule ${schedule.id}: ${(error as Error).message}`,
        );
      }
    }

    if (generated > 0) {
      this.logger.log(`Generated ${generated} session(s) across ${activeSchedules.length} active schedule(s)`);
    }
  }
}

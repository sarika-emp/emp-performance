// ============================================================================
// REMINDER JOB PROCESSORS
// BullMQ job handlers that query the database for upcoming deadlines and
// send the appropriate email reminders.
//
// Every processor accepts an optional `orgId`:
//   - undefined  -> process all organizations (scheduled global cron)
//   - <number>   -> process only that org (manual admin trigger; PL5)
//
// Queries are date-range scoped at the DB level rather than loading whole
// tables into memory (PL10).
// ============================================================================

import dayjs from "dayjs";
import { getDB } from "../db/adapters";
import { logger } from "../utils/logger";
import {
  sendReviewReminder,
  sendPIPCheckInReminder,
  sendOneOnOneReminder,
  sendGoalDeadlineReminder,
} from "../services/email/email.service";
import { getNotificationSettings } from "../services/notification/notification-settings.service";
import { logDelivery } from "../services/notification/notification.service";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

import type { EmpCloudUser } from "../db/empcloud";
import { findUserById } from "../db/empcloud";

/**
 * Look up a user from the empcloud master database.
 * Returns null if not found (e.g. user was deleted).
 */
async function lookupUser(userId: number): Promise<EmpCloudUser | null> {
  try {
    return await findUserById(userId);
  } catch {
    return null;
  }
}

/** Build a filter object scoped to a single org when an id is supplied. */
function orgFilter(orgId?: number): Record<string, any> {
  return orgId ? { organization_id: orgId } : {};
}

// Settings are looked up once per org per run.
function makeSettingsCache() {
  const cache = new Map<number, Awaited<ReturnType<typeof getNotificationSettings>>>();
  return async (org: number) => {
    if (!cache.has(org)) cache.set(org, await getNotificationSettings(org));
    return cache.get(org)!;
  };
}

// ---------------------------------------------------------------------------
// Review Deadline Reminder
// Finds active review cycles whose review_deadline falls within the configured
// window and reminds participants with pending reviews.
// ---------------------------------------------------------------------------

export async function processReviewDeadlineReminders(orgId?: number): Promise<void> {
  logger.info(`Processing review deadline reminders${orgId ? ` (org ${orgId})` : ""}...`);
  const db = getDB();
  const getSettings = makeSettingsCache();

  try {
    const today = dayjs();
    // Upper bound: longest plausible reminder window. We still re-check per-org
    // settings below, but bounding the query keeps it from scanning history.
    const horizon = today.add(60, "day").endOf("day").toDate();

    const cycles = await db.findMany<any>("review_cycles", {
      filters: {
        ...orgFilter(orgId),
        status: "active",
        review_deadline: { op: "<=", value: horizon },
      },
      limit: 10000,
    });

    let sentCount = 0;

    for (const cycle of cycles.data) {
      if (!cycle.review_deadline) continue;

      const settings = await getSettings(cycle.organization_id);
      if (!settings.review_reminders_enabled) continue;

      const deadline = dayjs(cycle.review_deadline);
      const daysUntil = deadline.diff(today, "day");
      if (daysUntil < 0 || daysUntil > settings.reminder_days_before_deadline) continue;

      const participants = await db.findMany<any>("review_cycle_participants", {
        filters: { cycle_id: cycle.id, status: "pending" },
        limit: 10000,
      });

      for (const participant of participants.data) {
        const user = await lookupUser(participant.employee_id);
        if (!user) continue;

        try {
          await sendReviewReminder(
            user.email,
            `${user.first_name} ${user.last_name}`,
            cycle.name,
            deadline.format("YYYY-MM-DD"),
            cycle.type ?? "performance",
          );
          sentCount++;
          await logDelivery({
            organizationId: cycle.organization_id,
            category: "review_reminder",
            recipient: user.email,
            subject: `Review reminder: ${cycle.name}`,
            status: "sent",
          });
        } catch (err) {
          logger.error(`Failed to send review reminder to ${user.email}:`, err);
          await logDelivery({
            organizationId: cycle.organization_id,
            category: "review_reminder",
            recipient: user.email,
            subject: `Review reminder: ${cycle.name}`,
            status: "failed",
            error: (err as Error).message,
          });
        }
      }
    }

    logger.info(`Review deadline reminders sent: ${sentCount}`);
  } catch (error) {
    logger.error("Error processing review deadline reminders:", error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// PIP Check-In Reminder — weekly reminders to employee + manager.
// ---------------------------------------------------------------------------

export async function processPIPCheckInReminders(orgId?: number): Promise<void> {
  logger.info(`Processing PIP check-in reminders${orgId ? ` (org ${orgId})` : ""}...`);
  const db = getDB();
  const getSettings = makeSettingsCache();

  try {
    const pips = await db.findMany<any>("performance_improvement_plans", {
      filters: { ...orgFilter(orgId), status: "active" },
      limit: 10000,
    });

    let sentCount = 0;
    const today = dayjs();

    for (const pip of pips.data) {
      const settings = await getSettings(pip.organization_id);
      if (!settings.pip_reminders_enabled) continue;

      const createdDay = dayjs(pip.created_at).day();
      const sendDay = createdDay || 1;
      if (today.day() !== sendDay) continue;

      const pipTitle = pip.title || pip.reason?.substring(0, 50) || "Performance Improvement Plan";
      const nextCheckIn = today.format("YYYY-MM-DD");

      const recipients: number[] = [pip.employee_id];
      if (pip.manager_id) recipients.push(pip.manager_id);

      for (const recipientId of recipients) {
        const person = await lookupUser(recipientId);
        if (!person) continue;
        try {
          await sendPIPCheckInReminder(
            person.email,
            `${person.first_name} ${person.last_name}`,
            pipTitle,
            nextCheckIn,
          );
          sentCount++;
          await logDelivery({
            organizationId: pip.organization_id,
            category: "pip_reminder",
            recipient: person.email,
            subject: `PIP check-in: ${pipTitle}`,
            status: "sent",
          });
        } catch (err) {
          logger.error(`Failed to send PIP reminder to ${person.email}:`, err);
          await logDelivery({
            organizationId: pip.organization_id,
            category: "pip_reminder",
            recipient: person.email,
            subject: `PIP check-in: ${pipTitle}`,
            status: "failed",
            error: (err as Error).message,
          });
        }
      }
    }

    logger.info(`PIP check-in reminders sent: ${sentCount}`);
  } catch (error) {
    logger.error("Error processing PIP check-in reminders:", error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// One-on-One Meeting Reminder — meetings scheduled for tomorrow.
// ---------------------------------------------------------------------------

export async function processOneOnOneReminders(orgId?: number): Promise<void> {
  logger.info(`Processing 1-on-1 meeting reminders${orgId ? ` (org ${orgId})` : ""}...`);
  const db = getDB();
  const getSettings = makeSettingsCache();

  try {
    const tomorrow = dayjs().add(1, "day");
    const tomorrowStart = tomorrow.startOf("day").toDate();
    const tomorrowEnd = tomorrow.endOf("day").toDate();

    // DB-side date range rather than loading all scheduled meetings (PL10).
    const meetings = await db.findMany<any>("one_on_one_meetings", {
      filters: {
        ...orgFilter(orgId),
        status: "scheduled",
        scheduled_at: { op: ">=", value: tomorrowStart },
      },
      limit: 10000,
    });

    let sentCount = 0;

    for (const meeting of meetings.data) {
      const scheduledAt = dayjs(meeting.scheduled_at);
      if (scheduledAt.toDate() > tomorrowEnd) continue;

      const settings = await getSettings(meeting.organization_id);
      if (!settings.meeting_reminders_enabled) continue;

      const manager = await lookupUser(meeting.manager_id);
      const employee = await lookupUser(meeting.employee_id);
      if (!manager || !employee) continue;

      try {
        await sendOneOnOneReminder(
          manager.email,
          employee.email,
          meeting.title,
          scheduledAt.format("YYYY-MM-DD HH:mm"),
        );
        sentCount++;
        await logDelivery({
          organizationId: meeting.organization_id,
          category: "meeting_reminder",
          recipient: `${manager.email}, ${employee.email}`,
          subject: `1-on-1 reminder: ${meeting.title}`,
          status: "sent",
        });
      } catch (err) {
        logger.error(`Failed to send meeting reminder for ${meeting.id}:`, err);
        await logDelivery({
          organizationId: meeting.organization_id,
          category: "meeting_reminder",
          recipient: `${manager.email}, ${employee.email}`,
          subject: `1-on-1 reminder: ${meeting.title}`,
          status: "failed",
          error: (err as Error).message,
        });
      }
    }

    logger.info(`1-on-1 meeting reminders sent: ${sentCount}`);
  } catch (error) {
    logger.error("Error processing 1-on-1 meeting reminders:", error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Goal Deadline Reminder — goals due within the configured window.
// ---------------------------------------------------------------------------

export async function processGoalDeadlineReminders(orgId?: number): Promise<void> {
  logger.info(`Processing goal deadline reminders${orgId ? ` (org ${orgId})` : ""}...`);
  const db = getDB();
  const getSettings = makeSettingsCache();

  try {
    const today = dayjs();
    const horizon = today.add(60, "day").endOf("day").toDate();

    // DB-side filter: only goals due on/before the horizon. The completed /
    // cancelled statuses are skipped in the loop below (the adapter has no
    // "not in" operator, so this stays a cheap post-filter on a bounded set).
    const goals = await db.findMany<any>("goals", {
      filters: {
        ...orgFilter(orgId),
        due_date: { op: "<=", value: horizon },
      },
      limit: 100000,
    });

    let sentCount = 0;

    for (const goal of goals.data) {
      if (!goal.due_date) continue;
      if (goal.status === "completed" || goal.status === "cancelled") continue;

      const settings = await getSettings(goal.organization_id);
      if (!settings.goal_reminders_enabled) continue;

      const dueDate = dayjs(goal.due_date);
      const daysUntil = dueDate.diff(today, "day");
      if (daysUntil < 0 || daysUntil > settings.reminder_days_before_deadline) continue;

      const user = await lookupUser(goal.employee_id);
      if (!user) continue;

      try {
        await sendGoalDeadlineReminder(
          user.email,
          `${user.first_name} ${user.last_name}`,
          goal.title,
          dueDate.format("YYYY-MM-DD"),
        );
        sentCount++;
        await logDelivery({
          organizationId: goal.organization_id,
          category: "goal_reminder",
          recipient: user.email,
          subject: `Goal deadline: ${goal.title}`,
          status: "sent",
        });
      } catch (err) {
        logger.error(`Failed to send goal reminder to ${user.email}:`, err);
        await logDelivery({
          organizationId: goal.organization_id,
          category: "goal_reminder",
          recipient: user.email,
          subject: `Goal deadline: ${goal.title}`,
          status: "failed",
          error: (err as Error).message,
        });
      }
    }

    logger.info(`Goal deadline reminders sent: ${sentCount}`);
  } catch (error) {
    logger.error("Error processing goal deadline reminders:", error);
    throw error;
  }
}

// ============================================================================
// NOTIFICATION SERVICE
// In-app notification feed (bell dropdown + /notifications page) and the
// outbound email/notification delivery log.
// All queries are scoped by organization_id and, for the feed, user_id.
// ============================================================================

import { v4 as uuidv4 } from "uuid";
import { getDB } from "../../db/adapters";
import { logger } from "../../utils/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Notification {
  id: string;
  organization_id: number;
  user_id: number;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  read_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateNotificationInput {
  organizationId: number;
  userId: number;
  type?: string;
  title: string;
  body?: string | null;
  link?: string | null;
}

export interface ListNotificationsParams {
  page?: number;
  perPage?: number;
  unreadOnly?: boolean;
}

export interface ListResult<T> {
  data: T[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

// ---------------------------------------------------------------------------
// Feed
// ---------------------------------------------------------------------------

/**
 * Create an in-app notification for a single user. Best-effort: failures are
 * logged but never thrown, so notification delivery can never break the
 * business action that triggered it.
 */
export async function createNotification(
  input: CreateNotificationInput,
): Promise<Notification | null> {
  const db = getDB();
  try {
    return await db.create<Notification>("notifications", {
      id: uuidv4(),
      organization_id: input.organizationId,
      user_id: input.userId,
      type: input.type ?? "system",
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
      is_read: false,
    } as any);
  } catch (err) {
    logger.error("Failed to create in-app notification:", err);
    return null;
  }
}

/**
 * Paginated feed of notifications for a user within their org.
 */
export async function listNotifications(
  orgId: number,
  userId: number,
  params: ListNotificationsParams = {},
): Promise<ListResult<Notification>> {
  const db = getDB();
  const page = params.page ?? 1;
  const perPage = params.perPage ?? 20;

  const filters: Record<string, any> = {
    organization_id: orgId,
    user_id: userId,
  };
  if (params.unreadOnly) filters.is_read = false;

  const result = await db.findMany<Notification>("notifications", {
    page,
    limit: perPage,
    sort: { field: "created_at", order: "desc" },
    filters,
  });

  return {
    data: result.data,
    total: result.total,
    page,
    perPage,
    totalPages: Math.ceil(result.total / perPage),
  };
}

/**
 * Count unread notifications for a user.
 */
export async function getUnreadCount(orgId: number, userId: number): Promise<number> {
  const db = getDB();
  return db.count("notifications", {
    organization_id: orgId,
    user_id: userId,
    is_read: false,
  });
}

/**
 * Mark a single notification as read. Verifies ownership (org + user) first.
 * Returns null if the notification does not belong to the caller.
 */
export async function markAsRead(
  orgId: number,
  userId: number,
  id: string,
): Promise<Notification | null> {
  const db = getDB();
  const existing = await db.findOne<Notification>("notifications", {
    id,
    organization_id: orgId,
    user_id: userId,
  });
  if (!existing) return null;
  if (existing.is_read) return existing;

  return db.update<Notification>("notifications", id, {
    is_read: true,
    read_at: new Date(),
  } as any);
}

/**
 * Mark every unread notification for a user as read. Returns the count updated.
 */
export async function markAllAsRead(orgId: number, userId: number): Promise<number> {
  const db = getDB();
  return db.updateMany(
    "notifications",
    { organization_id: orgId, user_id: userId, is_read: false },
    { is_read: true, read_at: new Date(), updated_at: new Date() },
  );
}

/**
 * Delete a notification (verifies ownership). Returns false if not found.
 */
export async function deleteNotification(
  orgId: number,
  userId: number,
  id: string,
): Promise<boolean> {
  const db = getDB();
  const existing = await db.findOne<Notification>("notifications", {
    id,
    organization_id: orgId,
    user_id: userId,
  });
  if (!existing) return false;
  return db.delete("notifications", id);
}

// ---------------------------------------------------------------------------
// Delivery log (PL11)
// ---------------------------------------------------------------------------

export interface NotificationLogEntry {
  id: string;
  organization_id: number;
  channel: string;
  category: string;
  recipient: string | null;
  subject: string | null;
  status: string;
  error: string | null;
  created_at: Date;
}

export interface LogDeliveryInput {
  organizationId: number;
  channel?: string;
  category: string;
  recipient?: string | null;
  subject?: string | null;
  status: "sent" | "failed";
  error?: string | null;
}

/**
 * Record an outbound delivery attempt. Best-effort: never throws.
 */
export async function logDelivery(input: LogDeliveryInput): Promise<void> {
  const db = getDB();
  try {
    await db.create<NotificationLogEntry>("notification_log", {
      id: uuidv4(),
      organization_id: input.organizationId,
      channel: input.channel ?? "email",
      category: input.category,
      recipient: input.recipient ?? null,
      subject: input.subject ?? null,
      status: input.status,
      error: input.error ?? null,
    } as any);
  } catch (err) {
    logger.error("Failed to write notification log entry:", err);
  }
}

export interface ListLogParams {
  page?: number;
  perPage?: number;
  status?: string;
  category?: string;
}

/**
 * Paginated, org-scoped delivery log for the admin Notification Log page.
 */
export async function listDeliveryLog(
  orgId: number,
  params: ListLogParams = {},
): Promise<ListResult<NotificationLogEntry>> {
  const db = getDB();
  const page = params.page ?? 1;
  const perPage = params.perPage ?? 20;

  const filters: Record<string, any> = { organization_id: orgId };
  if (params.status) filters.status = params.status;
  if (params.category) filters.category = params.category;

  const result = await db.findMany<NotificationLogEntry>("notification_log", {
    page,
    limit: perPage,
    sort: { field: "created_at", order: "desc" },
    filters,
  });

  return {
    data: result.data,
    total: result.total,
    page,
    perPage,
    totalPages: Math.ceil(result.total / perPage),
  };
}

// ============================================================================
// CONTINUOUS FEEDBACK SERVICE
// Manages giving/receiving feedback, kudos wall, and feedback visibility.
// ============================================================================

import { getDB } from "../../db/adapters";
import { NotFoundError, ForbiddenError, ValidationError } from "../../utils/errors";
import { logger } from "../../utils/logger";
import { findUserById } from "../../db/empcloud";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Feedback {
  id: string;
  organization_id: number;
  from_user_id: number;
  to_user_id: number;
  type: string;
  visibility: string;
  message: string;
  tags: string | null;
  is_anonymous: boolean;
  created_at: Date;
}

interface GiveFeedbackData {
  to_user_id: number;
  type: string; // "kudos" | "constructive" | "general"
  message: string;
  visibility?: string; // "public" | "manager_visible" | "private"
  tags?: string[];
  is_anonymous?: boolean;
}

interface UpdateFeedbackData {
  type?: string;
  message?: string;
  visibility?: string;
  tags?: string[];
}

interface ListFeedbackParams {
  page?: number;
  limit?: number;
  type?: string;
  search?: string;
}

// Columns scanned by free-text search on every feedback list.
const FEEDBACK_SEARCH_FIELDS = ["message", "tags"];

// Roles allowed to delete/manage any feedback in the org.
const FEEDBACK_ADMIN_ROLES = new Set(["super_admin", "org_admin", "hr_admin", "hr_manager"]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Strip the author identity from anonymous feedback before it leaves the
 * service so `from_user_id` never leaks for anonymous rows (#F2).
 */
function sanitizeAnonymous<T extends { is_anonymous?: boolean | number; from_user_id?: number | null }>(
  row: T,
): T {
  if (row.is_anonymous) {
    return { ...row, from_user_id: null };
  }
  return row;
}

function sanitizeMany<T extends { is_anonymous?: boolean | number; from_user_id?: number | null }>(
  rows: T[],
): T[] {
  return rows.map(sanitizeAnonymous);
}

/**
 * Best-effort EmpCloud lookup of display names for a set of user ids.
 * Degrades to an empty map so a master-DB hiccup never fails a feedback list.
 */
async function resolveUserNames(orgId: number, ids: (number | null | undefined)[]) {
  const map = new Map<number, string>();
  const unique = [...new Set(ids.filter((id): id is number => !!id && id > 0))];
  await Promise.all(
    unique.map(async (id) => {
      try {
        const user = await findUserById(id);
        if (user && user.organization_id === orgId) {
          const name = `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim();
          if (name) map.set(id, name);
        }
      } catch {
        // ignore — the client falls back to the id
      }
    }),
  );
  return map;
}

/**
 * Attach giver/recipient display names to feedback rows.
 *
 * Must run on rows that have already been through sanitizeMany: that nulls
 * from_user_id for anonymous feedback, so resolving names afterwards can never
 * put an anonymous author's name back on the wire.
 */
async function withUserNames<
  T extends { from_user_id?: number | null; to_user_id?: number | null },
>(orgId: number, rows: T[]): Promise<(T & { from_user_name: string | null; to_user_name: string | null })[]> {
  const names = await resolveUserNames(orgId, [
    ...rows.map((r) => r.from_user_id),
    ...rows.map((r) => r.to_user_id),
  ]);
  return rows.map((r) => ({
    ...r,
    from_user_name: r.from_user_id != null ? names.get(r.from_user_id) ?? null : null,
    to_user_name: r.to_user_id != null ? names.get(r.to_user_id) ?? null : null,
  }));
}

/** Verify a target user exists and belongs to the same org. */
async function assertOrgMember(orgId: number, userId: number): Promise<void> {
  const user = await findUserById(userId);
  if (!user || user.organization_id !== orgId) {
    throw new ValidationError("Recipient is not a member of your organization");
  }
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

export async function giveFeedback(
  orgId: number,
  fromUserId: number,
  data: GiveFeedbackData,
): Promise<Feedback> {
  const db = getDB();

  // Block self-feedback and verify the recipient is a real org member (#F4).
  if (data.to_user_id === fromUserId) {
    throw new ValidationError("You cannot give feedback to yourself");
  }
  await assertOrgMember(orgId, data.to_user_id);

  const feedback = await db.create<Feedback>("continuous_feedback", {
    organization_id: orgId,
    from_user_id: fromUserId,
    to_user_id: data.to_user_id,
    type: data.type,
    visibility: data.visibility || "manager_visible",
    message: data.message,
    tags: data.tags ? JSON.stringify(data.tags) : null,
    is_anonymous: data.is_anonymous || false,
  });

  logger.info(`Feedback given: ${data.type} from user ${fromUserId} to user ${data.to_user_id} (org: ${orgId})`);
  return feedback;
}

export async function listReceived(
  orgId: number,
  userId: number,
  params?: ListFeedbackParams,
) {
  const db = getDB();
  const filters: Record<string, any> = {
    organization_id: orgId,
    to_user_id: userId,
  };
  if (params?.type) filters.type = params.type;

  const result = await db.findMany<Feedback>("continuous_feedback", {
    page: params?.page || 1,
    limit: params?.limit || 20,
    filters,
    sort: { field: "created_at", order: "desc" },
    search: params?.search,
    searchFields: FEEDBACK_SEARCH_FIELDS,
  });
  // Even on the "received" list the giver may be anonymous (#F2).
  return { ...result, data: await withUserNames(orgId, sanitizeMany(result.data)) };
}

export async function listGiven(
  orgId: number,
  userId: number,
  params?: ListFeedbackParams,
) {
  const db = getDB();
  const filters: Record<string, any> = {
    organization_id: orgId,
    from_user_id: userId,
  };
  if (params?.type) filters.type = params.type;

  // The author is viewing their own outgoing feedback, so identity is theirs to see.
  const result = await db.findMany<Feedback>("continuous_feedback", {
    page: params?.page || 1,
    limit: params?.limit || 20,
    filters,
    sort: { field: "created_at", order: "desc" },
    search: params?.search,
    searchFields: FEEDBACK_SEARCH_FIELDS,
  });
  return { ...result, data: await withUserNames(orgId, result.data) };
}

export async function listAll(
  orgId: number,
  params?: ListFeedbackParams,
) {
  const db = getDB();
  const filters: Record<string, any> = {
    organization_id: orgId,
  };
  if (params?.type) filters.type = params.type;

  const result = await db.findMany<Feedback>("continuous_feedback", {
    page: params?.page || 1,
    limit: params?.limit || 20,
    filters,
    sort: { field: "created_at", order: "desc" },
    search: params?.search,
    searchFields: FEEDBACK_SEARCH_FIELDS,
  });
  return { ...result, data: await withUserNames(orgId, sanitizeMany(result.data)) };
}

export async function getPublicWall(
  orgId: number,
  params?: { page?: number; limit?: number; search?: string },
) {
  const db = getDB();
  const result = await db.findMany<Feedback>("continuous_feedback", {
    page: params?.page || 1,
    limit: params?.limit || 20,
    filters: {
      organization_id: orgId,
      visibility: "public",
    },
    sort: { field: "created_at", order: "desc" },
    search: params?.search,
    searchFields: FEEDBACK_SEARCH_FIELDS,
  });
  // Never expose the giver for anonymous kudos on the public wall (#F2).
  return { ...result, data: await withUserNames(orgId, sanitizeMany(result.data)) };
}

export async function getFeedback(
  orgId: number,
  id: string,
  actorUserId?: number,
  actorRole?: string,
): Promise<Feedback> {
  const db = getDB();
  const feedback = await db.findOne<Feedback>("continuous_feedback", {
    id,
    organization_id: orgId,
  });
  if (!feedback) {
    throw new NotFoundError("Feedback", id);
  }

  // Access scope: a non-public feedback item is only visible to the sender,
  // the recipient, or an admin. Anyone else gets a 404 (don't reveal it exists).
  // Callers that pass no actor (internal/trusted) keep the old behaviour.
  if (actorRole !== undefined) {
    const isAdmin = FEEDBACK_ADMIN_ROLES.has(actorRole);
    const isParticipant =
      feedback.from_user_id === actorUserId || feedback.to_user_id === actorUserId;
    const isPublic = feedback.visibility === "public";
    if (!isAdmin && !isParticipant && !isPublic) {
      throw new NotFoundError("Feedback", id);
    }
  }

  return sanitizeAnonymous(feedback);
}

export async function updateFeedback(
  orgId: number,
  id: string,
  actorUserId: number,
  actorRole: string,
  data: UpdateFeedbackData,
): Promise<Feedback> {
  const db = getDB();
  const feedback = await db.findOne<Feedback>("continuous_feedback", {
    id,
    organization_id: orgId,
  });
  if (!feedback) {
    throw new NotFoundError("Feedback", id);
  }

  // Only the original author (or an admin) may edit feedback.
  const isAuthor = feedback.from_user_id === actorUserId;
  if (!isAuthor && !FEEDBACK_ADMIN_ROLES.has(actorRole)) {
    throw new ForbiddenError("You can only edit feedback you authored");
  }

  const updates: Record<string, any> = {};
  if (data.type !== undefined) updates.type = data.type;
  if (data.message !== undefined) updates.message = data.message;
  if (data.visibility !== undefined) updates.visibility = data.visibility;
  if (data.tags !== undefined) updates.tags = data.tags.length ? JSON.stringify(data.tags) : null;

  const updated = await db.update<Feedback>("continuous_feedback", id, updates);
  logger.info(`Feedback updated: ${id} by user ${actorUserId} (org: ${orgId})`);
  return sanitizeAnonymous(updated);
}

export async function deleteFeedback(
  orgId: number,
  id: string,
  actorUserId: number,
  actorRole: string,
): Promise<void> {
  const db = getDB();
  const feedback = await db.findOne<Feedback>("continuous_feedback", {
    id,
    organization_id: orgId,
  });
  if (!feedback) {
    throw new NotFoundError("Feedback", id);
  }

  // Restrict hard-delete to admins or the feedback author (#F1).
  const isAuthor = feedback.from_user_id === actorUserId;
  if (!isAuthor && !FEEDBACK_ADMIN_ROLES.has(actorRole)) {
    throw new ForbiddenError("You can only delete feedback you authored");
  }

  await db.delete("continuous_feedback", id);
  logger.info(`Feedback deleted: ${id} by user ${actorUserId} (org: ${orgId})`);
}

// ============================================================================
// PEER REVIEW SERVICE
// Manages peer review nominations and approval workflow.
// ============================================================================

import { getDB } from "../../db/adapters";
import {
  NotFoundError,
  ValidationError,
  ConflictError,
  ForbiddenError,
} from "../../utils/errors";
import { logger } from "../../utils/logger";
import { findUserById } from "../../db/empcloud";

/** Verify a user exists and belongs to the given org. */
async function assertOrgMember(orgId: number, userId: number, label: string): Promise<void> {
  const user = await findUserById(userId);
  if (!user || user.organization_id !== orgId) {
    throw new ValidationError(`${label} is not a member of your organization`);
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface PeerNomination {
  id: string;
  cycle_id: string;
  employee_id: number;
  nominee_id: number;
  status: string;
  nominated_by: number;
  approved_by: number | null;
  declined_by: number | null;
  declined_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface ListNominationsParams {
  page?: number;
  limit?: number;
  employeeId?: number;
  nomineeId?: number;
  status?: string;
}

interface PeerCompetencyRating {
  competency_id: string;
  rating: number;
  comments?: string;
}

interface PeerReviewResponse {
  id: string;
  organization_id: number;
  nomination_id: string;
  cycle_id: string;
  reviewer_employee_id: number;
  reviewee_employee_id: number;
  overall_rating: number | null;
  ratings: string | null;
  strengths: string | null;
  improvements: string | null;
  comments: string | null;
  status: string;
  submitted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface SubmitPeerReviewInput {
  overall_rating: number;
  ratings?: PeerCompetencyRating[];
  strengths?: string;
  improvements?: string;
  comments?: string;
}

interface ListResponsesParams {
  page?: number;
  limit?: number;
  cycleId?: string;
  reviewerEmployeeId?: number;
  revieweeEmployeeId?: number;
  status?: string;
}

/** Deserialize the JSON `ratings` column for client consumption. */
function hydrateResponse(row: PeerReviewResponse) {
  return {
    ...row,
    ratings:
      typeof row.ratings === "string"
        ? (JSON.parse(row.ratings) as PeerCompetencyRating[])
        : ((row.ratings as PeerCompetencyRating[] | null) ?? []),
  };
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

export async function nominate(
  orgId: number,
  cycleId: string,
  employeeId: number,
  peerId: number,
  nominatedBy: number,
): Promise<PeerNomination> {
  const db = getDB();

  // Verify cycle belongs to org
  const cycle = await db.findOne<any>("review_cycles", {
    id: cycleId,
    organization_id: orgId,
  });
  if (!cycle) {
    throw new NotFoundError("Review cycle", cycleId);
  }

  // Prevent self-nomination
  if (employeeId === peerId) {
    throw new ValidationError("Cannot nominate self as peer reviewer");
  }

  // Verify both the subject employee and the nominated peer are real org users (#F4).
  await assertOrgMember(orgId, employeeId, "Employee");
  await assertOrgMember(orgId, peerId, "Nominated peer");

  // Check for duplicate nomination
  const existing = await db.findOne<PeerNomination>("peer_review_nominations", {
    cycle_id: cycleId,
    employee_id: employeeId,
    nominee_id: peerId,
  });
  if (existing) {
    throw new ConflictError("This peer has already been nominated for this employee in this cycle");
  }

  const nomination = await db.create<PeerNomination>("peer_review_nominations", {
    cycle_id: cycleId,
    employee_id: employeeId,
    nominee_id: peerId,
    status: "pending",
    nominated_by: nominatedBy,
    approved_by: null,
  });

  logger.info(`Peer nomination created: employee=${employeeId}, peer=${peerId}, cycle=${cycleId}`);
  return nomination;
}

export async function listNominations(
  orgId: number,
  cycleId: string,
  params?: ListNominationsParams,
) {
  const db = getDB();

  // Verify cycle belongs to org
  const cycle = await db.findOne<any>("review_cycles", {
    id: cycleId,
    organization_id: orgId,
  });
  if (!cycle) {
    throw new NotFoundError("Review cycle", cycleId);
  }

  const filters: Record<string, any> = { cycle_id: cycleId };
  if (params?.employeeId) filters.employee_id = params.employeeId;
  if (params?.nomineeId) filters.nominee_id = params.nomineeId;
  if (params?.status) filters.status = params.status;

  return db.findMany<PeerNomination>("peer_review_nominations", {
    page: params?.page || 1,
    limit: params?.limit || 50,
    filters,
    sort: { field: "created_at", order: "desc" },
  });
}

export async function approveNomination(
  orgId: number,
  nominationId: string,
  approvedBy: number,
): Promise<PeerNomination> {
  const db = getDB();
  const nomination = await db.findById<PeerNomination>("peer_review_nominations", nominationId);
  if (!nomination) {
    throw new NotFoundError("Peer nomination", nominationId);
  }

  // Verify cycle belongs to org
  const cycle = await db.findOne<any>("review_cycles", {
    id: nomination.cycle_id,
    organization_id: orgId,
  });
  if (!cycle) {
    throw new NotFoundError("Review cycle", nomination.cycle_id);
  }

  if (nomination.status !== "pending") {
    throw new ValidationError(`Cannot approve nomination with status '${nomination.status}'`);
  }

  const updated = await db.update<PeerNomination>("peer_review_nominations", nominationId, {
    status: "approved",
    approved_by: approvedBy,
  });

  logger.info(`Peer nomination approved: ${nominationId} by user ${approvedBy}`);
  return updated;
}

export async function declineNomination(
  orgId: number,
  nominationId: string,
  declinedBy: number,
): Promise<PeerNomination> {
  const db = getDB();
  const nomination = await db.findById<PeerNomination>("peer_review_nominations", nominationId);
  if (!nomination) {
    throw new NotFoundError("Peer nomination", nominationId);
  }

  // Verify cycle belongs to org
  const cycle = await db.findOne<any>("review_cycles", {
    id: nomination.cycle_id,
    organization_id: orgId,
  });
  if (!cycle) {
    throw new NotFoundError("Review cycle", nomination.cycle_id);
  }

  if (nomination.status !== "pending") {
    throw new ValidationError(`Cannot decline nomination with status '${nomination.status}'`);
  }

  // Record the decline in dedicated columns; approved_by stays null so a
  // declined nomination never masquerades as approved (#R4).
  const updated = await db.update<PeerNomination>("peer_review_nominations", nominationId, {
    status: "declined",
    declined_by: declinedBy,
    declined_at: new Date(),
  });

  logger.info(`Peer nomination declined: ${nominationId} by user ${declinedBy}`);
  return updated;
}

// ---------------------------------------------------------------------------
// Peer review submission (#F9)
// ---------------------------------------------------------------------------

/**
 * Submit (or create) the actual peer review for an approved nomination.
 *
 * Guards:
 * - the nomination must belong to the caller's org and be `approved`
 * - only the nominated peer (reviewer) may submit
 * - idempotent: a submitted response can't be overwritten; a duplicate submit
 *   is rejected rather than creating a second row (also enforced by a unique
 *   index on nomination_id).
 */
export async function submitPeerReview(
  orgId: number,
  nominationId: string,
  reviewerId: number,
  data: SubmitPeerReviewInput,
): Promise<ReturnType<typeof hydrateResponse>> {
  const db = getDB();

  const nomination = await db.findById<PeerNomination>("peer_review_nominations", nominationId);
  if (!nomination) {
    throw new NotFoundError("Peer nomination", nominationId);
  }

  // Verify the nomination's cycle belongs to the caller's org.
  const cycle = await db.findOne<any>("review_cycles", {
    id: nomination.cycle_id,
    organization_id: orgId,
  });
  if (!cycle) {
    throw new NotFoundError("Review cycle", nomination.cycle_id);
  }

  // Only the nominated reviewer may submit, and only once the nomination is approved.
  if (nomination.nominee_id !== reviewerId) {
    throw new ForbiddenError("Only the nominated reviewer may submit this peer review");
  }
  if (nomination.status !== "approved") {
    throw new ValidationError(
      `Cannot submit a peer review for a nomination with status '${nomination.status}'`,
    );
  }

  const ratingsJson = data.ratings && data.ratings.length ? JSON.stringify(data.ratings) : null;

  // Idempotency: reuse the existing response row for this nomination if present.
  const existing = await db.findOne<PeerReviewResponse>("peer_review_responses", {
    organization_id: orgId,
    nomination_id: nominationId,
  });

  if (existing) {
    if (existing.status === "submitted") {
      throw new ConflictError("This peer review has already been submitted");
    }
    const updated = await db.update<PeerReviewResponse>("peer_review_responses", existing.id, {
      overall_rating: data.overall_rating,
      ratings: ratingsJson,
      strengths: data.strengths ?? null,
      improvements: data.improvements ?? null,
      comments: data.comments ?? null,
      status: "submitted",
      submitted_at: new Date(),
    });
    logger.info(`Peer review submitted (updated): nomination=${nominationId} reviewer=${reviewerId}`);
    return hydrateResponse(updated);
  }

  const created = await db.create<PeerReviewResponse>("peer_review_responses", {
    organization_id: orgId,
    nomination_id: nominationId,
    cycle_id: nomination.cycle_id,
    reviewer_employee_id: reviewerId,
    reviewee_employee_id: nomination.employee_id,
    overall_rating: data.overall_rating,
    ratings: ratingsJson,
    strengths: data.strengths ?? null,
    improvements: data.improvements ?? null,
    comments: data.comments ?? null,
    status: "submitted",
    submitted_at: new Date(),
  });

  logger.info(`Peer review submitted: nomination=${nominationId} reviewer=${reviewerId}`);
  return hydrateResponse(created);
}

/**
 * Fetch the peer-review response for a single nomination, org-scoped. The
 * caller must be the reviewer, the reviewee, or an HR/admin (the route layer
 * gates admin access; here we enforce reviewer/reviewee ownership). Returns
 * null when no response exists yet so the reviewer's form can render empty.
 */
export async function getResponse(
  orgId: number,
  nominationId: string,
  requesterId: number,
  isAdmin: boolean,
): Promise<ReturnType<typeof hydrateResponse> | null> {
  const db = getDB();

  const nomination = await db.findById<PeerNomination>("peer_review_nominations", nominationId);
  if (!nomination) {
    throw new NotFoundError("Peer nomination", nominationId);
  }

  const cycle = await db.findOne<any>("review_cycles", {
    id: nomination.cycle_id,
    organization_id: orgId,
  });
  if (!cycle) {
    throw new NotFoundError("Review cycle", nomination.cycle_id);
  }

  const isParticipant =
    nomination.nominee_id === requesterId || nomination.employee_id === requesterId;
  if (!isAdmin && !isParticipant) {
    throw new ForbiddenError("You do not have access to this peer review");
  }

  const response = await db.findOne<PeerReviewResponse>("peer_review_responses", {
    organization_id: orgId,
    nomination_id: nominationId,
  });
  return response ? hydrateResponse(response) : null;
}

/** List peer-review responses for the org, filterable by cycle/reviewer/reviewee/status. */
export async function listResponses(orgId: number, params?: ListResponsesParams) {
  const db = getDB();

  const filters: Record<string, any> = { organization_id: orgId };
  if (params?.cycleId) filters.cycle_id = params.cycleId;
  if (params?.reviewerEmployeeId) filters.reviewer_employee_id = params.reviewerEmployeeId;
  if (params?.revieweeEmployeeId) filters.reviewee_employee_id = params.revieweeEmployeeId;
  if (params?.status) filters.status = params.status;

  const result = await db.findMany<PeerReviewResponse>("peer_review_responses", {
    page: params?.page || 1,
    limit: params?.limit || 50,
    filters,
    sort: { field: "created_at", order: "desc" },
  });

  return { ...result, data: result.data.map(hydrateResponse) };
}

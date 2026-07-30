import { v4 as uuidv4 } from "uuid";
import { getDB } from "../../db/adapters";
import { NotFoundError, ValidationError, AppError } from "../../utils/errors";
import { findUserById } from "../../db/empcloud";
import type {
  ReviewCycle,
  ReviewCycleParticipant,
  ReviewCycleStatus,
  RatingDistribution,
  Review,
} from "@emp-performance/shared";

// Columns that may be used in an ORDER BY for the cycle list. Anything not in
// this set falls back to created_at, preventing SQL injection through the
// client-supplied `sort` query param (#R3).
const CYCLE_SORTABLE_COLUMNS = new Set([
  "created_at",
  "updated_at",
  "name",
  "type",
  "status",
  "start_date",
  "end_date",
  "review_deadline",
]);

// ---------------------------------------------------------------------------
// Cycle CRUD
// ---------------------------------------------------------------------------

export async function createCycle(
  orgId: number,
  data: {
    name: string;
    type: string;
    start_date: string;
    end_date: string;
    review_deadline?: string;
    framework_id?: string;
    description?: string;
  },
  createdBy: number,
): Promise<ReviewCycle> {
  const db = getDB();

  // End date must not precede start date — guard the DB write so the API
  // returns a clear validation error instead of letting an invalid range
  // through (#11).
  if (data.end_date < data.start_date) {
    throw new ValidationError("End date cannot be before start date");
  }
  if (data.review_deadline && data.review_deadline < data.start_date) {
    throw new ValidationError("Review deadline cannot be before start date");
  }

  const record: Record<string, any> = {
    id: uuidv4(),
    organization_id: orgId,
    name: data.name,
    type: data.type,
    status: "draft",
    start_date: data.start_date,
    end_date: data.end_date,
    review_deadline: data.review_deadline ?? null,
    framework_id: data.framework_id ?? null,
    description: data.description ?? null,
    created_by: createdBy,
  };
  return db.create<ReviewCycle>("review_cycles", record as any);
}

export async function listCycles(
  orgId: number,
  params: {
    page?: number;
    perPage?: number;
    status?: string;
    type?: string;
    search?: string;
    sort?: string;
    order?: "asc" | "desc";
  },
): Promise<{ data: (ReviewCycle & { participant_count: number })[]; total: number; page: number; perPage: number }> {
  const db = getDB();
  const page = params.page ?? 1;
  const perPage = params.perPage ?? 20;

  const filters: Record<string, any> = { organization_id: orgId };
  if (params.status) filters.status = params.status;
  if (params.type) filters.type = params.type;

  const search = (params.search ?? "").trim();
  let result: { data: ReviewCycle[]; total: number; page: number; perPage: number; totalPages: number };

  if (search) {
    // The shared findMany helper has no LIKE support, so fall through to a
    // raw query for free-text search on name/description (#13).
    const offset = (page - 1) * perPage;
    const where: string[] = ["organization_id = ?"];
    const args: any[] = [orgId];
    if (params.status) {
      where.push("status = ?");
      args.push(params.status);
    }
    if (params.type) {
      where.push("type = ?");
      args.push(params.type);
    }
    where.push("(name LIKE ? OR description LIKE ?)");
    const term = `%${search}%`;
    args.push(term, term);

    // Whitelist the sort column and bind the direction so neither can be used
    // to inject SQL through the ORDER BY clause (#R3).
    const orderField = CYCLE_SORTABLE_COLUMNS.has(params.sort ?? "")
      ? (params.sort as string)
      : "created_at";
    const orderDir = (params.order ?? "desc").toUpperCase() === "ASC" ? "ASC" : "DESC";

    const rowsRes = await db.raw<any>(
      `SELECT * FROM review_cycles WHERE ${where.join(" AND ")} ORDER BY ${orderField} ${orderDir} LIMIT ? OFFSET ?`,
      [...args, perPage, offset],
    );
    const totalRes = await db.raw<any>(
      `SELECT COUNT(*) AS c FROM review_cycles WHERE ${where.join(" AND ")}`,
      args,
    );
    const rows = (Array.isArray(rowsRes) ? rowsRes[0] || rowsRes : []) as any[];
    const totalRows = (Array.isArray(totalRes) ? totalRes[0] || totalRes : []) as any[];
    const total = Number(totalRows?.[0]?.c ?? 0);
    result = {
      data: rows as ReviewCycle[],
      total,
      page,
      perPage,
      totalPages: Math.max(1, Math.ceil(total / perPage)),
    };
  } else {
    const queryResult = await db.findMany<ReviewCycle>("review_cycles", {
      page,
      limit: perPage,
      filters,
      sort: params.sort
        ? { field: params.sort, order: params.order ?? "desc" }
        : { field: "created_at", order: "desc" },
    });
    result = {
      data: queryResult.data,
      total: queryResult.total,
      page: queryResult.page,
      perPage: queryResult.limit,
      totalPages: queryResult.totalPages,
    };
  }

  // Attach participant counts
  const cyclesWithCounts = await Promise.all(
    result.data.map(async (cycle) => {
      const count = await db.count("review_cycle_participants", { cycle_id: cycle.id });
      return { ...cycle, participant_count: count };
    }),
  );

  return { data: cyclesWithCounts, total: result.total, page, perPage };
}

export async function getCycle(
  orgId: number,
  id: string,
): Promise<ReviewCycle & { participant_count: number; stats: { pending: number; submitted: number; draft: number } }> {
  const db = getDB();
  const cycle = await db.findOne<ReviewCycle>("review_cycles", {
    id,
    organization_id: orgId,
  });
  if (!cycle) throw new NotFoundError("ReviewCycle", id);

  const participantCount = await db.count("review_cycle_participants", { cycle_id: id });

  // Review stats
  const pending = await db.count("reviews", { cycle_id: id, organization_id: orgId, status: "pending" });
  const draft = await db.count("reviews", { cycle_id: id, organization_id: orgId, status: "draft" });
  const submitted = await db.count("reviews", { cycle_id: id, organization_id: orgId, status: "submitted" });

  return {
    ...cycle,
    participant_count: participantCount,
    stats: { pending, submitted, draft },
  };
}

export async function updateCycle(
  orgId: number,
  id: string,
  data: Record<string, any>,
): Promise<ReviewCycle> {
  const db = getDB();
  const existing = await db.findOne<ReviewCycle>("review_cycles", {
    id,
    organization_id: orgId,
  });
  if (!existing) throw new NotFoundError("ReviewCycle", id);
  if (existing.status === "completed" || existing.status === "cancelled") {
    throw new ValidationError("Cannot update a completed or cancelled cycle");
  }

  return db.update<ReviewCycle>("review_cycles", id, data as any);
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

// Delete a cycle that hasn't started yet. Block deletion of active cycles
// so we don't drop reviews mid-flight.
export async function deleteCycle(orgId: number, id: string): Promise<void> {
  const db = getDB();
  const cycle = await db.findOne<ReviewCycle>("review_cycles", {
    id,
    organization_id: orgId,
  });
  if (!cycle) throw new NotFoundError("ReviewCycle", id);
  if (cycle.status !== "draft") {
    throw new ValidationError("Only draft cycles can be deleted");
  }
  await db.delete("review_cycles", id);
}

export async function launchCycle(orgId: number, id: string): Promise<ReviewCycle> {
  const db = getDB();
  const cycle = await db.findOne<ReviewCycle>("review_cycles", {
    id,
    organization_id: orgId,
  });
  if (!cycle) throw new NotFoundError("ReviewCycle", id);
  if (cycle.status !== "draft") {
    throw new ValidationError("Only draft cycles can be launched");
  }

  const participantCount = await db.count("review_cycle_participants", { cycle_id: id });
  if (participantCount === 0) {
    throw new ValidationError("Cannot launch a cycle with no participants");
  }

  // Generate the review rows for every participant so reviewers actually have
  // something to fill in once the cycle is live (#R2). Previously launch only
  // flipped the status and no reviews were ever created.
  const launched = await db.update<ReviewCycle>("review_cycles", id, { status: "active" } as any);
  await generateReviewsForCycle(orgId, id);
  return launched;
}

// Creates the self + manager (+ approved peer) review rows for each cycle
// participant. Idempotent: skips any (employee, reviewer, type) tuple that
// already exists, so re-running after adding participants is safe.
export async function generateReviewsForCycle(orgId: number, cycleId: string): Promise<number> {
  const db = getDB();

  const participants = await db.findMany<ReviewCycleParticipant>("review_cycle_participants", {
    filters: { cycle_id: cycleId },
    limit: 100000,
  });

  // Approved peer nominations grouped by employee.
  const approvedPeers = await db.findMany<{ employee_id: number; nominee_id: number }>(
    "peer_review_nominations",
    { filters: { cycle_id: cycleId, status: "approved" }, limit: 100000 },
  );
  const peersByEmployee = new Map<number, number[]>();
  for (const nom of approvedPeers.data) {
    const list = peersByEmployee.get(nom.employee_id) ?? [];
    list.push(nom.nominee_id);
    peersByEmployee.set(nom.employee_id, list);
  }

  let created = 0;
  for (const participant of participants.data) {
    const targets: { reviewer_id: number; type: string }[] = [
      { reviewer_id: participant.employee_id, type: "self" },
    ];
    if (participant.manager_id) {
      targets.push({ reviewer_id: participant.manager_id, type: "manager" });
    }
    for (const peerId of peersByEmployee.get(participant.employee_id) ?? []) {
      targets.push({ reviewer_id: peerId, type: "peer" });
    }

    for (const t of targets) {
      const existing = await db.findOne<Review>("reviews", {
        cycle_id: cycleId,
        employee_id: participant.employee_id,
        reviewer_id: t.reviewer_id,
        type: t.type,
        organization_id: orgId,
      });
      if (existing) continue;

      await db.create<Review>("reviews", {
        id: uuidv4(),
        organization_id: orgId,
        cycle_id: cycleId,
        employee_id: participant.employee_id,
        reviewer_id: t.reviewer_id,
        type: t.type,
        status: "pending",
        overall_rating: null,
        summary: null,
        strengths: null,
        improvements: null,
        submitted_at: null,
      } as any);
      created++;
    }
  }

  return created;
}

export async function closeCycle(orgId: number, id: string): Promise<ReviewCycle> {
  const db = getDB();
  const cycle = await db.findOne<ReviewCycle>("review_cycles", {
    id,
    organization_id: orgId,
  });
  if (!cycle) throw new NotFoundError("ReviewCycle", id);
  if (cycle.status !== "active" && cycle.status !== "in_review" && cycle.status !== "calibration") {
    throw new ValidationError("Only active, in_review, or calibration cycles can be closed");
  }

  // Compute average final ratings for each participant (from submitted reviews)
  const participants = await db.findMany<ReviewCycleParticipant>("review_cycle_participants", {
    filters: { cycle_id: id },
  });

  for (const participant of participants.data) {
    const reviews = await db.findMany<Review>("reviews", {
      filters: {
        cycle_id: id,
        employee_id: participant.employee_id,
        status: "submitted",
        organization_id: orgId,
      },
    });

    if (reviews.data.length > 0) {
      const totalRating = reviews.data.reduce((sum, r) => sum + (Number(r.overall_rating) || 0), 0);
      const avgRating = Math.round((totalRating / reviews.data.length) * 100) / 100;
      await db.update("review_cycle_participants", participant.id, {
        final_rating: avgRating,
        status: "completed",
      } as any);
    }
  }

  // Persist the rating distribution snapshot so analytics/exports can read it
  // back without recomputing over thousands of reviews on every request (#R11).
  await persistRatingDistribution(orgId, id);

  const closedCycle = await db.update<ReviewCycle>("review_cycles", id, { status: "completed" } as any);

  // Notify EMP Cloud about the cycle completion (non-blocking)
  const webhookUrl = process.env.EMPCLOUD_WEBHOOK_URL;
  if (webhookUrl) {
    fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "performance.cycle_completed",
        data: {
          cycleId: id,
          cycleName: cycle.name,
          participantCount: participants.data.length,
        },
        source: "emp-performance",
        timestamp: new Date().toISOString(),
      }),
    }).catch(() => {}); // fire-and-forget
  }

  return closedCycle;
}

// Move a cycle into an explicit intermediate workflow state. Allowed forward
// transitions: active -> in_review -> calibration (#R8).
const FORWARD_TRANSITIONS: Record<string, string[]> = {
  active: ["in_review"],
  in_review: ["calibration", "active"],
  calibration: ["in_review"],
};

export async function transitionCycle(
  orgId: number,
  id: string,
  toStatus: "in_review" | "calibration" | "active",
): Promise<ReviewCycle> {
  const db = getDB();
  const cycle = await db.findOne<ReviewCycle>("review_cycles", {
    id,
    organization_id: orgId,
  });
  if (!cycle) throw new NotFoundError("ReviewCycle", id);

  const allowed = FORWARD_TRANSITIONS[cycle.status] ?? [];
  if (!allowed.includes(toStatus)) {
    throw new ValidationError(
      `Cannot move a '${cycle.status}' cycle to '${toStatus}'`,
    );
  }

  return db.update<ReviewCycle>("review_cycles", id, { status: toStatus } as any);
}

// Reopen a completed cycle back to active so reviews can be corrected or added.
// Clears the participants' completed status/final rating so closing recomputes
// them cleanly (#R8).
export async function reopenCycle(orgId: number, id: string): Promise<ReviewCycle> {
  const db = getDB();
  const cycle = await db.findOne<ReviewCycle>("review_cycles", {
    id,
    organization_id: orgId,
  });
  if (!cycle) throw new NotFoundError("ReviewCycle", id);
  if (cycle.status !== "completed") {
    throw new ValidationError("Only completed cycles can be reopened");
  }

  const participants = await db.findMany<ReviewCycleParticipant>("review_cycle_participants", {
    filters: { cycle_id: id },
    limit: 100000,
  });
  for (const participant of participants.data) {
    if (participant.status === "completed") {
      await db.update("review_cycle_participants", participant.id, {
        status: "pending",
      } as any);
    }
  }

  return db.update<ReviewCycle>("review_cycles", id, { status: "active" } as any);
}

// ---------------------------------------------------------------------------
// Participants
// ---------------------------------------------------------------------------

export async function addParticipants(
  orgId: number,
  cycleId: string,
  participants: { employee_id: number; manager_id?: number }[],
): Promise<ReviewCycleParticipant[]> {
  const db = getDB();
  const cycle = await db.findOne<ReviewCycle>("review_cycles", {
    id: cycleId,
    organization_id: orgId,
  });
  if (!cycle) throw new NotFoundError("ReviewCycle", cycleId);
  if (cycle.status !== "draft" && cycle.status !== "active") {
    throw new ValidationError("Can only add participants to draft or active cycles");
  }

  const created: ReviewCycleParticipant[] = [];
  for (const p of participants) {
    // Skip duplicates
    const existing = await db.findOne<ReviewCycleParticipant>("review_cycle_participants", {
      cycle_id: cycleId,
      employee_id: p.employee_id,
    });
    if (existing) continue;

    const record: Record<string, any> = {
      id: uuidv4(),
      cycle_id: cycleId,
      employee_id: p.employee_id,
      manager_id: p.manager_id ?? null,
      status: "pending",
    };
    const participant = await db.create<ReviewCycleParticipant>("review_cycle_participants", record as any);
    created.push(participant);
  }

  // If the cycle is already launched, generate the review rows for the newly
  // added participants too — otherwise reviews only ever get created by
  // launchCycle, so someone added to an active cycle got a participant row but
  // zero self/manager/peer reviews and could never be reviewed (audit M2).
  // generateReviewsForCycle is idempotent (skips existing tuples).
  if (cycle.status === "active" && created.length > 0) {
    await generateReviewsForCycle(orgId, cycleId);
  }

  return created;
}

export type ParticipantWithNames = ReviewCycleParticipant & {
  employee_name: string | null;
  manager_name: string | null;
};

export async function listParticipants(
  orgId: number,
  cycleId: string,
  params: {
    page?: number;
    perPage?: number;
    status?: string;
    search?: string;
  } = {},
): Promise<{ data: ParticipantWithNames[]; total: number; page: number; perPage: number }> {
  const db = getDB();
  const cycle = await db.findOne<ReviewCycle>("review_cycles", {
    id: cycleId,
    organization_id: orgId,
  });
  if (!cycle) throw new NotFoundError("ReviewCycle", cycleId);

  const page = params.page ?? 1;
  const perPage = params.perPage ?? 20;

  const filters: Record<string, any> = { cycle_id: cycleId };
  if (params.status) filters.status = params.status;

  const result = await db.findMany<ReviewCycleParticipant>("review_cycle_participants", {
    page,
    limit: perPage,
    filters,
    sort: { field: "created_at", order: "desc" },
  });

  // Resolve EmpCloud names so the UI does not have to render raw ids (#R7/#R6).
  const ids = new Set<number>();
  for (const p of result.data) {
    ids.add(p.employee_id);
    if (p.manager_id) ids.add(p.manager_id);
  }
  const nameMap = await resolveUserNames(orgId, [...ids]);

  let withNames: ParticipantWithNames[] = result.data.map((p) => ({
    ...p,
    employee_name: nameMap.get(p.employee_id) ?? null,
    manager_name: p.manager_id ? nameMap.get(p.manager_id) ?? null : null,
  }));

  // Free-text search runs over the resolved names + ids for the current page
  // worth of rows. (Participant counts per cycle are bounded, so an in-memory
  // filter is acceptable and keeps name resolution in one place.)
  const search = (params.search ?? "").trim().toLowerCase();
  let total = result.total;
  if (search) {
    const allRows = await db.findMany<ReviewCycleParticipant>("review_cycle_participants", {
      filters,
      limit: 100000,
    });
    const allIds = new Set<number>();
    for (const p of allRows.data) {
      allIds.add(p.employee_id);
      if (p.manager_id) allIds.add(p.manager_id);
    }
    const allNames = await resolveUserNames(orgId, [...allIds]);
    const matched = allRows.data
      .map((p) => ({
        ...p,
        employee_name: allNames.get(p.employee_id) ?? null,
        manager_name: p.manager_id ? allNames.get(p.manager_id) ?? null : null,
      }))
      .filter((p) => {
        const hay = `${p.employee_name ?? ""} ${p.manager_name ?? ""} ${p.employee_id} ${p.manager_id ?? ""}`.toLowerCase();
        return hay.includes(search);
      });
    total = matched.length;
    const start = (page - 1) * perPage;
    withNames = matched.slice(start, start + perPage);
  }

  return { data: withNames, total, page, perPage };
}

// Resolve a set of EmpCloud user ids to "First Last" display names, scoped to
// the org. Missing/foreign users resolve to null. Lookups are best-effort:
// if the EmpCloud DB is unavailable we degrade to ids only.
async function resolveUserNames(orgId: number, ids: number[]): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  await Promise.all(
    ids.map(async (id) => {
      try {
        const user = await findUserById(id);
        if (user && user.organization_id === orgId) {
          map.set(id, `${user.first_name} ${user.last_name}`.trim());
        }
      } catch {
        // ignore — leave unresolved
      }
    }),
  );
  return map;
}

export async function removeParticipant(
  orgId: number,
  cycleId: string,
  participantId: string,
): Promise<void> {
  const db = getDB();
  const cycle = await db.findOne<ReviewCycle>("review_cycles", {
    id: cycleId,
    organization_id: orgId,
  });
  if (!cycle) throw new NotFoundError("ReviewCycle", cycleId);
  if (cycle.status !== "draft") {
    throw new ValidationError("Can only remove participants from draft cycles");
  }

  const participant = await db.findOne<ReviewCycleParticipant>("review_cycle_participants", {
    id: participantId,
    cycle_id: cycleId,
  });
  if (!participant) throw new NotFoundError("Participant", participantId);

  await db.delete("review_cycle_participants", participantId);
}

// ---------------------------------------------------------------------------
// Ratings Distribution (bell-curve data)
// ---------------------------------------------------------------------------

export async function getRatingsDistribution(
  orgId: number,
  cycleId: string,
): Promise<RatingDistribution[]> {
  const db = getDB();
  const cycle = await db.findOne<ReviewCycle>("review_cycles", {
    id: cycleId,
    organization_id: orgId,
  });
  if (!cycle) throw new NotFoundError("ReviewCycle", cycleId);

  // Completed cycles read the persisted snapshot written at close time, so we
  // don't recompute over potentially thousands of reviews on each request (#R11).
  if (cycle.status === "completed") {
    const persisted = await db.findMany<RatingDistribution & { rating: number }>(
      "rating_distributions",
      { filters: { organization_id: orgId, cycle_id: cycleId }, limit: 10 },
    );
    if (persisted.data.length > 0) {
      const byRating = new Map<number, RatingDistribution>();
      for (const row of persisted.data) {
        byRating.set(row.rating, {
          rating: row.rating,
          count: row.count,
          percentage: Number(row.percentage),
        });
      }
      return [1, 2, 3, 4, 5].map(
        (rating) => byRating.get(rating) ?? { rating, count: 0, percentage: 0 },
      );
    }
  }

  return computeRatingDistribution(orgId, cycleId);
}

// Compute the live 1-5 bell-curve distribution from submitted reviews.
async function computeRatingDistribution(
  orgId: number,
  cycleId: string,
): Promise<RatingDistribution[]> {
  const db = getDB();
  const reviews = await db.findMany<Review>("reviews", {
    filters: { cycle_id: cycleId, organization_id: orgId, status: "submitted" },
    limit: 10000,
  });

  const buckets: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let total = 0;

  for (const review of reviews.data) {
    if (review.overall_rating !== null) {
      const rounded = Math.round(review.overall_rating);
      const clamped = Math.max(1, Math.min(5, rounded));
      buckets[clamped]++;
      total++;
    }
  }

  return [1, 2, 3, 4, 5].map((rating) => ({
    rating,
    count: buckets[rating],
    percentage: total > 0 ? Math.round((buckets[rating] / total) * 10000) / 100 : 0,
  }));
}

// Recompute and persist the distribution snapshot for a cycle (one row per
// rating bucket). Replaces any previous snapshot for the cycle (#R11).
async function persistRatingDistribution(orgId: number, cycleId: string): Promise<void> {
  const db = getDB();
  const distribution = await computeRatingDistribution(orgId, cycleId);

  const existing = await db.findMany<{ id: string }>("rating_distributions", {
    filters: { organization_id: orgId, cycle_id: cycleId },
    limit: 100,
  });
  for (const row of existing.data) {
    await db.delete("rating_distributions", row.id);
  }

  for (const bucket of distribution) {
    await db.create("rating_distributions", {
      id: uuidv4(),
      organization_id: orgId,
      cycle_id: cycleId,
      rating: bucket.rating,
      count: bucket.count,
      percentage: bucket.percentage,
    } as any);
  }
}

// ============================================================================
// SUCCESSION PLANNING SERVICE
// Create/list/manage succession plans and candidates.
// ============================================================================

import { v4 as uuidv4 } from "uuid";
import { getDB } from "../../db/adapters";
import { NotFoundError, ValidationError } from "../../utils/errors";
import type {
  SuccessionPlan,
  SuccessionCandidate,
} from "@emp-performance/shared";

// ---------------------------------------------------------------------------
// Succession Plans
// ---------------------------------------------------------------------------

export async function createSuccessionPlan(
  orgId: number,
  data: {
    position_title: string;
    current_holder_id?: number;
    department?: string;
    criticality?: string;
    status?: string;
  },
): Promise<SuccessionPlan> {
  const db = getDB();

  // Reject obviously invalid employee ids — they must be positive
  // integers that match an EmpCloud user row (#26).
  if (data.current_holder_id !== undefined && data.current_holder_id !== null) {
    if (!Number.isInteger(data.current_holder_id) || data.current_holder_id <= 0) {
      throw new ValidationError("current_holder_id must be a positive integer");
    }
  }

  const record: Record<string, any> = {
    id: uuidv4(),
    organization_id: orgId,
    position_title: data.position_title,
    current_holder_id: data.current_holder_id ?? null,
    department: data.department ?? null,
    criticality: data.criticality ?? "medium",
    status: data.status ?? "identified",
  };

  return db.create<SuccessionPlan>("succession_plans", record as any);
}

const PLAN_SORT_COLUMNS = new Set([
  "position_title",
  "department",
  "criticality",
  "status",
  "created_at",
  "updated_at",
]);

export async function listSuccessionPlans(
  orgId: number,
  params: {
    page?: number;
    perPage?: number;
    sort?: string;
    order?: "asc" | "desc";
    search?: string;
    criticality?: string;
    status?: string;
    department?: string;
  } = {},
): Promise<{
  data: (SuccessionPlan & { candidate_count: number })[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}> {
  const db = getDB();
  const page = params.page ?? 1;
  const perPage = params.perPage ?? 20;
  const sort =
    params.sort && PLAN_SORT_COLUMNS.has(params.sort) ? params.sort : "created_at";
  const order = params.order === "asc" ? "asc" : "desc";

  const filters: Record<string, any> = { organization_id: orgId };
  if (params.criticality) filters.criticality = params.criticality;
  if (params.status) filters.status = params.status;
  if (params.department) filters.department = params.department;

  const result = await db.findMany<SuccessionPlan>("succession_plans", {
    page,
    limit: perPage,
    filters,
    sort: { field: sort, order },
    search: params.search,
    searchFields: ["position_title", "department"],
  });

  // Grouped candidate counts in a single query instead of one COUNT per plan.
  const planIds = result.data.map((p) => p.id);
  const countMap = new Map<string, number>();
  if (planIds.length > 0) {
    const raw = await db.raw<any>(
      `SELECT plan_id, COUNT(*) AS c FROM succession_candidates WHERE plan_id IN (${planIds
        .map(() => "?")
        .join(",")}) GROUP BY plan_id`,
      planIds,
    );
    // The mysql2 driver returns knex.raw() results as a [rows, fields] tuple,
    // so the count rows live in raw[0]. Iterating `raw` directly walked the
    // tuple (row.plan_id was undefined), leaving every count at 0.
    const rows: { plan_id: string; c: number | string }[] = Array.isArray(raw)
      ? (Array.isArray(raw[0]) ? raw[0] : raw)
      : [];
    for (const row of rows) {
      countMap.set(row.plan_id, Number(row.c));
    }
  }

  const data = result.data.map((plan) => ({
    ...plan,
    candidate_count: countMap.get(plan.id) ?? 0,
  }));

  return {
    data,
    total: result.total,
    page: result.page,
    perPage: result.limit,
    totalPages: result.totalPages,
  };
}

export async function getSuccessionPlan(
  orgId: number,
  planId: string,
): Promise<SuccessionPlan & { candidates: SuccessionCandidate[] }> {
  const db = getDB();

  const plan = await db.findOne<SuccessionPlan>("succession_plans", {
    id: planId,
    organization_id: orgId,
  });
  if (!plan) throw new NotFoundError("SuccessionPlan", planId);

  const candidatesResult = await db.findMany<SuccessionCandidate>("succession_candidates", {
    filters: { plan_id: planId },
    limit: 1000,
  });

  return { ...plan, candidates: candidatesResult.data };
}

// S1: update plan lifecycle fields (status, criticality, department, title,
// current_holder). Whitelisted — never forwards req.body verbatim.
export async function updateSuccessionPlan(
  orgId: number,
  planId: string,
  data: {
    position_title?: string;
    current_holder_id?: number | null;
    department?: string | null;
    criticality?: string;
    status?: string;
  },
): Promise<SuccessionPlan> {
  const db = getDB();

  const plan = await db.findOne<SuccessionPlan>("succession_plans", {
    id: planId,
    organization_id: orgId,
  });
  if (!plan) throw new NotFoundError("SuccessionPlan", planId);

  if (data.current_holder_id !== undefined && data.current_holder_id !== null) {
    if (!Number.isInteger(data.current_holder_id) || data.current_holder_id <= 0) {
      throw new ValidationError("current_holder_id must be a positive integer");
    }
  }

  const updateData: Record<string, any> = {};
  if (data.position_title !== undefined) updateData.position_title = data.position_title;
  if (data.current_holder_id !== undefined)
    updateData.current_holder_id = data.current_holder_id ?? null;
  if (data.department !== undefined) updateData.department = data.department ?? null;
  if (data.criticality !== undefined) updateData.criticality = data.criticality;
  if (data.status !== undefined) updateData.status = data.status;

  return db.update<SuccessionPlan>("succession_plans", planId, updateData as any);
}

// S2: delete a plan (candidates cascade via FK).
export async function deleteSuccessionPlan(orgId: number, planId: string): Promise<void> {
  const db = getDB();
  const plan = await db.findOne<SuccessionPlan>("succession_plans", {
    id: planId,
    organization_id: orgId,
  });
  if (!plan) throw new NotFoundError("SuccessionPlan", planId);
  await db.delete("succession_plans", planId);
}

export async function addSuccessionCandidate(
  orgId: number,
  planId: string,
  data: {
    employee_id: number;
    readiness?: string;
    development_notes?: string;
    nine_box_position?: string;
  },
): Promise<SuccessionCandidate> {
  const db = getDB();

  const plan = await db.findOne<SuccessionPlan>("succession_plans", {
    id: planId,
    organization_id: orgId,
  });
  if (!plan) throw new NotFoundError("SuccessionPlan", planId);

  // S2: duplicate-candidate guard — the same employee cannot be added twice to
  // the same plan.
  const duplicate = await db.findOne<SuccessionCandidate>("succession_candidates", {
    plan_id: planId,
    employee_id: data.employee_id,
  });
  if (duplicate) {
    throw new ValidationError("This employee is already a candidate on this plan");
  }

  const record: Record<string, any> = {
    id: uuidv4(),
    plan_id: planId,
    employee_id: data.employee_id,
    readiness: data.readiness ?? "3_5_years",
    development_notes: data.development_notes ?? null,
    nine_box_position: data.nine_box_position ?? null,
  };

  return db.create<SuccessionCandidate>("succession_candidates", record as any);
}

export async function updateSuccessionCandidate(
  orgId: number,
  planId: string,
  candidateId: string,
  data: {
    readiness?: string;
    development_notes?: string | null;
    nine_box_position?: string | null;
  },
): Promise<SuccessionCandidate> {
  const db = getDB();

  const plan = await db.findOne<SuccessionPlan>("succession_plans", {
    id: planId,
    organization_id: orgId,
  });
  if (!plan) throw new NotFoundError("SuccessionPlan", planId);

  const candidate = await db.findOne<SuccessionCandidate>("succession_candidates", {
    id: candidateId,
    plan_id: planId,
  });
  if (!candidate) throw new NotFoundError("SuccessionCandidate", candidateId);

  const updateData: Record<string, any> = {};
  if (data.readiness !== undefined) updateData.readiness = data.readiness;
  if (data.development_notes !== undefined) updateData.development_notes = data.development_notes;
  if (data.nine_box_position !== undefined) updateData.nine_box_position = data.nine_box_position;

  return db.update<SuccessionCandidate>("succession_candidates", candidateId, updateData as any);
}

// S2: delete a candidate from a plan (ownership checked via the plan's org).
export async function deleteSuccessionCandidate(
  orgId: number,
  planId: string,
  candidateId: string,
): Promise<void> {
  const db = getDB();

  const plan = await db.findOne<SuccessionPlan>("succession_plans", {
    id: planId,
    organization_id: orgId,
  });
  if (!plan) throw new NotFoundError("SuccessionPlan", planId);

  const candidate = await db.findOne<SuccessionCandidate>("succession_candidates", {
    id: candidateId,
    plan_id: planId,
  });
  if (!candidate) throw new NotFoundError("SuccessionCandidate", candidateId);

  await db.delete("succession_candidates", candidateId);
}

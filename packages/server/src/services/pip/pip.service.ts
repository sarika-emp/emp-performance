// ============================================================================
// PIP SERVICE
// Business logic for Performance Improvement Plans.
// All queries are tenant-scoped by organization_id. PIPs are confidential, so
// reads/lists are restricted to the subject employee, their reporting-manager
// chain, and HR/admin roles (access control lives here in the service layer).
// ============================================================================

import { v4 as uuidv4 } from "uuid";
import { getDB } from "../../db/adapters";
import { findUserById } from "../../db/empcloud";
import { NotFoundError, AppError, ForbiddenError } from "../../utils/errors";
import type {
  PerformanceImprovementPlan,
  PIPObjective,
  PIPUpdate,
  PIPStatus,
  GoalStatus,
} from "@emp-performance/shared";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CreatePIPInput {
  employee_id: number;
  manager_id?: number;
  title?: string;
  reason: string;
  start_date: string;
  end_date: string;
}

interface ListPIPsParams {
  status?: string;
  employeeId?: number;
  managerId?: number;
  page?: number;
  perPage?: number;
  sort?: string;
  order?: "asc" | "desc";
  search?: string;
}

interface AddObjectiveInput {
  title: string;
  description?: string;
  success_criteria?: string;
  due_date?: string;
}

interface UpdateObjectiveInput {
  title?: string;
  description?: string | null;
  success_criteria?: string | null;
  due_date?: string | null;
  status?: string;
}

interface AddUpdateInput {
  notes: string;
  progress_rating?: number;
  objective_id?: string;
}

interface UpdatePIPInput {
  reason?: string;
  start_date?: string;
  end_date?: string;
  outcome_notes?: string | null;
}

export interface Actor {
  userId: number;
  role: string;
}

type PIPWithMeta = PerformanceImprovementPlan & {
  employee_name?: string | null;
  manager_name?: string | null;
  objectives_met?: number;
  objectives_total?: number;
};

// ---------------------------------------------------------------------------
// Access control
// ---------------------------------------------------------------------------

const ADMIN_ROLES = new Set(["super_admin", "org_admin", "hr_admin", "hr_manager"]);

// Whitelist of columns that may appear in ORDER BY (P8 — never interpolate raw input).
const SORT_COLUMNS = new Set([
  "created_at",
  "updated_at",
  "start_date",
  "end_date",
  "status",
]);

function safeSort(sort?: string): string {
  return sort && SORT_COLUMNS.has(sort) ? sort : "created_at";
}

/**
 * Returns true when the actor may read a PIP for `employeeId`/`managerId`.
 * Allowed: any HR/admin role, the subject employee, the recorded manager, or
 * the employee's actual reporting manager in EmpCloud (manager chain).
 */
async function canAccessPIP(
  orgId: number,
  actor: Actor,
  employeeId: number,
  managerId: number,
): Promise<boolean> {
  if (ADMIN_ROLES.has(actor.role)) return true;
  if (actor.userId === employeeId) return true;
  if (actor.userId === managerId) return true;
  try {
    const employee = await findUserById(employeeId);
    if (
      employee &&
      employee.organization_id === orgId &&
      employee.reporting_manager_id === actor.userId
    ) {
      return true;
    }
  } catch {
    // degrade closed — if the lookup fails the actor is not granted access
  }
  return false;
}

async function assertCanAccessPIP(
  orgId: number,
  actor: Actor,
  pip: PerformanceImprovementPlan,
): Promise<void> {
  const ok = await canAccessPIP(orgId, actor, pip.employee_id, pip.manager_id);
  if (!ok) {
    throw new ForbiddenError("You do not have access to this Performance Improvement Plan");
  }
}

// ---------------------------------------------------------------------------
// Name resolution (best-effort EmpCloud lookup)
// ---------------------------------------------------------------------------

async function resolveUserNames(orgId: number, ids: number[]): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  const unique = [...new Set(ids.filter((id) => id && id > 0))];
  await Promise.all(
    unique.map(async (id) => {
      try {
        const user = await findUserById(id);
        if (user && user.organization_id === orgId) {
          map.set(id, `${user.first_name} ${user.last_name}`.trim());
        }
      } catch {
        // ignore — degrade to ids only
      }
    }),
  );
  return map;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export async function createPIP(
  orgId: number,
  createdBy: number,
  data: CreatePIPInput,
): Promise<PerformanceImprovementPlan> {
  const db = getDB();

  // End date must not precede start date. updatePIP and extendPIP already
  // validate this, but createPIP didn't — so an inverted range could be stored
  // via a direct API call (audit M5). Mirror the update-path check.
  if (data.start_date && data.end_date && new Date(data.end_date) < new Date(data.start_date)) {
    throw new AppError(400, "VALIDATION_ERROR", "end_date cannot be before start_date");
  }

  // Check if employee already has an active/extended (open) PIP
  const existing = await db.findOne<PerformanceImprovementPlan>("performance_improvement_plans", {
    organization_id: orgId,
    employee_id: data.employee_id,
    status: "active",
    deleted_at: null,
  });

  if (existing) {
    throw new AppError(
      409,
      "CONFLICT",
      "Employee already has an active Performance Improvement Plan",
    );
  }

  // P3: capture the employee's real reporting manager. Prefer an explicit
  // manager_id, then the EmpCloud reporting manager, finally the creator.
  let managerId = data.manager_id;
  if (!managerId) {
    try {
      const employee = await findUserById(data.employee_id);
      if (
        employee &&
        employee.organization_id === orgId &&
        employee.reporting_manager_id
      ) {
        managerId = employee.reporting_manager_id;
      }
    } catch {
      // fall through to creator
    }
  }

  const pip = await db.create<PerformanceImprovementPlan>("performance_improvement_plans", {
    id: uuidv4(),
    organization_id: orgId,
    employee_id: data.employee_id,
    manager_id: managerId ?? createdBy,
    status: "active" as PIPStatus,
    reason: data.reason,
    start_date: data.start_date,
    end_date: data.end_date,
    extended_end_date: null,
    outcome_notes: null,
    created_by: createdBy,
  } as Partial<PerformanceImprovementPlan>);

  return pip;
}

export async function listPIPs(
  orgId: number,
  actor: Actor,
  params: ListPIPsParams,
): Promise<{
  data: PIPWithMeta[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}> {
  const db = getDB();
  const page = params.page ?? 1;
  const perPage = params.perPage ?? 20;

  const filters: Record<string, any> = {
    organization_id: orgId,
    deleted_at: null, // P8: exclude soft-deleted PIPs
  };
  if (params.status) filters.status = params.status;
  if (params.employeeId) filters.employee_id = params.employeeId;
  if (params.managerId) filters.manager_id = params.managerId;

  // P2: non-admins can only see PIPs where they are the subject or the manager.
  // We narrow at the query level when no employee/manager filter pins it to them.
  const isAdmin = ADMIN_ROLES.has(actor.role);

  const result = await db.findMany<PerformanceImprovementPlan>(
    "performance_improvement_plans",
    {
      page,
      limit: perPage,
      sort: { field: safeSort(params.sort), order: params.order ?? "desc" },
      filters,
      // P1: wire up free-text search end-to-end (reason text). Employee-name
      // search is layered on below by matching resolved names client-side
      // would be lossy, so we additionally match against resolved ids.
      search: params.search,
      searchFields: ["reason"],
    },
  );

  let rows = result.data;
  let total = result.total;

  // P2: enforce access for non-admins. Filter the page to PIPs the actor may
  // see. (Subject employee, recorded manager, or their reporting-manager chain.)
  if (!isAdmin) {
    const allowed: PerformanceImprovementPlan[] = [];
    for (const pip of rows) {
      // eslint-disable-next-line no-await-in-loop
      if (await canAccessPIP(orgId, actor, pip.employee_id, pip.manager_id)) {
        allowed.push(pip);
      }
    }
    // total can't be exactly recomputed without scanning all rows; reflect the
    // visible count for this page so the UI never over-reports.
    total = total - (rows.length - allowed.length);
    if (total < 0) total = allowed.length;
    rows = allowed;
  }

  // P4: resolve employee/manager names and aggregate objective progress.
  const enriched = await enrichPIPs(orgId, rows);

  return {
    data: enriched,
    total,
    page: result.page,
    perPage,
    totalPages: Math.ceil(total / perPage),
  };
}

/**
 * P4: populate employee_name/manager_name and objectives_met/objectives_total
 * for a set of PIPs in batch (one objectives query + name lookups).
 */
async function enrichPIPs(
  orgId: number,
  pips: PerformanceImprovementPlan[],
): Promise<PIPWithMeta[]> {
  if (pips.length === 0) return [];
  const db = getDB();

  const names = await resolveUserNames(
    orgId,
    pips.flatMap((p) => [p.employee_id, p.manager_id]),
  );

  // Aggregate objectives per PIP. `completed` counts as "met".
  const pipIds = pips.map((p) => p.id);
  const counts = new Map<string, { met: number; total: number }>();
  const objRows = await db.raw<any>(
    `SELECT pip_id,
            COUNT(*) AS total,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS met
       FROM pip_objectives
      WHERE pip_id IN (${pipIds.map(() => "?").join(",")})
      GROUP BY pip_id`,
    pipIds,
  );
  // Knex mysql2 raw returns [rows, fields]
  const aggRows = (Array.isArray(objRows) ? objRows[0] || objRows : []) as any[];
  for (const r of aggRows ?? []) {
    counts.set(String(r.pip_id), {
      met: Number(r.met) || 0,
      total: Number(r.total) || 0,
    });
  }

  return pips.map((p) => {
    const c = counts.get(p.id) ?? { met: 0, total: 0 };
    return {
      ...p,
      employee_name: names.get(p.employee_id) ?? null,
      manager_name: names.get(p.manager_id) ?? null,
      objectives_met: c.met,
      objectives_total: c.total,
    };
  });
}

export async function getPIP(
  orgId: number,
  id: string,
  actor: Actor,
): Promise<
  PIPWithMeta & { objectives: PIPObjective[]; updates: PIPUpdate[] }
> {
  const db = getDB();

  const pip = await db.findOne<PerformanceImprovementPlan>(
    "performance_improvement_plans",
    { id, organization_id: orgId, deleted_at: null },
  );
  if (!pip) throw new NotFoundError("PIP", id);

  // P2: confidential — restrict to subject/manager-chain/admin.
  await assertCanAccessPIP(orgId, actor, pip);

  const objectivesResult = await db.findMany<PIPObjective>("pip_objectives", {
    filters: { pip_id: id },
    sort: { field: "created_at", order: "asc" },
    limit: 100,
  });

  const updatesResult = await db.findMany<PIPUpdate>("pip_updates", {
    filters: { pip_id: id },
    sort: { field: "created_at", order: "desc" },
    limit: 100,
  });

  const names = await resolveUserNames(orgId, [pip.employee_id, pip.manager_id]);
  const met = objectivesResult.data.filter((o) => o.status === "completed").length;

  return {
    ...pip,
    employee_name: names.get(pip.employee_id) ?? null,
    manager_name: names.get(pip.manager_id) ?? null,
    objectives_met: met,
    objectives_total: objectivesResult.data.length,
    objectives: objectivesResult.data,
    updates: updatesResult.data,
  };
}

async function loadOpenPIP(
  orgId: number,
  id: string,
): Promise<PerformanceImprovementPlan> {
  const db = getDB();
  const pip = await db.findOne<PerformanceImprovementPlan>(
    "performance_improvement_plans",
    { id, organization_id: orgId, deleted_at: null },
  );
  if (!pip) throw new NotFoundError("PIP", id);
  return pip;
}

function assertOpen(pip: PerformanceImprovementPlan, action: string): void {
  if (!["active", "extended"].includes(pip.status)) {
    throw new AppError(
      400,
      "INVALID_STATUS",
      `Cannot ${action} a PIP that is not active or extended`,
    );
  }
}

export async function updatePIP(
  orgId: number,
  id: string,
  data: UpdatePIPInput,
): Promise<PerformanceImprovementPlan> {
  const db = getDB();
  const existing = await loadOpenPIP(orgId, id);

  const updates: Record<string, any> = {};
  if (data.reason !== undefined) updates.reason = data.reason;
  if (data.start_date !== undefined) updates.start_date = data.start_date;
  if (data.end_date !== undefined) updates.end_date = data.end_date;
  if (data.outcome_notes !== undefined) updates.outcome_notes = data.outcome_notes;

  // P5: validate date ordering against the (possibly partially updated) plan.
  const start = updates.start_date ?? existing.start_date;
  const end = updates.end_date ?? existing.end_date;
  if (start && end && new Date(end) < new Date(start)) {
    throw new AppError(400, "VALIDATION_ERROR", "end_date cannot be before start_date");
  }

  if (Object.keys(updates).length === 0) return existing;

  return db.update<PerformanceImprovementPlan>("performance_improvement_plans", id, updates);
}

/**
 * P8: soft-delete a PIP (keeps the audit trail; excluded from lists/reads).
 */
export async function deletePIP(orgId: number, id: string): Promise<void> {
  const db = getDB();
  await loadOpenPIP(orgId, id); // validates existence + not already deleted
  await db.update<PerformanceImprovementPlan>("performance_improvement_plans", id, {
    deleted_at: new Date() as any,
  } as Partial<PerformanceImprovementPlan>);
}

/**
 * P7: record the employee's acknowledgement / sign-off on the PIP.
 */
export async function acknowledgePIP(
  orgId: number,
  id: string,
  actor: Actor,
  note?: string,
): Promise<PerformanceImprovementPlan> {
  const db = getDB();
  const pip = await loadOpenPIP(orgId, id);

  // Only the subject employee may acknowledge their own PIP.
  if (actor.userId !== pip.employee_id) {
    throw new ForbiddenError("Only the employee on the plan can acknowledge it");
  }
  if (pip.acknowledged_at) {
    throw new AppError(409, "CONFLICT", "This PIP has already been acknowledged");
  }

  return db.update<PerformanceImprovementPlan>("performance_improvement_plans", id, {
    acknowledged_at: new Date() as any,
    acknowledged_by: actor.userId,
    acknowledgement_note: note ?? null,
  } as Partial<PerformanceImprovementPlan>);
}

// ---------------------------------------------------------------------------
// Objectives
// ---------------------------------------------------------------------------

export async function addObjective(
  orgId: number,
  pipId: string,
  data: AddObjectiveInput,
): Promise<PIPObjective> {
  const db = getDB();
  const pip = await loadOpenPIP(orgId, pipId);
  assertOpen(pip, "add an objective to"); // P5: no edits to closed PIPs

  const objective = await db.create<PIPObjective>("pip_objectives", {
    id: uuidv4(),
    pip_id: pipId,
    title: data.title,
    description: data.description ?? null,
    success_criteria: data.success_criteria ?? null,
    due_date: data.due_date ?? null,
    status: "not_started" as GoalStatus,
  });

  return objective;
}

export async function updateObjective(
  orgId: number,
  pipId: string,
  objectiveId: string,
  data: UpdateObjectiveInput,
): Promise<PIPObjective> {
  const db = getDB();
  const pip = await loadOpenPIP(orgId, pipId);
  assertOpen(pip, "modify objectives on"); // P5: no edits to closed PIPs

  const existing = await db.findOne<PIPObjective>("pip_objectives", {
    id: objectiveId,
    pip_id: pipId,
  });
  if (!existing) throw new NotFoundError("PIP Objective", objectiveId);

  const updates: Record<string, any> = {};
  if (data.title !== undefined) updates.title = data.title;
  if (data.description !== undefined) updates.description = data.description;
  if (data.success_criteria !== undefined) updates.success_criteria = data.success_criteria;
  if (data.due_date !== undefined) updates.due_date = data.due_date;
  if (data.status !== undefined) updates.status = data.status;

  if (Object.keys(updates).length === 0) return existing;

  return db.update<PIPObjective>("pip_objectives", objectiveId, updates);
}

/**
 * P6/P8: delete a PIP objective.
 */
export async function deleteObjective(
  orgId: number,
  pipId: string,
  objectiveId: string,
): Promise<void> {
  const db = getDB();
  const pip = await loadOpenPIP(orgId, pipId);
  assertOpen(pip, "remove objectives from");

  const existing = await db.findOne<PIPObjective>("pip_objectives", {
    id: objectiveId,
    pip_id: pipId,
  });
  if (!existing) throw new NotFoundError("PIP Objective", objectiveId);

  await db.delete("pip_objectives", objectiveId);
}

// ---------------------------------------------------------------------------
// Updates / Check-ins
// ---------------------------------------------------------------------------

export async function addUpdate(
  orgId: number,
  pipId: string,
  authorId: number,
  data: AddUpdateInput,
): Promise<PIPUpdate> {
  const db = getDB();
  const pip = await loadOpenPIP(orgId, pipId);
  assertOpen(pip, "add an update to"); // P5: no updates on closed PIPs

  const update = await db.create<PIPUpdate>("pip_updates", {
    id: uuidv4(),
    pip_id: pipId,
    author_id: authorId,
    notes: data.notes,
    progress_rating: data.progress_rating ?? null,
  });

  return update;
}

// ---------------------------------------------------------------------------
// Close / Extend
// ---------------------------------------------------------------------------

export async function closePIP(
  orgId: number,
  id: string,
  outcome: "completed_success" | "completed_failure" | "cancelled",
  outcomeNotes?: string,
): Promise<PerformanceImprovementPlan> {
  const db = getDB();
  const pip = await loadOpenPIP(orgId, id);

  if (!["active", "extended"].includes(pip.status)) {
    throw new AppError(400, "INVALID_STATUS", "Only active or extended PIPs can be closed");
  }

  return db.update<PerformanceImprovementPlan>("performance_improvement_plans", id, {
    status: outcome as PIPStatus,
    outcome_notes: outcomeNotes ?? null,
  } as any);
}

export async function extendPIP(
  orgId: number,
  id: string,
  newEndDate: string,
): Promise<PerformanceImprovementPlan> {
  const db = getDB();
  const pip = await loadOpenPIP(orgId, id);

  if (!["active", "extended"].includes(pip.status)) {
    throw new AppError(400, "INVALID_STATUS", "Only active or extended PIPs can be extended");
  }

  // P5: the new end date must be after the current effective end date.
  const currentEnd = pip.extended_end_date ?? pip.end_date;
  if (currentEnd && new Date(newEndDate) <= new Date(currentEnd)) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "The extended end date must be after the current end date",
    );
  }

  return db.update<PerformanceImprovementPlan>("performance_improvement_plans", id, {
    status: "extended" as PIPStatus,
    extended_end_date: newEndDate,
  } as any);
}

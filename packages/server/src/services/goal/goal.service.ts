// ============================================================================
// GOAL / OKR SERVICE
// Business logic for goals, key results, and check-ins.
// ============================================================================

import { v4 as uuidv4 } from "uuid";
import { getDB } from "../../db/adapters";
import { findUserById } from "../../db/empcloud";
import { AppError, NotFoundError } from "../../utils/errors";
import type {
  Goal,
  KeyResult,
  GoalCheckIn,
  GoalStatus,
  GoalCategory,
} from "@emp-performance/shared";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CreateGoalInput {
  title: string;
  description?: string;
  category?: string;
  priority?: string;
  start_date?: string;
  due_date?: string;
  cycle_id?: string;
  parent_goal_id?: string;
  employee_id?: number;
}

interface ListGoalsParams {
  employeeId?: number;
  cycleId?: string;
  category?: string;
  status?: string;
  page?: number;
  perPage?: number;
  sort?: string;
  order?: "asc" | "desc";
  search?: string;
  includeCancelled?: boolean;
}

type GoalWithKeyResults = Goal & { key_results: KeyResult[] };

interface AddKeyResultInput {
  title: string;
  metric_type?: string;
  target_value: number;
  current_value?: number;
  unit?: string;
  weight?: number;
}

interface CheckInInput {
  progress: number;
  notes?: string;
  key_result_id?: string;
  current_value?: number;
}

// Whitelist of columns that may be used in an ORDER BY clause. Prevents SQL
// injection via the client-supplied `sort` param in the raw search branch.
const SORTABLE_COLUMNS = new Set([
  "created_at",
  "updated_at",
  "title",
  "status",
  "category",
  "priority",
  "progress",
  "due_date",
  "start_date",
]);

function safeSortColumn(sort?: string): string {
  return sort && SORTABLE_COLUMNS.has(sort) ? sort : "created_at";
}

// ---------------------------------------------------------------------------
// Authorization helpers
// ---------------------------------------------------------------------------

const WRITE_ADMIN_ROLES = new Set([
  "super_admin",
  "org_admin",
  "hr_admin",
  "hr_manager",
]);

interface Actor {
  userId: number;
  role: string;
}

/**
 * Returns true if the actor may mutate the given goal: org/HR admins always
 * can; otherwise only the goal owner or the owner's reporting manager.
 */
export async function canWriteGoal(orgId: number, goal: Goal, actor: Actor): Promise<boolean> {
  if (WRITE_ADMIN_ROLES.has(actor.role)) return true;
  if (goal.employee_id === actor.userId) return true;
  // Manager-of-owner check against the EmpCloud master DB.
  try {
    const owner = await findUserById(goal.employee_id);
    if (owner && owner.organization_id === orgId && owner.reporting_manager_id === actor.userId) {
      return true;
    }
  } catch {
    // EmpCloud lookup unavailable — fall through to deny.
  }
  return false;
}

async function loadGoalForWrite(orgId: number, goalId: string, actor: Actor): Promise<Goal> {
  const db = getDB();
  const goal = await db.findOne<Goal>("goals", { id: goalId, organization_id: orgId });
  if (!goal) throw new NotFoundError("Goal", goalId);
  const allowed = await canWriteGoal(orgId, goal, actor);
  if (!allowed) {
    throw new AppError(403, "FORBIDDEN", "You do not have permission to modify this goal");
  }
  return goal;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export async function createGoal(
  orgId: number,
  createdBy: number,
  data: CreateGoalInput,
): Promise<Goal> {
  const db = getDB();

  // Validate parent goal belongs to same org if provided
  if (data.parent_goal_id) {
    const parent = await db.findOne<Goal>("goals", {
      id: data.parent_goal_id,
      organization_id: orgId,
    });
    if (!parent) {
      throw new NotFoundError("Parent goal", data.parent_goal_id);
    }
  }

  const goal = await db.create<Goal>("goals", {
    id: uuidv4(),
    organization_id: orgId,
    employee_id: data.employee_id ?? createdBy,
    title: data.title,
    description: data.description ?? null,
    category: (data.category ?? "individual") as GoalCategory,
    priority: (data.priority ?? "medium") as any,
    status: "not_started" as GoalStatus,
    progress: 0,
    start_date: data.start_date ?? null,
    due_date: data.due_date ?? null,
    completed_at: null,
    cycle_id: data.cycle_id ?? null,
    parent_goal_id: data.parent_goal_id ?? null,
    created_by: createdBy,
  });

  return goal;
}

export async function listGoals(
  orgId: number,
  params: ListGoalsParams,
): Promise<{
  data: GoalWithKeyResults[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}> {
  const db = getDB();
  const page = params.page ?? 1;
  const perPage = params.perPage ?? 20;

  const filters: Record<string, any> = { organization_id: orgId };
  if (params.employeeId) filters.employee_id = params.employeeId;
  if (params.cycleId) filters.cycle_id = params.cycleId;
  if (params.category) filters.category = params.category;
  if (params.status) filters.status = params.status;

  const search = (params.search ?? "").trim();

  let goals: Goal[];
  let total: number;
  let resultPage = page;

  if (search) {
    // findMany has no LIKE support, so issue a raw query for free-text
    // search on title/description (#14).
    const offset = (page - 1) * perPage;
    const where: string[] = ["organization_id = ?"];
    const args: any[] = [orgId];
    if (params.employeeId) {
      where.push("employee_id = ?");
      args.push(params.employeeId);
    }
    if (params.cycleId) {
      where.push("cycle_id = ?");
      args.push(params.cycleId);
    }
    if (params.category) {
      where.push("category = ?");
      args.push(params.category);
    }
    if (params.status) {
      where.push("status = ?");
      args.push(params.status);
    } else if (!params.includeCancelled) {
      // Exclude soft-deleted (cancelled) goals unless explicitly requested or
      // explicitly filtering for them (G4).
      where.push("status <> 'cancelled'");
    }
    where.push("(title LIKE ? OR description LIKE ?)");
    const term = `%${search}%`;
    args.push(term, term);

    // ORDER BY column is whitelisted (G6) — never interpolate raw client input.
    const orderField = safeSortColumn(params.sort);
    const orderDir = (params.order ?? "desc").toUpperCase() === "ASC" ? "ASC" : "DESC";

    const rowsRes = await db.raw<any>(
      `SELECT * FROM goals WHERE ${where.join(" AND ")} ORDER BY ${orderField} ${orderDir} LIMIT ? OFFSET ?`,
      [...args, perPage, offset],
    );
    const totalRes = await db.raw<any>(
      `SELECT COUNT(*) AS c FROM goals WHERE ${where.join(" AND ")}`,
      args,
    );
    const rows = (Array.isArray(rowsRes) ? rowsRes[0] || rowsRes : []) as any[];
    const totalRows = (Array.isArray(totalRes) ? totalRes[0] || totalRes : []) as any[];
    total = Number(totalRows?.[0]?.c ?? 0);
    goals = rows as Goal[];
  } else {
    // Exclude cancelled goals unless explicitly filtering for them (G4).
    if (!params.status && !params.includeCancelled) {
      filters.status = { op: "<>", value: "cancelled" };
    }

    const result = await db.findMany<Goal>("goals", {
      page,
      limit: perPage,
      sort: {
        field: safeSortColumn(params.sort),
        order: params.order ?? "desc",
      },
      filters,
    });
    goals = result.data;
    total = result.total;
    resultPage = result.page;
  }

  // Attach key-result summaries so the list expand row has data to show (G7).
  const withKRs = await attachKeyResults(goals);

  return {
    data: withKRs,
    total,
    page: resultPage,
    perPage,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
  };
}

/**
 * Bulk-load key results for a page of goals in a single query and attach them
 * to each goal as `key_results`.
 */
async function attachKeyResults(goals: Goal[]): Promise<GoalWithKeyResults[]> {
  if (goals.length === 0) return [];
  const db = getDB();
  const ids = goals.map((g) => g.id);
  const placeholders = ids.map(() => "?").join(", ");
  const krRes = await db.raw<any>(
    `SELECT * FROM key_results WHERE goal_id IN (${placeholders}) ORDER BY created_at ASC`,
    ids,
  );
  const rows = (Array.isArray(krRes) ? krRes[0] || krRes : []) as KeyResult[];
  const byGoal = new Map<string, KeyResult[]>();
  for (const kr of rows) {
    const list = byGoal.get(kr.goal_id) ?? [];
    list.push(kr);
    byGoal.set(kr.goal_id, list);
  }
  return goals.map((g) => ({ ...g, key_results: byGoal.get(g.id) ?? [] }));
}

export async function getGoal(
  orgId: number,
  id: string,
): Promise<Goal & { key_results: KeyResult[]; check_ins: GoalCheckIn[] }> {
  const db = getDB();

  const goal = await db.findOne<Goal>("goals", { id, organization_id: orgId });
  if (!goal) throw new NotFoundError("Goal", id);

  const krResult = await db.findMany<KeyResult>("key_results", {
    filters: { goal_id: id },
    sort: { field: "created_at", order: "asc" },
    limit: 100,
  });

  const checkInResult = await db.findMany<GoalCheckIn>("goal_check_ins", {
    filters: { goal_id: id },
    sort: { field: "created_at", order: "desc" },
    limit: 50,
  });

  return {
    ...goal,
    key_results: krResult.data,
    check_ins: checkInResult.data,
  };
}

interface UpdateGoalInput {
  title?: string;
  description?: string | null;
  category?: string;
  priority?: string;
  status?: string;
  start_date?: string | null;
  due_date?: string | null;
  cycle_id?: string | null;
  parent_goal_id?: string | null;
}

export async function updateGoal(
  orgId: number,
  id: string,
  data: UpdateGoalInput,
  actor: Actor,
): Promise<Goal> {
  const db = getDB();

  const existing = await loadGoalForWrite(orgId, id, actor);

  const updates: Record<string, any> = {};
  if (data.title !== undefined) updates.title = data.title;
  if (data.description !== undefined) updates.description = data.description;
  if (data.category !== undefined) updates.category = data.category;
  if (data.priority !== undefined) updates.priority = data.priority;
  if (data.status !== undefined) updates.status = data.status;
  if (data.start_date !== undefined) updates.start_date = data.start_date;
  if (data.due_date !== undefined) updates.due_date = data.due_date;
  if (data.cycle_id !== undefined) updates.cycle_id = data.cycle_id;

  // Re-parenting (G3): updateGoal previously dropped parent_goal_id entirely,
  // making re-alignment via PUT a silent no-op. Copy it through with same-org
  // and self/cycle/loop validation.
  if (data.parent_goal_id !== undefined) {
    if (data.parent_goal_id === null) {
      updates.parent_goal_id = null;
    } else {
      if (data.parent_goal_id === id) {
        throw new AppError(400, "INVALID_PARENT", "A goal cannot be its own parent");
      }
      const parent = await db.findOne<Goal>("goals", {
        id: data.parent_goal_id,
        organization_id: orgId,
      });
      if (!parent) throw new NotFoundError("Parent goal", data.parent_goal_id);

      // Cycle membership must match when both belong to a cycle.
      const effectiveCycle =
        data.cycle_id !== undefined ? data.cycle_id : existing.cycle_id;
      if (parent.cycle_id && effectiveCycle && parent.cycle_id !== effectiveCycle) {
        throw new AppError(
          400,
          "INVALID_PARENT",
          "Parent goal must belong to the same review cycle",
        );
      }

      // Loop check: the chosen parent must not be a descendant of this goal.
      await assertNoCycle(orgId, id, data.parent_goal_id);
      updates.parent_goal_id = data.parent_goal_id;
    }
  }

  if (data.status === "completed") {
    updates.completed_at = new Date().toISOString().slice(0, 19).replace("T", " ");
    updates.progress = 100;
  } else if (data.status !== undefined && existing.status === "completed") {
    // Re-opening a completed goal clears its completion timestamp (G11).
    updates.completed_at = null;
  }

  return db.update<Goal>("goals", id, updates);
}

/**
 * Walk the ancestor chain of `candidateParentId`; if `goalId` appears in it the
 * requested re-parent would introduce a cycle.
 */
async function assertNoCycle(
  orgId: number,
  goalId: string,
  candidateParentId: string,
): Promise<void> {
  const db = getDB();
  let cursor: string | null = candidateParentId;
  const seen = new Set<string>();
  while (cursor) {
    if (cursor === goalId) {
      throw new AppError(
        400,
        "INVALID_PARENT",
        "Re-parenting would create a cycle in the goal tree",
      );
    }
    if (seen.has(cursor)) break;
    seen.add(cursor);
    const node: Goal | null = await db.findOne<Goal>("goals", {
      id: cursor,
      organization_id: orgId,
    });
    cursor = node?.parent_goal_id ?? null;
  }
}

export async function deleteGoal(orgId: number, id: string, actor: Actor): Promise<void> {
  const db = getDB();

  await loadGoalForWrite(orgId, id, actor);

  // Soft delete via status change to cancelled
  await db.update<Goal>("goals", id, { status: "cancelled" as GoalStatus } as any);
}

// ---------------------------------------------------------------------------
// Key Results
// ---------------------------------------------------------------------------

export async function addKeyResult(
  orgId: number,
  goalId: string,
  data: AddKeyResultInput,
  actor: Actor,
): Promise<KeyResult> {
  const db = getDB();

  await loadGoalForWrite(orgId, goalId, actor);

  const kr = await db.create<KeyResult>("key_results", {
    id: uuidv4(),
    goal_id: goalId,
    title: data.title,
    metric_type: (data.metric_type ?? "number") as any,
    target_value: data.target_value,
    current_value: data.current_value ?? 0,
    unit: data.unit ?? null,
    weight: data.weight ?? 1,
  });

  // Recompute goal progress
  await computeGoalProgress(orgId, goalId);

  return kr;
}

interface UpdateKeyResultInput {
  title?: string;
  metric_type?: string;
  target_value?: number;
  current_value?: number;
  unit?: string | null;
  weight?: number;
}

export async function updateKeyResult(
  orgId: number,
  goalId: string,
  krId: string,
  data: UpdateKeyResultInput,
  actor: Actor,
): Promise<KeyResult> {
  const db = getDB();

  await loadGoalForWrite(orgId, goalId, actor);

  const existing = await db.findOne<KeyResult>("key_results", { id: krId, goal_id: goalId });
  if (!existing) throw new NotFoundError("Key Result", krId);

  const updates: Record<string, any> = {};
  if (data.title !== undefined) updates.title = data.title;
  if (data.metric_type !== undefined) updates.metric_type = data.metric_type;
  if (data.target_value !== undefined) updates.target_value = data.target_value;
  if (data.current_value !== undefined) updates.current_value = data.current_value;
  if (data.unit !== undefined) updates.unit = data.unit;
  if (data.weight !== undefined) updates.weight = data.weight;

  const updated = await db.update<KeyResult>("key_results", krId, updates);

  // Recompute goal progress
  await computeGoalProgress(orgId, goalId);

  return updated;
}

export async function deleteKeyResult(
  orgId: number,
  goalId: string,
  krId: string,
  actor: Actor,
): Promise<void> {
  const db = getDB();

  await loadGoalForWrite(orgId, goalId, actor);

  const existing = await db.findOne<KeyResult>("key_results", { id: krId, goal_id: goalId });
  if (!existing) throw new NotFoundError("Key Result", krId);

  await db.delete("key_results", krId);

  // Recompute goal progress
  await computeGoalProgress(orgId, goalId);
}

// ---------------------------------------------------------------------------
// Check-ins
// ---------------------------------------------------------------------------

export async function checkIn(
  orgId: number,
  goalId: string,
  authorId: number,
  data: CheckInInput,
  actor: Actor,
): Promise<GoalCheckIn> {
  const db = getDB();

  const goal = await loadGoalForWrite(orgId, goalId, actor);

  // If a key result is referenced, update its current_value
  if (data.key_result_id && data.current_value !== undefined) {
    const kr = await db.findOne<KeyResult>("key_results", {
      id: data.key_result_id,
      goal_id: goalId,
    });
    if (!kr) throw new NotFoundError("Key Result", data.key_result_id);

    await db.update<KeyResult>("key_results", data.key_result_id, {
      current_value: data.current_value,
    } as any);
  }

  const checkInRecord = await db.create<GoalCheckIn>("goal_check_ins", {
    id: uuidv4(),
    goal_id: goalId,
    author_id: authorId,
    progress: data.progress,
    notes: data.notes ?? null,
  });

  // Update goal progress
  const newProgress = await computeGoalProgress(orgId, goalId);

  // Auto-transition status if needed
  if (goal.status === "not_started" && data.progress > 0) {
    await db.update<Goal>("goals", goalId, { status: "in_progress" as GoalStatus } as any);
  } else if (goal.status === "completed" && newProgress < 100) {
    // Reconcile completed status with progress (G11): a completed goal whose
    // recomputed progress fell below 100 is no longer actually complete.
    await db.update<Goal>("goals", goalId, {
      status: "in_progress" as GoalStatus,
      completed_at: null,
    } as any);
  }

  return checkInRecord;
}

export async function getCheckIns(
  orgId: number,
  goalId: string,
  params?: { page?: number; perPage?: number },
): Promise<{ data: GoalCheckIn[]; total: number; page: number; perPage: number; totalPages: number }> {
  const db = getDB();

  const goal = await db.findOne<Goal>("goals", { id: goalId, organization_id: orgId });
  if (!goal) throw new NotFoundError("Goal", goalId);

  const page = params?.page ?? 1;
  const perPage = params?.perPage ?? 20;

  const result = await db.findMany<GoalCheckIn>("goal_check_ins", {
    page,
    limit: perPage,
    filters: { goal_id: goalId },
    sort: { field: "created_at", order: "desc" },
  });

  return {
    data: result.data,
    total: result.total,
    page: result.page,
    perPage,
    totalPages: result.totalPages,
  };
}

// ---------------------------------------------------------------------------
// Progress Computation
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Goal Alignment Tree
// ---------------------------------------------------------------------------

interface GoalTreeNode {
  id: string;
  title: string;
  category: string;
  status: string;
  progress: number;
  employee_id: number;
  parent_goal_id: string | null;
  due_date: string | null;
  children: GoalTreeNode[];
  rollup_progress: number;
}

export async function getGoalTree(
  orgId: number,
  cycleId?: string,
): Promise<GoalTreeNode[]> {
  const db = getDB();

  const filters: Record<string, any> = {
    organization_id: orgId,
    // Exclude soft-deleted (cancelled) goals from the tree (G4).
    status: { op: "<>", value: "cancelled" },
  };
  if (cycleId) filters.cycle_id = cycleId;

  const result = await db.findMany<Goal>("goals", {
    filters,
    sort: { field: "category", order: "asc" },
    limit: 10000,
  });

  const goals = result.data;
  const goalMap = new Map<string, GoalTreeNode & { weight: number }>();

  // Create tree nodes
  for (const g of goals) {
    goalMap.set(g.id, {
      id: g.id,
      title: g.title,
      category: g.category,
      status: g.status,
      progress: g.progress,
      employee_id: g.employee_id,
      parent_goal_id: g.parent_goal_id,
      due_date: g.due_date,
      children: [],
      rollup_progress: g.progress,
      weight: 1,
    });
  }

  // Build tree structure
  const roots: (GoalTreeNode & { weight: number })[] = [];
  for (const node of goalMap.values()) {
    if (node.parent_goal_id && goalMap.has(node.parent_goal_id)) {
      goalMap.get(node.parent_goal_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Compute rollup progress bottom-up. Each parent's rollup is the
  // leaf-count-weighted average of its children's rollups, so a sub-tree with
  // many leaves contributes proportionally more than a single leaf child
  // (G11 — weight-aware). Cancelled goals are already excluded above so they
  // never drag a rollup toward 0.
  function computeRollup(node: GoalTreeNode & { weight: number }): {
    progress: number;
    weight: number;
  } {
    if (node.children.length === 0) {
      node.rollup_progress = node.progress;
      node.weight = 1;
      return { progress: node.progress, weight: 1 };
    }

    let totalWeight = 0;
    let weightedProgress = 0;
    for (const child of node.children) {
      const { progress, weight } = computeRollup(child as GoalTreeNode & { weight: number });
      weightedProgress += progress * weight;
      totalWeight += weight;
    }

    node.rollup_progress =
      totalWeight > 0 ? Math.round(weightedProgress / totalWeight) : node.progress;
    node.weight = totalWeight;
    return { progress: node.rollup_progress, weight: totalWeight };
  }

  for (const root of roots) {
    computeRollup(root);
  }

  // Sort roots: company first, then department, team, individual
  const categoryOrder: Record<string, number> = {
    company: 0,
    department: 1,
    team: 2,
    individual: 3,
  };

  roots.sort(
    (a, b) => (categoryOrder[a.category] ?? 4) - (categoryOrder[b.category] ?? 4),
  );

  return roots;
}

export async function getGoalAlignment(
  orgId: number,
  goalId: string,
): Promise<{ goal: Goal; ancestors: Goal[]; descendants: Goal[] }> {
  const db = getDB();

  const goal = await db.findOne<Goal>("goals", { id: goalId, organization_id: orgId });
  if (!goal) throw new NotFoundError("Goal", goalId);

  // Walk up the ancestor chain
  const ancestors: Goal[] = [];
  let currentParentId = goal.parent_goal_id;
  while (currentParentId) {
    const parent = await db.findOne<Goal>("goals", {
      id: currentParentId,
      organization_id: orgId,
    });
    if (!parent) break;
    ancestors.unshift(parent); // oldest ancestor first
    currentParentId = parent.parent_goal_id;
  }

  // Gather all descendants BFS
  const descendants: Goal[] = [];
  const queue: string[] = [goalId];
  while (queue.length > 0) {
    const parentId = queue.shift()!;
    const childResult = await db.findMany<Goal>("goals", {
      filters: {
        organization_id: orgId,
        parent_goal_id: parentId,
        // Exclude soft-deleted (cancelled) goals from the alignment view (G4).
        status: { op: "<>", value: "cancelled" },
      },
      limit: 1000,
    });
    for (const child of childResult.data) {
      descendants.push(child);
      queue.push(child.id);
    }
  }

  return { goal, ancestors, descendants };
}

// ---------------------------------------------------------------------------
// Progress Computation
// ---------------------------------------------------------------------------

export async function computeGoalProgress(
  orgId: number,
  goalId: string,
): Promise<number> {
  const db = getDB();

  const goal = await db.findOne<Goal>("goals", { id: goalId, organization_id: orgId });
  if (!goal) throw new NotFoundError("Goal", goalId);

  const krResult = await db.findMany<KeyResult>("key_results", {
    filters: { goal_id: goalId },
    limit: 100,
  });

  const keyResults = krResult.data;

  if (keyResults.length === 0) {
    // No key results — use latest check-in progress
    const checkIns = await db.findMany<GoalCheckIn>("goal_check_ins", {
      filters: { goal_id: goalId },
      sort: { field: "created_at", order: "desc" },
      limit: 1,
    });
    const progress = checkIns.data.length > 0 ? checkIns.data[0].progress : 0;
    await db.update<Goal>("goals", goalId, { progress } as any);
    return progress;
  }

  // Weighted average of key result progress
  let totalWeight = 0;
  let weightedProgress = 0;

  for (const kr of keyResults) {
    const krProgress =
      kr.target_value > 0
        ? Math.min(100, Math.round((kr.current_value / kr.target_value) * 100))
        : 0;
    weightedProgress += krProgress * kr.weight;
    totalWeight += kr.weight;
  }

  const progress = totalWeight > 0 ? Math.round(weightedProgress / totalWeight) : 0;
  await db.update<Goal>("goals", goalId, { progress } as any);

  return progress;
}

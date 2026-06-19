// ============================================================================
// NINE-BOX GRID SERVICE
// Performance vs Potential classification, potential assessments.
// ============================================================================

import { v4 as uuidv4 } from "uuid";
import { getDB } from "../../db/adapters";
import { getEmpCloudDB } from "../../db/empcloud";
import { NotFoundError, ValidationError } from "../../utils/errors";
import type {
  NineBoxPosition,
  NineBoxData,
  NineBoxEmployee,
  NineBoxCell,
  PotentialAssessment,
} from "@emp-performance/shared";

// ---------------------------------------------------------------------------
// Employee identity resolution (best-effort EmpCloud lookup)
// Resolves real names + department names for a set of employee ids in one
// round-trip; degrades gracefully to "Employee {id}" on any failure (A6).
// ---------------------------------------------------------------------------

export interface ResolvedEmployee {
  name: string;
  department: string | null;
}

export async function resolveEmployees(
  orgId: number,
  ids: number[],
): Promise<Map<number, ResolvedEmployee>> {
  const map = new Map<number, ResolvedEmployee>();
  const unique = [...new Set(ids.filter((id) => id && id > 0))];
  if (unique.length === 0) return map;

  try {
    const db = getEmpCloudDB();
    const users = await db("users")
      .where({ organization_id: orgId })
      .whereIn("id", unique)
      .select("id", "first_name", "last_name", "department_id");

    const deptIds = [
      ...new Set(users.map((u: any) => u.department_id).filter((d: any) => d != null)),
    ];
    const deptMap = new Map<number, string>();
    if (deptIds.length > 0) {
      const depts = await db("organization_departments")
        .where({ organization_id: orgId })
        .whereIn("id", deptIds)
        .select("id", "name");
      for (const d of depts) deptMap.set(d.id, d.name);
    }

    for (const u of users) {
      map.set(u.id, {
        name: `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || `Employee ${u.id}`,
        department: u.department_id != null ? deptMap.get(u.department_id) ?? null : null,
      });
    }
  } catch {
    // Degrade to ids only — EmpCloud DB unavailable.
  }

  return map;
}

// ---------------------------------------------------------------------------
// Nine-Box Classification
// ---------------------------------------------------------------------------

export function classifyNineBox(performance: number, potential: number): NineBoxPosition {
  const perfLevel = performance >= 4 ? "high" : performance >= 2.5 ? "medium" : "low";
  const potLevel = potential >= 4 ? "high" : potential >= 2.5 ? "medium" : "low";

  const matrix: Record<string, Record<string, NineBoxPosition>> = {
    high: {
      high: "Star",
      medium: "High Performer",
      low: "Solid Performer",
    },
    medium: {
      high: "High Potential",
      medium: "Core Player",
      low: "Average",
    },
    low: {
      high: "Inconsistent",
      medium: "Improvement Needed",
      low: "Action Required",
    },
  };

  return matrix[perfLevel][potLevel];
}

// ---------------------------------------------------------------------------
// Nine-Box Grid Data
// ---------------------------------------------------------------------------

export async function getNineBoxData(
  orgId: number,
  cycleId: string,
): Promise<NineBoxData> {
  const db = getDB();

  const cycle = await db.findOne<any>("review_cycles", {
    id: cycleId,
    organization_id: orgId,
  });
  if (!cycle) throw new NotFoundError("ReviewCycle", cycleId);

  const participants = await db.findMany<any>("review_cycle_participants", {
    filters: { cycle_id: cycleId },
    limit: 10000,
  });

  const assessments = await db.findMany<PotentialAssessment>("potential_assessments", {
    filters: { organization_id: orgId, cycle_id: cycleId },
    limit: 10000,
  });

  const potentialMap = new Map<number, number>();
  for (const a of assessments.data) {
    potentialMap.set(a.employee_id, a.potential_rating);
  }

  const boxNames: NineBoxPosition[] = [
    "Star", "High Performer", "Solid Performer",
    "High Potential", "Core Player", "Average",
    "Inconsistent", "Improvement Needed", "Action Required",
  ];

  const boxes: Record<string, NineBoxCell> = {};
  for (const name of boxNames) {
    boxes[name] = { employees: [], count: 0 };
  }

  let totalEmployees = 0;

  // Resolve real names + departments for the mapped employees (A6).
  const mappedIds = participants.data
    .filter((p: any) => p.final_rating != null && potentialMap.get(p.employee_id) != null)
    .map((p: any) => p.employee_id);
  const identities = await resolveEmployees(orgId, mappedIds);

  for (const p of participants.data) {
    const performance = p.final_rating;
    const potential = potentialMap.get(p.employee_id);

    if (performance == null || potential == null) continue;

    const position = classifyNineBox(performance, potential);

    const identity = identities.get(p.employee_id);
    const employee: NineBoxEmployee = {
      id: p.employee_id,
      name: identity?.name ?? `Employee ${p.employee_id}`,
      department: identity?.department ?? null,
      rating: performance,
      potential,
    };

    boxes[position].employees.push(employee);
    boxes[position].count++;
    totalEmployees++;
  }

  return {
    boxes: boxes as Record<NineBoxPosition, NineBoxCell>,
    totalEmployees,
  };
}

// ---------------------------------------------------------------------------
// Potential Assessments
// ---------------------------------------------------------------------------

export async function createPotentialAssessment(
  orgId: number,
  data: {
    cycle_id: string;
    employee_id: number;
    potential_rating: number;
    notes?: string;
  },
  assessedBy: number,
): Promise<PotentialAssessment> {
  const db = getDB();

  if (data.potential_rating < 1 || data.potential_rating > 5) {
    throw new ValidationError("potential_rating must be between 1 and 5");
  }

  const cycle = await db.findOne<any>("review_cycles", {
    id: data.cycle_id,
    organization_id: orgId,
  });
  if (!cycle) throw new NotFoundError("ReviewCycle", data.cycle_id);

  const existing = await db.findOne<PotentialAssessment>("potential_assessments", {
    cycle_id: data.cycle_id,
    employee_id: data.employee_id,
  });

  if (existing) {
    return db.update<PotentialAssessment>("potential_assessments", existing.id, {
      potential_rating: data.potential_rating,
      notes: data.notes ?? null,
      assessed_by: assessedBy,
    } as any);
  }

  const record: Record<string, any> = {
    id: uuidv4(),
    organization_id: orgId,
    cycle_id: data.cycle_id,
    employee_id: data.employee_id,
    assessed_by: assessedBy,
    potential_rating: data.potential_rating,
    notes: data.notes ?? null,
  };

  return db.create<PotentialAssessment>("potential_assessments", record as any);
}

export async function listPotentialAssessments(
  orgId: number,
  cycleId: string,
): Promise<(PotentialAssessment & { employee_name: string })[]> {
  const db = getDB();

  const cycle = await db.findOne<any>("review_cycles", {
    id: cycleId,
    organization_id: orgId,
  });
  if (!cycle) throw new NotFoundError("ReviewCycle", cycleId);

  const result = await db.findMany<PotentialAssessment>("potential_assessments", {
    filters: { organization_id: orgId, cycle_id: cycleId },
    limit: 10000,
  });

  // A6: resolve employee names for the assessments list.
  const identities = await resolveEmployees(
    orgId,
    result.data.map((a) => a.employee_id),
  );
  return result.data.map((a) => ({
    ...a,
    employee_name: identities.get(a.employee_id)?.name ?? `Employee ${a.employee_id}`,
  }));
}

// A7: delete a potential assessment (allows correcting a mis-rated employee).
// Ownership scoped by organization_id.
export async function deletePotentialAssessment(
  orgId: number,
  assessmentId: string,
): Promise<void> {
  const db = getDB();
  const existing = await db.findOne<PotentialAssessment>("potential_assessments", {
    id: assessmentId,
    organization_id: orgId,
  });
  if (!existing) throw new NotFoundError("PotentialAssessment", assessmentId);
  await db.delete("potential_assessments", assessmentId);
}

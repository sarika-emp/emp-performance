import { v4 as uuidv4 } from "uuid";
import { getDB } from "../../db/adapters";
import { NotFoundError } from "../../utils/errors";
import type { CompetencyFramework, Competency } from "@emp-performance/shared";

// ---------------------------------------------------------------------------
// Frameworks
// ---------------------------------------------------------------------------

export async function createFramework(
  orgId: number,
  data: {
    name: string;
    description?: string;
    is_active?: boolean;
  },
  createdBy: number,
): Promise<CompetencyFramework> {
  const db = getDB();
  const record: Record<string, any> = {
    id: uuidv4(),
    organization_id: orgId,
    name: data.name,
    description: data.description ?? null,
    is_active: data.is_active ?? true,
    created_by: createdBy,
  };
  return db.create<CompetencyFramework>("competency_frameworks", record as any);
}

const FRAMEWORK_SORT_COLUMNS = new Set(["name", "created_at", "updated_at", "is_active"]);

export async function listFrameworks(
  orgId: number,
  params: {
    page?: number;
    perPage?: number;
    sort?: string;
    order?: "asc" | "desc";
    search?: string;
    isActive?: boolean;
  } = {},
): Promise<{
  data: CompetencyFramework[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}> {
  const db = getDB();
  const page = params.page ?? 1;
  const perPage = params.perPage ?? 20;
  const sort =
    params.sort && FRAMEWORK_SORT_COLUMNS.has(params.sort) ? params.sort : "created_at";
  const order = params.order === "asc" ? "asc" : "desc";

  const filters: Record<string, any> = { organization_id: orgId, deleted_at: null };
  if (params.isActive !== undefined) filters.is_active = params.isActive;

  const result = await db.findMany<CompetencyFramework>("competency_frameworks", {
    page,
    limit: perPage,
    filters,
    sort: { field: sort, order },
    search: params.search,
    searchFields: ["name", "description"],
  });

  return {
    data: result.data,
    total: result.total,
    page: result.page,
    perPage: result.limit,
    totalPages: result.totalPages,
  };
}

export async function getFramework(
  orgId: number,
  id: string,
): Promise<CompetencyFramework & { competencies: Competency[] }> {
  const db = getDB();
  const framework = await db.findOne<CompetencyFramework>("competency_frameworks", {
    id,
    organization_id: orgId,
    deleted_at: null,
  });
  if (!framework) throw new NotFoundError("CompetencyFramework", id);

  const competencies = await db.findMany<Competency>("competencies", {
    filters: { framework_id: id, deleted_at: null },
    sort: { field: "order", order: "asc" },
    // Frameworks can legitimately have many competencies — the adapter default
    // limit is 20, which silently dropped the rest. Use a high explicit cap.
    page: 1,
    limit: 1000,
  });

  return { ...framework, competencies: competencies.data };
}

export async function updateFramework(
  orgId: number,
  id: string,
  data: { name?: string; description?: string; is_active?: boolean },
): Promise<CompetencyFramework> {
  const db = getDB();
  const existing = await db.findOne<CompetencyFramework>("competency_frameworks", {
    id,
    organization_id: orgId,
    deleted_at: null,
  });
  if (!existing) throw new NotFoundError("CompetencyFramework", id);

  return db.update<CompetencyFramework>("competency_frameworks", id, data as any);
}

export async function deleteFramework(orgId: number, id: string): Promise<void> {
  const db = getDB();
  const existing = await db.findOne<CompetencyFramework>("competency_frameworks", {
    id,
    organization_id: orgId,
    deleted_at: null,
  });
  if (!existing) throw new NotFoundError("CompetencyFramework", id);

  await db.update("competency_frameworks", id, { deleted_at: new Date().toISOString() } as any);
}

// ---------------------------------------------------------------------------
// Competencies within a framework
// ---------------------------------------------------------------------------

export async function addCompetency(
  orgId: number,
  frameworkId: string,
  data: {
    name: string;
    description?: string;
    category?: string;
    weight?: number;
    order?: number;
  },
): Promise<Competency> {
  const db = getDB();
  // verify framework belongs to org
  const framework = await db.findOne<CompetencyFramework>("competency_frameworks", {
    id: frameworkId,
    organization_id: orgId,
    deleted_at: null,
  });
  if (!framework) throw new NotFoundError("CompetencyFramework", frameworkId);

  const record: Record<string, any> = {
    id: uuidv4(),
    framework_id: frameworkId,
    name: data.name,
    description: data.description ?? null,
    category: data.category ?? null,
    weight: data.weight ?? 1,
    order: data.order ?? 0,
  };

  return db.create<Competency>("competencies", record as any);
}

export async function updateCompetency(
  orgId: number,
  frameworkId: string,
  compId: string,
  data: { name?: string; description?: string; category?: string; weight?: number; order?: number },
): Promise<Competency> {
  const db = getDB();
  // verify framework belongs to org
  const framework = await db.findOne<CompetencyFramework>("competency_frameworks", {
    id: frameworkId,
    organization_id: orgId,
    deleted_at: null,
  });
  if (!framework) throw new NotFoundError("CompetencyFramework", frameworkId);

  const existing = await db.findOne<Competency>("competencies", {
    id: compId,
    framework_id: frameworkId,
    deleted_at: null,
  });
  if (!existing) throw new NotFoundError("Competency", compId);

  return db.update<Competency>("competencies", compId, data as any);
}

export async function removeCompetency(
  orgId: number,
  frameworkId: string,
  compId: string,
): Promise<void> {
  const db = getDB();
  const framework = await db.findOne<CompetencyFramework>("competency_frameworks", {
    id: frameworkId,
    organization_id: orgId,
    deleted_at: null,
  });
  if (!framework) throw new NotFoundError("CompetencyFramework", frameworkId);

  const existing = await db.findOne<Competency>("competencies", {
    id: compId,
    framework_id: frameworkId,
    deleted_at: null,
  });
  if (!existing) throw new NotFoundError("Competency", compId);

  // C4: review_competency_ratings.competency_id is ON DELETE CASCADE, so a hard
  // delete would silently erase historical review scores. Soft-delete instead so
  // the competency stops appearing in the framework but its ratings are kept.
  await db.update("competencies", compId, {
    deleted_at: new Date().toISOString(),
  } as any);
}

// C5: bulk reorder competencies within a framework. Accepts an ordered list of
// competency ids; each competency's `order` is set to its index in the list.
export async function reorderCompetencies(
  orgId: number,
  frameworkId: string,
  orderedIds: string[],
): Promise<Competency[]> {
  const db = getDB();
  const framework = await db.findOne<CompetencyFramework>("competency_frameworks", {
    id: frameworkId,
    organization_id: orgId,
    deleted_at: null,
  });
  if (!framework) throw new NotFoundError("CompetencyFramework", frameworkId);

  for (let i = 0; i < orderedIds.length; i++) {
    const compId = orderedIds[i]!;
    const existing = await db.findOne<Competency>("competencies", {
      id: compId,
      framework_id: frameworkId,
      deleted_at: null,
    });
    if (!existing) throw new NotFoundError("Competency", compId);
    await db.update("competencies", compId, { order: i } as any);
  }

  const competencies = await db.findMany<Competency>("competencies", {
    filters: { framework_id: frameworkId, deleted_at: null },
    sort: { field: "order", order: "asc" },
    page: 1,
    limit: 1000,
  });
  return competencies.data;
}

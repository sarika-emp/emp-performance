import { v4 as uuidv4 } from "uuid";
import { getDB } from "../../db/adapters";
import { NotFoundError, ConflictError } from "../../utils/errors";
import type {
  CompetencyFramework,
  Competency,
  CompetencyLevel,
} from "@emp-performance/shared";

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

  // MySQL datetime rejects the ISO-8601 string (T/Z/millis); pass a Date
  // object like deletePIP does, or the delete 500s (audit H8).
  await db.update("competency_frameworks", id, { deleted_at: new Date() } as any);
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
  // Pass a Date object — the ISO string is rejected by the MySQL datetime
  // column and 500s the delete (audit H8).
  await db.update("competencies", compId, {
    deleted_at: new Date(),
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

// ---------------------------------------------------------------------------
// Competency proficiency levels (C6)
// ---------------------------------------------------------------------------
//
// Competencies have no organization_id of their own — they belong to a
// competency_framework which carries the tenant key. To org-scope a level we
// resolve competency -> framework -> organization_id and reject any competency
// (or its level) that does not belong to the caller's org.

async function loadOwnedCompetency(orgId: number, competencyId: string): Promise<Competency> {
  const db = getDB();
  const competency = await db.findOne<Competency>("competencies", {
    id: competencyId,
    deleted_at: null,
  });
  if (!competency) throw new NotFoundError("Competency", competencyId);

  const framework = await db.findOne<CompetencyFramework>("competency_frameworks", {
    id: competency.framework_id,
    organization_id: orgId,
    deleted_at: null,
  });
  if (!framework) throw new NotFoundError("Competency", competencyId);

  return competency;
}

function normalizeAnchors(anchors?: string[] | null): string[] | null {
  if (!anchors) return null;
  const cleaned = anchors.map((a) => a.trim()).filter((a) => a.length > 0);
  return cleaned.length > 0 ? cleaned : null;
}

export async function listLevels(
  orgId: number,
  competencyId: string,
): Promise<CompetencyLevel[]> {
  const db = getDB();
  await loadOwnedCompetency(orgId, competencyId);

  const result = await db.findMany<CompetencyLevel>("competency_levels", {
    filters: { competency_id: competencyId, organization_id: orgId },
    sort: { field: "sort_order", order: "asc" },
    page: 1,
    limit: 1000,
  });
  return result.data;
}

export async function createLevel(
  orgId: number,
  competencyId: string,
  data: {
    level: number;
    name: string;
    description?: string;
    behavioral_anchors?: string[];
    sort_order?: number;
  },
): Promise<CompetencyLevel> {
  const db = getDB();
  await loadOwnedCompetency(orgId, competencyId);

  // level must be unique within the competency.
  const clash = await db.findOne<CompetencyLevel>("competency_levels", {
    competency_id: competencyId,
    level: data.level,
  });
  if (clash) {
    throw new ConflictError(`Level ${data.level} already exists for this competency`);
  }

  const record: Record<string, any> = {
    id: uuidv4(),
    organization_id: orgId,
    competency_id: competencyId,
    level: data.level,
    name: data.name,
    description: data.description ?? null,
    behavioral_anchors: normalizeAnchors(data.behavioral_anchors),
    sort_order: data.sort_order ?? data.level,
  };

  return db.create<CompetencyLevel>("competency_levels", record as any);
}

export async function updateLevel(
  orgId: number,
  competencyId: string,
  levelId: string,
  data: {
    level?: number;
    name?: string;
    description?: string;
    behavioral_anchors?: string[];
    sort_order?: number;
  },
): Promise<CompetencyLevel> {
  const db = getDB();
  await loadOwnedCompetency(orgId, competencyId);

  const existing = await db.findOne<CompetencyLevel>("competency_levels", {
    id: levelId,
    competency_id: competencyId,
    organization_id: orgId,
  });
  if (!existing) throw new NotFoundError("CompetencyLevel", levelId);

  // If the numeric level is changing, keep it unique within the competency.
  if (data.level !== undefined && data.level !== existing.level) {
    const clash = await db.findOne<CompetencyLevel>("competency_levels", {
      competency_id: competencyId,
      level: data.level,
    });
    if (clash) {
      throw new ConflictError(`Level ${data.level} already exists for this competency`);
    }
  }

  const patch: Record<string, any> = {};
  if (data.level !== undefined) patch.level = data.level;
  if (data.name !== undefined) patch.name = data.name;
  if (data.description !== undefined) patch.description = data.description;
  if (data.behavioral_anchors !== undefined) {
    patch.behavioral_anchors = normalizeAnchors(data.behavioral_anchors);
  }
  if (data.sort_order !== undefined) patch.sort_order = data.sort_order;

  return db.update<CompetencyLevel>("competency_levels", levelId, patch as any);
}

export async function deleteLevel(
  orgId: number,
  competencyId: string,
  levelId: string,
): Promise<void> {
  const db = getDB();
  await loadOwnedCompetency(orgId, competencyId);

  const existing = await db.findOne<CompetencyLevel>("competency_levels", {
    id: levelId,
    competency_id: competencyId,
    organization_id: orgId,
  });
  if (!existing) throw new NotFoundError("CompetencyLevel", levelId);

  await db.delete("competency_levels", levelId);
}

// Bulk reorder: accepts an ordered list of level ids; each level's sort_order is
// set to its index in the list. All ids must belong to the competency + org.
export async function reorderLevels(
  orgId: number,
  competencyId: string,
  orderedIds: string[],
): Promise<CompetencyLevel[]> {
  const db = getDB();
  await loadOwnedCompetency(orgId, competencyId);

  for (let i = 0; i < orderedIds.length; i++) {
    const levelId = orderedIds[i]!;
    const existing = await db.findOne<CompetencyLevel>("competency_levels", {
      id: levelId,
      competency_id: competencyId,
      organization_id: orgId,
    });
    if (!existing) throw new NotFoundError("CompetencyLevel", levelId);
    await db.update("competency_levels", levelId, { sort_order: i } as any);
  }

  const result = await db.findMany<CompetencyLevel>("competency_levels", {
    filters: { competency_id: competencyId, organization_id: orgId },
    sort: { field: "sort_order", order: "asc" },
    page: 1,
    limit: 1000,
  });
  return result.data;
}

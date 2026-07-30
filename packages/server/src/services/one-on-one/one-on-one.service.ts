// ============================================================================
// ONE-ON-ONE MEETING SERVICE
// Manages 1-on-1 meetings, agenda items, structured action items, and the
// meeting lifecycle. All queries are tenant-scoped by organization_id and
// participant access is enforced (employee, manager, or admin).
// ============================================================================

import { getDB } from "../../db/adapters";
import { findUserById } from "../../db/empcloud";
import { ForbiddenError, NotFoundError, ValidationError } from "../../utils/errors";
import { logger } from "../../utils/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Meeting {
  id: string;
  organization_id: number;
  employee_id: number;
  manager_id: number;
  title: string;
  scheduled_at: Date;
  duration_minutes: number;
  status: string;
  meeting_notes: string | null;
  action_items: string | null;
  completed_at: Date | null;
  completed_by: number | null;
  created_at: Date;
  updated_at: Date;
}

interface AgendaItem {
  id: string;
  meeting_id: string;
  title: string;
  description: string | null;
  added_by: number;
  order: number;
  is_discussed: boolean;
  completed_at: Date | null;
  created_at: Date;
}

interface ActionItem {
  id: string;
  organization_id: number;
  meeting_id: string;
  description: string;
  assignee_id: number | null;
  due_date: string | null;
  status: string;
  carried_from_id: string | null;
  created_by: number;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface CreateMeetingData {
  employee_id: number;
  manager_id: number;
  title: string;
  scheduled_at: string;
  duration_minutes?: number;
}

interface UpdateMeetingData {
  title?: string;
  scheduled_at?: string;
  duration_minutes?: number;
  meeting_notes?: string | null;
  action_items?: string | null;
  status?: string;
}

interface ListMeetingsParams {
  page?: number;
  perPage?: number;
  managerId?: number;
  employeeId?: number;
  status?: string;
  search?: string;
  sort?: string;
  order?: "asc" | "desc";
}

interface CreateAgendaItemData {
  title: string;
  description?: string;
  added_by: number;
  order?: number;
}

interface UpdateAgendaItemData {
  title?: string;
  description?: string | null;
  order?: number;
  is_discussed?: boolean;
}

interface CreateActionItemData {
  description: string;
  assignee_id?: number | null;
  due_date?: string | null;
  status?: string;
}

interface UpdateActionItemData {
  description?: string;
  assignee_id?: number | null;
  due_date?: string | null;
  status?: string;
}

// Sortable columns for the meeting list (whitelist — never interpolate raw input).
const MEETING_SORT_COLUMNS = new Set([
  "scheduled_at",
  "created_at",
  "title",
  "status",
  "duration_minutes",
]);

// ---------------------------------------------------------------------------
// Access control
// ---------------------------------------------------------------------------

const ADMIN_ROLES = new Set(["super_admin", "org_admin", "hr_admin", "hr_manager"]);

export interface Actor {
  userId: number;
  role: string;
}

/**
 * Throws ForbiddenError unless the actor is an admin/HR role or is a direct
 * participant (the meeting's employee or manager).
 */
function assertParticipant(meeting: Meeting, actor: Actor): void {
  if (ADMIN_ROLES.has(actor.role)) return;
  if (actor.userId === meeting.employee_id || actor.userId === meeting.manager_id) return;
  throw new ForbiddenError("You do not have access to this meeting");
}

/**
 * Notes are authored by the manager; an employee may not overwrite manager
 * notes. Only the manager or an admin may edit notes.
 */
function assertCanEditNotes(meeting: Meeting, actor: Actor): void {
  if (ADMIN_ROLES.has(actor.role)) return;
  if (actor.userId === meeting.manager_id) return;
  throw new ForbiddenError("Only the meeting manager or an admin can edit meeting notes");
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

/**
 * Render a DATE column as a plain 'YYYY-MM-DD' string. mysql2 reads a DATE as a
 * JS Date at the server's local midnight, and Express then serializes it via
 * toISOString() to UTC — shifting the calendar day back for any timezone behind
 * UTC (IST -> the previous day) and leaking an ugly full ISO timestamp into the
 * UI (audit M8). Formatting from the Date's LOCAL components (which are the
 * date as stored) gives a stable date string the client shows verbatim.
 */
function toDateOnly(v: unknown): string | null {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(v as string);
  if (Number.isNaN(d.getTime())) return typeof v === "string" ? v : null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function withParticipantNames<T extends { employee_id?: number; manager_id?: number }>(
  rows: T[],
  names: Map<number, string>,
): (T & { employee_name: string | null; manager_name: string | null })[] {
  return rows.map((r) => ({
    ...r,
    employee_name: r.employee_id != null ? names.get(r.employee_id) ?? null : null,
    manager_name: r.manager_id != null ? names.get(r.manager_id) ?? null : null,
  }));
}

// ---------------------------------------------------------------------------
// Meetings
// ---------------------------------------------------------------------------

export async function createMeeting(orgId: number, data: CreateMeetingData): Promise<Meeting> {
  const db = getDB();
  const meeting = await db.create<Meeting>("one_on_one_meetings", {
    organization_id: orgId,
    employee_id: data.employee_id,
    manager_id: data.manager_id,
    title: data.title,
    scheduled_at: new Date(data.scheduled_at),
    duration_minutes: data.duration_minutes || 30,
    status: "scheduled",
  });
  logger.info(`1-on-1 meeting created: ${meeting.title} (org: ${orgId})`);
  return meeting;
}

/**
 * Request a 1-on-1 as an employee. The employee is always the caller; the
 * meeting is created with status "requested" so a manager can confirm it.
 */
export async function requestMeeting(
  orgId: number,
  employeeId: number,
  data: { manager_id: number; title: string; scheduled_at: string; duration_minutes?: number },
): Promise<Meeting> {
  const db = getDB();
  if (data.manager_id === employeeId) {
    throw new ValidationError("You cannot request a 1-on-1 with yourself");
  }
  const meeting = await db.create<Meeting>("one_on_one_meetings", {
    organization_id: orgId,
    employee_id: employeeId,
    manager_id: data.manager_id,
    title: data.title,
    scheduled_at: new Date(data.scheduled_at),
    duration_minutes: data.duration_minutes || 30,
    status: "requested",
  });
  logger.info(`1-on-1 meeting requested by ${employeeId} (org: ${orgId})`);
  return meeting;
}

export async function listMeetings(orgId: number, actor: Actor, params?: ListMeetingsParams) {
  const db = getDB();
  const page = params?.page ?? 1;
  const perPage = params?.perPage ?? 20;

  // Non-admins can only see meetings they participate in.
  const restrictToUser = ADMIN_ROLES.has(actor.role) ? undefined : actor.userId;

  const search = params?.search?.trim();
  const sortCol =
    params?.sort && MEETING_SORT_COLUMNS.has(params.sort) ? params.sort : "scheduled_at";
  const sortDir = params?.order === "asc" ? "asc" : "desc";

  if (search || restrictToUser !== undefined) {
    // Raw query path: free-text search and/or participant restriction need an
    // OR clause the structured findMany cannot express.
    const where: string[] = ["organization_id = ?"];
    const bindings: any[] = [orgId];

    if (params?.managerId) {
      where.push("manager_id = ?");
      bindings.push(params.managerId);
    }
    if (params?.employeeId) {
      where.push("employee_id = ?");
      bindings.push(params.employeeId);
    }
    if (params?.status) {
      where.push("status = ?");
      bindings.push(params.status);
    }
    if (restrictToUser !== undefined) {
      where.push("(employee_id = ? OR manager_id = ?)");
      bindings.push(restrictToUser, restrictToUser);
    }
    if (search) {
      where.push("title LIKE ?");
      bindings.push(`%${search}%`);
    }

    const whereSql = where.join(" AND ");
    const offset = (page - 1) * perPage;

    // mysql2 .raw() returns the [rows, fields] tuple — unwrap element 0 or the
    // rows array is treated as a single garbage record (undefined id/title/
    // scheduled_at) and the count reads the rows array instead of the COUNT
    // row, so total is always 0. Downstream formatDate(undefined) then throws
    // and white-screens the whole list for every non-admin / any title search.
    const rowsRes = await db.raw<any>(
      `SELECT * FROM one_on_one_meetings WHERE ${whereSql} ORDER BY ${sortCol} ${sortDir} LIMIT ? OFFSET ?`,
      [...bindings, perPage, offset],
    );
    const rows = (Array.isArray(rowsRes) ? rowsRes[0] || rowsRes : []) as Meeting[];
    const countRes = await db.raw<any>(
      `SELECT COUNT(*) AS c FROM one_on_one_meetings WHERE ${whereSql}`,
      bindings,
    );
    const countRows = (Array.isArray(countRes) ? countRes[0] || countRes : []) as { c: number }[];
    const total = Number(countRows?.[0]?.c ?? 0);

    const ids = rows.flatMap((m) => [m.employee_id, m.manager_id]);
    const names = await resolveUserNames(orgId, ids);
    return {
      data: withParticipantNames(rows, names),
      total,
      page,
      perPage,
      totalPages: Math.ceil(total / perPage),
    };
  }

  const filters: Record<string, any> = { organization_id: orgId };
  if (params?.managerId) filters.manager_id = params.managerId;
  if (params?.employeeId) filters.employee_id = params.employeeId;
  if (params?.status) filters.status = params.status;

  const result = await db.findMany<Meeting>("one_on_one_meetings", {
    page,
    limit: perPage,
    filters,
    sort: { field: sortCol, order: sortDir },
  });

  const ids = result.data.flatMap((m) => [m.employee_id, m.manager_id]);
  const names = await resolveUserNames(orgId, ids);
  return {
    data: withParticipantNames(result.data, names),
    total: result.total,
    page: result.page,
    perPage: result.limit,
    totalPages: result.totalPages,
  };
}

interface GetMeetingOptions {
  agendaPage?: number;
  agendaPerPage?: number;
}

export async function getMeeting(
  orgId: number,
  id: string,
  actor: Actor,
  options?: GetMeetingOptions,
) {
  const db = getDB();
  const meeting = await db.findOne<Meeting>("one_on_one_meetings", {
    id,
    organization_id: orgId,
  });
  if (!meeting) {
    throw new NotFoundError("Meeting", id);
  }
  assertParticipant(meeting, actor);

  const agendaPage = options?.agendaPage ?? 1;
  const agendaPerPage = Math.min(options?.agendaPerPage ?? 100, 200);

  const agenda = await db.findMany<AgendaItem>("meeting_agenda_items", {
    filters: { meeting_id: id },
    sort: { field: "order", order: "asc" },
    page: agendaPage,
    limit: agendaPerPage,
  });

  const actions = await db.findMany<ActionItem>("meeting_action_items", {
    filters: { meeting_id: id, organization_id: orgId },
    sort: { field: "created_at", order: "asc" },
    limit: 200,
  });

  const names = await resolveUserNames(orgId, [
    meeting.employee_id,
    meeting.manager_id,
    ...actions.data.map((a) => a.assignee_id ?? 0),
  ]);

  return {
    ...meeting,
    employee_name: names.get(meeting.employee_id) ?? null,
    manager_name: names.get(meeting.manager_id) ?? null,
    agendaItems: agenda.data,
    agendaTotal: agenda.total,
    agendaPage: agenda.page,
    agendaPerPage: agenda.limit,
    agendaTotalPages: agenda.totalPages,
    actionItems: actions.data.map((a) => ({
      ...a,
      due_date: toDateOnly(a.due_date),
      assignee_name: a.assignee_id ? names.get(a.assignee_id) ?? null : null,
    })),
  };
}

async function loadMeetingForActor(orgId: number, id: string, actor: Actor): Promise<Meeting> {
  const db = getDB();
  const meeting = await db.findOne<Meeting>("one_on_one_meetings", {
    id,
    organization_id: orgId,
  });
  if (!meeting) {
    throw new NotFoundError("Meeting", id);
  }
  assertParticipant(meeting, actor);
  return meeting;
}

export async function updateMeeting(
  orgId: number,
  id: string,
  data: UpdateMeetingData,
  actor: Actor,
): Promise<Meeting> {
  const db = getDB();
  const existing = await loadMeetingForActor(orgId, id, actor);

  // Notes are manager-authored: an employee may not overwrite them.
  if (data.meeting_notes !== undefined) {
    assertCanEditNotes(existing, actor);
  }

  const updateData: Record<string, any> = {};
  if (data.title !== undefined) updateData.title = data.title;
  if (data.scheduled_at !== undefined) updateData.scheduled_at = new Date(data.scheduled_at);
  if (data.duration_minutes !== undefined) updateData.duration_minutes = data.duration_minutes;
  if (data.meeting_notes !== undefined) updateData.meeting_notes = data.meeting_notes;
  if (data.action_items !== undefined) updateData.action_items = data.action_items;
  if (data.status !== undefined) updateData.status = data.status;

  return db.update<Meeting>("one_on_one_meetings", id, updateData);
}

/**
 * Cancel a meeting (soft state change). Keeps history; agenda/actions remain.
 */
export async function cancelMeeting(orgId: number, id: string, actor: Actor): Promise<Meeting> {
  const db = getDB();
  const existing = await loadMeetingForActor(orgId, id, actor);
  if (existing.status === "cancelled") {
    throw new ValidationError("Meeting is already cancelled");
  }
  // Only a scheduled meeting can be cancelled — a completed meeting already
  // happened, so cancelling it is not a valid transition. To change a completed
  // meeting, reopen it first (back to scheduled), then cancel.
  if (existing.status === "completed") {
    throw new ValidationError("A completed meeting can't be cancelled. Reopen it first if you need to cancel.");
  }
  logger.info(`1-on-1 meeting cancelled: ${id} (org: ${orgId})`);
  return db.update<Meeting>("one_on_one_meetings", id, { status: "cancelled" });
}

export async function deleteMeeting(orgId: number, id: string, actor: Actor): Promise<void> {
  const db = getDB();
  const existing = await loadMeetingForActor(orgId, id, actor);
  // Only the manager or an admin can delete a meeting outright.
  assertCanEditNotes(existing, actor);
  await db.delete("one_on_one_meetings", id);
  logger.info(`1-on-1 meeting deleted: ${id} (org: ${orgId})`);
}

export async function completeMeeting(orgId: number, id: string, actor: Actor): Promise<Meeting> {
  const db = getDB();
  const existing = await loadMeetingForActor(orgId, id, actor);

  if (existing.status === "completed") {
    throw new ValidationError("Meeting is already completed");
  }
  // A cancelled meeting didn't happen, so completing it isn't a valid
  // transition — mirror the cancel-completed guard (audit M6). Reopen it first
  // if it needs to be completed.
  if (existing.status === "cancelled") {
    throw new ValidationError("A cancelled meeting can't be completed. Reopen it first.");
  }

  logger.info(`1-on-1 meeting completed: ${id} by ${actor.userId} (org: ${orgId})`);
  return db.update<Meeting>("one_on_one_meetings", id, {
    status: "completed",
    completed_at: new Date(),
    completed_by: actor.userId,
  });
}

/**
 * Reopen a completed/cancelled meeting back to scheduled, clearing the
 * completion audit. (O7)
 */
export async function reopenMeeting(orgId: number, id: string, actor: Actor): Promise<Meeting> {
  const db = getDB();
  const existing = await loadMeetingForActor(orgId, id, actor);
  if (existing.status === "scheduled") {
    throw new ValidationError("Meeting is already open");
  }
  logger.info(`1-on-1 meeting reopened: ${id} by ${actor.userId} (org: ${orgId})`);
  return db.update<Meeting>("one_on_one_meetings", id, {
    status: "scheduled",
    completed_at: null,
    completed_by: null,
  });
}

// ---------------------------------------------------------------------------
// Agenda Items
// ---------------------------------------------------------------------------

export async function addAgendaItem(
  orgId: number,
  meetingId: string,
  data: CreateAgendaItemData,
  actor: Actor,
): Promise<AgendaItem> {
  const db = getDB();
  await loadMeetingForActor(orgId, meetingId, actor);

  return db.create<AgendaItem>("meeting_agenda_items", {
    meeting_id: meetingId,
    title: data.title,
    description: data.description || null,
    added_by: data.added_by,
    order: data.order ?? 0,
    is_discussed: false,
  });
}

async function loadAgendaItemForActor(
  orgId: number,
  itemId: string,
  actor: Actor,
): Promise<{ item: AgendaItem; meeting: Meeting }> {
  const db = getDB();
  const item = await db.findById<AgendaItem>("meeting_agenda_items", itemId);
  if (!item) {
    throw new NotFoundError("Agenda item", itemId);
  }
  const meeting = await db.findOne<Meeting>("one_on_one_meetings", {
    id: item.meeting_id,
    organization_id: orgId,
  });
  if (!meeting) {
    throw new NotFoundError("Meeting", item.meeting_id);
  }
  assertParticipant(meeting, actor);
  return { item, meeting };
}

export async function updateAgendaItem(
  orgId: number,
  itemId: string,
  data: UpdateAgendaItemData,
  actor: Actor,
): Promise<AgendaItem> {
  const db = getDB();
  await loadAgendaItemForActor(orgId, itemId, actor);

  const updateData: Record<string, any> = {};
  if (data.title !== undefined) updateData.title = data.title;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.order !== undefined) updateData.order = data.order;
  if (data.is_discussed !== undefined) {
    updateData.is_discussed = data.is_discussed;
    updateData.completed_at = data.is_discussed ? new Date() : null;
  }

  return db.update<AgendaItem>("meeting_agenda_items", itemId, updateData);
}

export async function deleteAgendaItem(orgId: number, itemId: string, actor: Actor): Promise<void> {
  const db = getDB();
  await loadAgendaItemForActor(orgId, itemId, actor);
  await db.delete("meeting_agenda_items", itemId);
}

/**
 * Toggle (or set) an agenda item's discussed state, recording the completion
 * timestamp. (O7 — agenda states are no longer one-way.)
 */
export async function completeAgendaItem(
  orgId: number,
  itemId: string,
  actor: Actor,
): Promise<AgendaItem> {
  const db = getDB();
  const { item } = await loadAgendaItemForActor(orgId, itemId, actor);
  const next = !item.is_discussed;
  return db.update<AgendaItem>("meeting_agenda_items", itemId, {
    is_discussed: next,
    completed_at: next ? new Date() : null,
  });
}

// ---------------------------------------------------------------------------
// Action Items (O4)
// ---------------------------------------------------------------------------

export async function listActionItems(orgId: number, meetingId: string, actor: Actor) {
  const db = getDB();
  await loadMeetingForActor(orgId, meetingId, actor);
  const result = await db.findMany<ActionItem>("meeting_action_items", {
    filters: { meeting_id: meetingId, organization_id: orgId },
    sort: { field: "created_at", order: "asc" },
    limit: 200,
  });
  const names = await resolveUserNames(
    orgId,
    result.data.map((a) => a.assignee_id ?? 0),
  );
  return result.data.map((a) => ({
    ...a,
    due_date: toDateOnly(a.due_date),
    assignee_name: a.assignee_id ? names.get(a.assignee_id) ?? null : null,
  }));
}

export async function addActionItem(
  orgId: number,
  meetingId: string,
  data: CreateActionItemData,
  actor: Actor,
): Promise<ActionItem> {
  const db = getDB();
  await loadMeetingForActor(orgId, meetingId, actor);
  return db.create<ActionItem>("meeting_action_items", {
    organization_id: orgId,
    meeting_id: meetingId,
    description: data.description,
    assignee_id: data.assignee_id ?? null,
    due_date: data.due_date ?? null,
    status: data.status ?? "open",
    created_by: actor.userId,
    completed_at: data.status === "done" ? new Date() : null,
  });
}

async function loadActionItemForActor(
  orgId: number,
  actionItemId: string,
  actor: Actor,
): Promise<ActionItem> {
  const db = getDB();
  const item = await db.findOne<ActionItem>("meeting_action_items", {
    id: actionItemId,
    organization_id: orgId,
  });
  if (!item) {
    throw new NotFoundError("Action item", actionItemId);
  }
  await loadMeetingForActor(orgId, item.meeting_id, actor);
  return item;
}

export async function updateActionItem(
  orgId: number,
  actionItemId: string,
  data: UpdateActionItemData,
  actor: Actor,
): Promise<ActionItem> {
  const db = getDB();
  const existing = await loadActionItemForActor(orgId, actionItemId, actor);

  const updateData: Record<string, any> = {};
  if (data.description !== undefined) updateData.description = data.description;
  if (data.assignee_id !== undefined) updateData.assignee_id = data.assignee_id;
  if (data.due_date !== undefined) updateData.due_date = data.due_date;
  if (data.status !== undefined) {
    updateData.status = data.status;
    if (data.status === "done" && existing.status !== "done") {
      updateData.completed_at = new Date();
    } else if (data.status !== "done") {
      updateData.completed_at = null;
    }
  }

  return db.update<ActionItem>("meeting_action_items", actionItemId, updateData);
}

export async function deleteActionItem(
  orgId: number,
  actionItemId: string,
  actor: Actor,
): Promise<void> {
  const db = getDB();
  await loadActionItemForActor(orgId, actionItemId, actor);
  await db.delete("meeting_action_items", actionItemId);
}

/**
 * Carry forward all still-open action items from a source meeting into a target
 * meeting, preserving a link to the original item. (O4 carry-forward)
 */
export async function carryForwardActionItems(
  orgId: number,
  fromMeetingId: string,
  toMeetingId: string,
  actor: Actor,
): Promise<ActionItem[]> {
  const db = getDB();
  const from = await loadMeetingForActor(orgId, fromMeetingId, actor);
  const to = await loadMeetingForActor(orgId, toMeetingId, actor);
  if (from.id === to.id) {
    throw new ValidationError("Source and target meetings must differ");
  }

  const open = await db.findMany<ActionItem>("meeting_action_items", {
    filters: {
      meeting_id: fromMeetingId,
      organization_id: orgId,
      status: ["open", "in_progress"],
    },
    limit: 200,
  });

  const created: ActionItem[] = [];
  for (const item of open.data) {
    const copy = await db.create<ActionItem>("meeting_action_items", {
      organization_id: orgId,
      meeting_id: toMeetingId,
      description: item.description,
      assignee_id: item.assignee_id ?? null,
      due_date: item.due_date ?? null,
      status: item.status,
      carried_from_id: item.id,
      created_by: actor.userId,
    });
    created.push(copy);
  }
  logger.info(
    `Carried ${created.length} action items from ${fromMeetingId} to ${toMeetingId} (org: ${orgId})`,
  );
  return created;
}

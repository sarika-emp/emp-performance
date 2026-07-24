// ============================================================================
// PERFORMANCE LETTER SERVICE
// Business logic for letter templates and generated letters.
// ============================================================================

import fs from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { getDB } from "../../db/adapters";
import { findUserById, findOrgById } from "../../db/empcloud";
import { sendEmail } from "../email/email.service";
import { NotFoundError, ValidationError } from "../../utils/errors";
import { logger } from "../../utils/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LetterType = "appraisal" | "increment" | "promotion" | "confirmation" | "warning";

const LETTER_TYPES: readonly LetterType[] = [
  "appraisal",
  "increment",
  "promotion",
  "confirmation",
  "warning",
];

export function isLetterType(value: unknown): value is LetterType {
  return typeof value === "string" && (LETTER_TYPES as readonly string[]).includes(value);
}

export interface PerformanceLetterTemplate {
  id: string;
  organization_id: number;
  type: LetterType;
  name: string;
  content_template: string;
  is_default: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface GeneratedPerformanceLetter {
  id: string;
  organization_id: number;
  employee_id: number;
  cycle_id: string | null;
  template_id: string | null;
  template_name: string | null;
  type: LetterType;
  content: string;
  file_path: string | null;
  generated_by: number;
  sent_at: string | null;
  sent_to: string | null;
  voided_at: string | null;
  voided_by: number | null;
  created_at: string;
}

interface CreateTemplateInput {
  type: LetterType;
  name: string;
  content_template: string;
  is_default?: boolean;
}

interface ListTemplatesParams {
  type?: LetterType;
  search?: string;
  page?: number;
  perPage?: number;
}

interface ListLettersParams {
  employeeId?: number;
  type?: LetterType;
  status?: "sent" | "draft" | "voided";
  search?: string;
  page?: number;
  perPage?: number;
}

interface Pager<T> {
  data: T[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

// Where letter HTML documents are persisted on disk (L4).
const LETTER_STORAGE_DIR = path.resolve(process.cwd(), "storage", "letters");

// ---------------------------------------------------------------------------
// Default-template enforcement (L6)
// ---------------------------------------------------------------------------

/**
 * Ensure at most one default template exists per (organization, type).
 * Clears is_default on every other non-deleted template of the same type.
 */
async function clearOtherDefaults(
  orgId: number,
  type: LetterType,
  keepId: string | null,
): Promise<void> {
  const db = getDB();
  const params: any[] = [orgId, type];
  let sql =
    "UPDATE performance_letter_templates SET is_default = 0 " +
    "WHERE organization_id = ? AND type = ? AND is_default = 1 AND deleted_at IS NULL";
  if (keepId) {
    sql += " AND id <> ?";
    params.push(keepId);
  }
  await db.raw(sql, params);
}

// ---------------------------------------------------------------------------
// Template CRUD
// ---------------------------------------------------------------------------

export async function createTemplate(
  orgId: number,
  data: CreateTemplateInput,
): Promise<PerformanceLetterTemplate> {
  const db = getDB();

  const id = uuidv4();
  const isDefault = data.is_default ?? false;

  // L6: a new default unseats the previous default for the same (org,type).
  if (isDefault) {
    await clearOtherDefaults(orgId, data.type, null);
  }

  const template = await db.create<PerformanceLetterTemplate>("performance_letter_templates", {
    id,
    organization_id: orgId,
    type: data.type,
    name: data.name,
    content_template: data.content_template,
    is_default: isDefault,
  });

  return template;
}

export async function listTemplates(
  orgId: number,
  params: ListTemplatesParams,
): Promise<Pager<PerformanceLetterTemplate>> {
  const db = getDB();
  const page = params.page ?? 1;
  const perPage = params.perPage ?? 50;
  const offset = (page - 1) * perPage;

  const where: string[] = ["organization_id = ?", "deleted_at IS NULL"];
  const args: any[] = [orgId];

  if (params.type) {
    where.push("type = ?");
    args.push(params.type);
  }
  if (params.search && params.search.trim()) {
    const term = `%${params.search.trim()}%`;
    where.push("(name LIKE ? OR content_template LIKE ?)");
    args.push(term, term);
  }

  const whereSql = where.join(" AND ");

  const countRes = await db.raw<any>(
    `SELECT COUNT(*) AS c FROM performance_letter_templates WHERE ${whereSql}`,
    args,
  );
  const countRows = (Array.isArray(countRes) ? countRes[0] || countRes : []) as any[];
  const total = Number(countRows?.[0]?.c ?? 0);

  const dataRes = await db.raw<any>(
    `SELECT * FROM performance_letter_templates WHERE ${whereSql} ` +
      `ORDER BY is_default DESC, created_at DESC LIMIT ? OFFSET ?`,
    [...args, perPage, offset],
  );
  const data = (Array.isArray(dataRes) ? dataRes[0] || dataRes : []) as PerformanceLetterTemplate[];

  return { data, total, page, perPage, totalPages: Math.ceil(total / perPage) || 0 };
}

export async function getTemplate(
  orgId: number,
  id: string,
): Promise<PerformanceLetterTemplate> {
  const db = getDB();

  const template = await db.findOne<PerformanceLetterTemplate>("performance_letter_templates", {
    id,
    organization_id: orgId,
    deleted_at: null,
  });
  if (!template) throw new NotFoundError("LetterTemplate", id);

  return template;
}

export async function updateTemplate(
  orgId: number,
  id: string,
  data: Partial<CreateTemplateInput>,
): Promise<PerformanceLetterTemplate> {
  const db = getDB();

  const existing = await db.findOne<PerformanceLetterTemplate>("performance_letter_templates", {
    id,
    organization_id: orgId,
    deleted_at: null,
  });
  if (!existing) throw new NotFoundError("LetterTemplate", id);

  const updates: Record<string, any> = {};
  if (data.name !== undefined) updates.name = data.name;
  if (data.type !== undefined) updates.type = data.type;
  if (data.content_template !== undefined) updates.content_template = data.content_template;
  if (data.is_default !== undefined) updates.is_default = data.is_default;

  // L6: if this template is becoming the default (or changing type while
  // staying default), unseat every other default of the resulting type.
  const resultingType = (data.type ?? existing.type) as LetterType;
  const resultingDefault = data.is_default ?? existing.is_default;
  if (resultingDefault) {
    await clearOtherDefaults(orgId, resultingType, id);
  }

  return db.update<PerformanceLetterTemplate>("performance_letter_templates", id, updates);
}

export async function deleteTemplate(orgId: number, id: string): Promise<void> {
  const db = getDB();

  const existing = await db.findOne<PerformanceLetterTemplate>("performance_letter_templates", {
    id,
    organization_id: orgId,
    deleted_at: null,
  });
  if (!existing) throw new NotFoundError("LetterTemplate", id);

  // L2: soft-delete so historical generated letters that reference this
  // template are preserved. (The FK is also rebuilt to SET NULL in migration
  // 015 as a second line of defence against hard deletes.)
  await db.update("performance_letter_templates", id, { deleted_at: new Date() } as any);
}

// ---------------------------------------------------------------------------
// Variable resolution (L5)
// ---------------------------------------------------------------------------

/**
 * Format a date for letter copy ("01 March 2022"). Every date substituted into
 * a letter goes through here so the body never shows a raw JS Date.
 *
 * DATE columns come back as a Date at local midnight from mysql2, but as a
 * plain 'YYYY-MM-DD' string from other adapters. Build the string form from its
 * parts rather than through Date(), which would read it as UTC midnight and
 * render the previous day for anyone west of Greenwich.
 */
function formatLetterDate(value: unknown): string | null {
  if (value == null) return null;

  let d: Date;
  if (value instanceof Date) {
    d = value;
  } else {
    const s = String(value).trim();
    const ymd = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    d = ymd
      ? new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]))
      : new Date(s);
  }
  if (Number.isNaN(d.getTime())) return null;

  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

async function buildVariables(
  orgId: number,
  employeeId: number,
  cycleId: string | null,
  type: LetterType,
): Promise<Record<string, string>> {
  const db = getDB();

  const today = formatLetterDate(new Date())!;

  const variables: Record<string, string> = {
    employee_id: String(employeeId),
    organization_id: String(orgId),
    date: today,
    current_date: today,
    letter_type: type,
  };

  // Resolve the real employee + org context from the EmpCloud master DB so
  // letters read "Dear Jane Doe" rather than "Dear Employee #5".
  try {
    const user = await findUserById(employeeId);
    if (user) {
      const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
      variables.employee_name = fullName || `Employee #${employeeId}`;
      variables.first_name = user.first_name ?? "";
      variables.last_name = user.last_name ?? "";
      variables.employee_email = user.email ?? "";
      variables.designation = user.designation ?? "";
      variables.emp_code = user.emp_code ?? "";
      const dateOfJoining = formatLetterDate(user.date_of_joining);
      if (dateOfJoining) variables.date_of_joining = dateOfJoining;

      if (user.reporting_manager_id) {
        const manager = await findUserById(user.reporting_manager_id);
        if (manager) {
          variables.manager_name = [manager.first_name, manager.last_name]
            .filter(Boolean)
            .join(" ")
            .trim();
          variables.manager_designation = manager.designation ?? "";
        }
      }
    } else {
      variables.employee_name = `Employee #${employeeId}`;
    }

    const org = await findOrgById(orgId);
    if (org) {
      variables.organization_name = org.name ?? "";
      variables.company_name = org.name ?? "";
      variables.organization_legal_name = org.legal_name ?? org.name ?? "";
    }
  } catch (err) {
    // EmpCloud lookups are best-effort: never block letter generation on a
    // master-DB hiccup. Fall back to the id-based label.
    logger.warn(`Letter variable resolution failed for employee ${employeeId}: ${String(err)}`);
    if (!variables.employee_name) variables.employee_name = `Employee #${employeeId}`;
  }

  // Review-cycle context (rating/summary) when a cycle is supplied.
  if (cycleId) {
    variables.cycle_id = cycleId;

    const cycle = await db.findOne<any>("review_cycles", {
      id: cycleId,
      organization_id: orgId,
    });
    if (cycle) {
      variables.cycle_name = cycle.name ?? "";
    }

    const review = await db.findOne<any>("reviews", {
      organization_id: orgId,
      employee_id: employeeId,
      cycle_id: cycleId,
      status: "submitted",
    });
    if (review) {
      variables.overall_rating = String(review.overall_rating ?? "N/A");
      variables.review_summary = review.summary ?? "";
      variables.strengths = review.strengths ?? "";
      variables.improvements = review.improvements ?? "";
    }
  }

  return variables;
}

function renderTemplate(template: string, variables: Record<string, string>): string {
  // Simple Handlebars-like variable replacement: {{variable_name}}
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key) => {
    return variables[key] ?? `{{${key}}}`;
  });
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Render the rendered plain-text letter body into a self-contained,
 * print-ready HTML document. Content is HTML-escaped (XSS-safe) and newlines
 * preserved. Written to disk by generateLetter and served by the download
 * endpoint (L4).
 */
function renderLetterDocument(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <style>
    @media print { @page { margin: 24mm; } }
    body { font-family: Georgia, 'Times New Roman', serif; color: #1f2937; line-height: 1.6; max-width: 760px; margin: 40px auto; padding: 0 24px; }
    .letter-body { white-space: pre-wrap; font-size: 15px; }
  </style>
</head>
<body>
  <div class="letter-body">${escapeHtml(body)}</div>
</body>
</html>`;
}

async function persistLetterFile(letterId: string, html: string): Promise<string | null> {
  try {
    await fs.mkdir(LETTER_STORAGE_DIR, { recursive: true });
    const filePath = path.join(LETTER_STORAGE_DIR, `${letterId}.html`);
    await fs.writeFile(filePath, html, "utf8");
    return filePath;
  } catch (err) {
    // Persisting the rendered document is best-effort; the canonical content
    // always lives in the DB so a disk failure must not fail generation.
    logger.warn(`Failed to persist letter file for ${letterId}: ${String(err)}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Letter Generation
// ---------------------------------------------------------------------------

export async function generateLetter(
  orgId: number,
  employeeId: number,
  templateId: string,
  cycleId: string | null,
  generatedBy: number,
): Promise<GeneratedPerformanceLetter> {
  const db = getDB();

  const template = await db.findOne<PerformanceLetterTemplate>("performance_letter_templates", {
    id: templateId,
    organization_id: orgId,
    deleted_at: null,
  });
  if (!template) throw new NotFoundError("LetterTemplate", templateId);

  const variables = await buildVariables(orgId, employeeId, cycleId, template.type);
  const content = renderTemplate(template.content_template, variables);

  const id = uuidv4();
  const html = renderLetterDocument(`${template.type} letter`, content);
  const filePath = await persistLetterFile(id, html);

  const letter = await db.create<GeneratedPerformanceLetter>("generated_performance_letters", {
    id,
    organization_id: orgId,
    employee_id: employeeId,
    cycle_id: cycleId ?? null,
    template_id: templateId,
    // L2: snapshot the template name so the issued letter is self-describing
    // even after the template is (soft-)deleted and template_id becomes null.
    template_name: template.name,
    type: template.type,
    content,
    file_path: filePath,
    generated_by: generatedBy,
    sent_at: null,
  });

  logger.info(`Performance letter generated: ${letter.id} for employee ${employeeId}`);

  return letter;
}

/**
 * Render a template against an employee's resolved variables WITHOUT persisting
 * a letter — used by the preview/render-test endpoint (L8).
 */
export async function previewLetter(
  orgId: number,
  opts: {
    contentTemplate?: string;
    templateId?: string;
    employeeId?: number;
    cycleId?: string | null;
  },
): Promise<{ content: string; type: LetterType }> {
  const db = getDB();

  let contentTemplate = opts.contentTemplate;
  let type: LetterType = "appraisal";

  if (opts.templateId) {
    const template = await db.findOne<PerformanceLetterTemplate>("performance_letter_templates", {
      id: opts.templateId,
      organization_id: orgId,
      deleted_at: null,
    });
    if (!template) throw new NotFoundError("LetterTemplate", opts.templateId);
    if (contentTemplate === undefined) contentTemplate = template.content_template;
    type = template.type;
  }

  if (!contentTemplate) {
    throw new ValidationError("Either content_template or template_id is required");
  }

  const employeeId = opts.employeeId ?? 0;
  const variables = await buildVariables(orgId, employeeId, opts.cycleId ?? null, type);
  const content = renderTemplate(contentTemplate, variables);
  return { content, type };
}

/**
 * Re-render an existing generated letter from its (current) template and
 * employee context. Only allowed while the letter has not been sent (L8).
 */
export async function regenerateLetter(
  orgId: number,
  letterId: string,
): Promise<GeneratedPerformanceLetter> {
  const db = getDB();

  const letter = await db.findOne<GeneratedPerformanceLetter>("generated_performance_letters", {
    id: letterId,
    organization_id: orgId,
  });
  if (!letter) throw new NotFoundError("PerformanceLetter", letterId);
  if (letter.sent_at) throw new ValidationError("Cannot regenerate a letter that has been sent");
  if (letter.voided_at) throw new ValidationError("Cannot regenerate a voided letter");
  if (!letter.template_id) {
    throw new ValidationError("Cannot regenerate: the source template has been deleted");
  }

  const template = await db.findOne<PerformanceLetterTemplate>("performance_letter_templates", {
    id: letter.template_id,
    organization_id: orgId,
    deleted_at: null,
  });
  if (!template) {
    throw new ValidationError("Cannot regenerate: the source template has been deleted");
  }

  const variables = await buildVariables(orgId, letter.employee_id, letter.cycle_id, template.type);
  const content = renderTemplate(template.content_template, variables);
  const html = renderLetterDocument(`${template.type} letter`, content);
  const filePath = await persistLetterFile(letter.id, html);

  return db.update<GeneratedPerformanceLetter>("generated_performance_letters", letterId, {
    content,
    template_name: template.name,
    file_path: filePath,
  } as any);
}

/**
 * Void / revoke a generated letter (L8). A sent letter can be revoked; the
 * audit columns record who/when.
 */
export async function voidLetter(
  orgId: number,
  letterId: string,
  actorId: number,
): Promise<GeneratedPerformanceLetter> {
  const db = getDB();

  const letter = await db.findOne<GeneratedPerformanceLetter>("generated_performance_letters", {
    id: letterId,
    organization_id: orgId,
  });
  if (!letter) throw new NotFoundError("PerformanceLetter", letterId);
  if (letter.voided_at) throw new ValidationError("Letter has already been voided");

  return db.update<GeneratedPerformanceLetter>("generated_performance_letters", letterId, {
    voided_at: new Date(),
    voided_by: actorId,
    // un-send so it no longer counts as a live delivered letter
    sent_at: null,
  } as any);
}

// ---------------------------------------------------------------------------
// Letter Listing / Retrieval
// ---------------------------------------------------------------------------

export async function listLetters(
  orgId: number,
  params: ListLettersParams,
): Promise<Pager<GeneratedPerformanceLetter>> {
  const db = getDB();
  const page = params.page ?? 1;
  const perPage = params.perPage ?? 20;
  const offset = (page - 1) * perPage;

  const where: string[] = ["organization_id = ?"];
  const args: any[] = [orgId];

  if (params.employeeId) {
    where.push("employee_id = ?");
    args.push(params.employeeId);
  }
  if (params.type) {
    where.push("type = ?");
    args.push(params.type);
  }
  if (params.status === "sent") {
    where.push("sent_at IS NOT NULL AND voided_at IS NULL");
  } else if (params.status === "draft") {
    where.push("sent_at IS NULL AND voided_at IS NULL");
  } else if (params.status === "voided") {
    where.push("voided_at IS NOT NULL");
  }
  if (params.search && params.search.trim()) {
    const term = `%${params.search.trim()}%`;
    where.push("(content LIKE ? OR template_name LIKE ?)");
    args.push(term, term);
  }

  const whereSql = where.join(" AND ");

  const countRes = await db.raw<any>(
    `SELECT COUNT(*) AS c FROM generated_performance_letters WHERE ${whereSql}`,
    args,
  );
  const countRows = (Array.isArray(countRes) ? countRes[0] || countRes : []) as any[];
  const total = Number(countRows?.[0]?.c ?? 0);

  const dataRes = await db.raw<any>(
    `SELECT * FROM generated_performance_letters WHERE ${whereSql} ` +
      `ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...args, perPage, offset],
  );
  const data = (Array.isArray(dataRes)
    ? dataRes[0] || dataRes
    : []) as GeneratedPerformanceLetter[];

  return { data, total, page, perPage, totalPages: Math.ceil(total / perPage) || 0 };
}

export async function getLetter(orgId: number, id: string): Promise<GeneratedPerformanceLetter> {
  const db = getDB();

  const letter = await db.findOne<GeneratedPerformanceLetter>("generated_performance_letters", {
    id,
    organization_id: orgId,
  });
  if (!letter) throw new NotFoundError("PerformanceLetter", id);

  return letter;
}

/**
 * Return the downloadable rendered HTML document for a letter (L4). Falls back
 * to rendering on demand if the on-disk file is missing.
 */
export async function getLetterDocument(
  orgId: number,
  id: string,
): Promise<{ filename: string; html: string }> {
  const letter = await getLetter(orgId, id);

  let html: string | null = null;
  if (letter.file_path) {
    try {
      html = await fs.readFile(letter.file_path, "utf8");
    } catch {
      html = null;
    }
  }
  if (!html) {
    html = renderLetterDocument(`${letter.type} letter`, letter.content);
  }

  return { filename: `letter_${letter.type}_employee_${letter.employee_id}.html`, html };
}

// ---------------------------------------------------------------------------
// Sending (L1)
// ---------------------------------------------------------------------------

export async function sendLetter(
  orgId: number,
  letterId: string,
): Promise<GeneratedPerformanceLetter> {
  const db = getDB();

  const letter = await db.findOne<GeneratedPerformanceLetter>("generated_performance_letters", {
    id: letterId,
    organization_id: orgId,
  });
  if (!letter) throw new NotFoundError("PerformanceLetter", letterId);
  if (letter.voided_at) throw new ValidationError("Cannot send a voided letter");
  if (letter.sent_at) throw new ValidationError("Letter has already been sent");

  // L1: actually deliver the letter. Resolve the employee's email and email
  // the rendered letter body. Delivery is recorded in sent_to for audit.
  let recipientEmail: string | null = null;
  let recipientName = `Employee #${letter.employee_id}`;
  try {
    const user = await findUserById(letter.employee_id);
    if (user) {
      recipientEmail = user.email ?? null;
      recipientName = [user.first_name, user.last_name].filter(Boolean).join(" ").trim() || recipientName;
    }
  } catch (err) {
    logger.warn(`Could not resolve recipient for letter ${letterId}: ${String(err)}`);
  }

  if (!recipientEmail) {
    throw new ValidationError(
      "Cannot send: the employee has no email address on record in EmpCloud",
    );
  }

  const TYPE_LABELS: Record<LetterType, string> = {
    appraisal: "Appraisal Letter",
    increment: "Increment Letter",
    promotion: "Promotion Letter",
    confirmation: "Confirmation Letter",
    warning: "Warning Letter",
  };

  const subject = `${TYPE_LABELS[letter.type]} — EMP Performance`;
  const body = `
    <p style="color:#374151;line-height:1.6;">Hi <strong>${escapeHtml(recipientName)}</strong>,</p>
    <p style="color:#374151;line-height:1.6;">A performance letter has been issued to you. The full text is below.</p>
    <div style="margin:16px 0;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:16px;white-space:pre-wrap;color:#111827;font-size:14px;line-height:1.6;">${escapeHtml(
      letter.content,
    )}</div>
    <p style="color:#6b7280;font-size:13px;">You can also view this letter anytime under "My Letters" in EMP Performance.</p>
  `;

  try {
    await sendEmail(recipientEmail, subject, body);
  } catch (err) {
    logger.error(`Failed to deliver letter ${letterId} to ${recipientEmail}:`, err);
    throw new ValidationError("Failed to deliver the letter email. Please try again.");
  }

  const updated = await db.update<GeneratedPerformanceLetter>(
    "generated_performance_letters",
    letterId,
    { sent_at: new Date(), sent_to: recipientEmail } as any,
  );

  logger.info(`Performance letter sent: ${letterId} to ${recipientEmail}`);

  return updated;
}

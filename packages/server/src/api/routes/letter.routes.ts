// ============================================================================
// PERFORMANCE LETTER ROUTES
// CRUD for templates, letter generation, listing, download, and sending.
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate, authorize } from "../middleware/auth.middleware";
import { sendSuccess, sendPaginated } from "../../utils/response";
import {
  paginationSchema,
  idParamSchema,
  createLetterTemplateSchema,
  updateLetterTemplateSchema,
  generateLetterSchema,
  previewLetterTemplateSchema,
} from "@emp-performance/shared";
import * as letterService from "../../services/letter/performance-letter.service";
import { NotFoundError } from "../../utils/errors";

const LETTER_ADMIN_ROLES = ["super_admin", "org_admin", "hr_admin", "hr_manager"];

const router = Router();
router.use(authenticate);

// ---------------------------------------------------------------------------
// SELF-SERVICE (employee access — before admin-only middleware)
// ---------------------------------------------------------------------------

// GET /letters/my — list letters addressed to the current user
router.get("/my", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const employeeId = req.user!.empcloudUserId;
    const pagination = paginationSchema.parse(req.query);
    const result = await letterService.listLetters(orgId, {
      employeeId,
      type: letterService.isLetterType(req.query.type) ? req.query.type : undefined,
      search: pagination.search,
      page: pagination.page,
      perPage: pagination.perPage,
    });
    return sendPaginated(res, result.data, result.total, result.page, result.perPage);
  } catch (err) {
    next(err);
  }
});

// GET /letters/:id/download — download the rendered letter document (L4).
// Registered ABOVE the admin gate so the recipient can download their OWN
// letter (audit H11): the whole My Letters page is for employees, but its
// Download button hit an admin-only route and 403'd for every non-admin.
// Scoped — an employee may only download a letter addressed to them.
router.get("/:id/download", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const { id } = idParamSchema.parse(req.params);
    const letter = await letterService.getLetter(orgId, id);
    const isAdmin = LETTER_ADMIN_ROLES.includes(req.user!.role);
    if (!isAdmin && letter.employee_id !== req.user!.empcloudUserId) {
      throw new NotFoundError("PerformanceLetter", id);
    }
    const { filename, html } = await letterService.getLetterDocument(orgId, id);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(html);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// ADMIN-ONLY routes below this line
// ---------------------------------------------------------------------------
router.use(authorize("hr_admin", "hr_manager", "org_admin"));

// ---------------------------------------------------------------------------
// TEMPLATES
// ---------------------------------------------------------------------------

// GET /letters/templates — list templates (paginated + search)
router.get("/templates", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const pagination = paginationSchema.parse(req.query);
    const result = await letterService.listTemplates(orgId, {
      type: letterService.isLetterType(req.query.type) ? req.query.type : undefined,
      search: pagination.search,
      page: pagination.page,
      perPage: pagination.perPage,
    });
    return sendPaginated(res, result.data, result.total, result.page, result.perPage);
  } catch (err) {
    next(err);
  }
});

// POST /letters/templates — create template
router.post("/templates", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const body = createLetterTemplateSchema.parse(req.body);
    const result = await letterService.createTemplate(orgId, body);
    return sendSuccess(res, result, 201);
  } catch (err) {
    next(err);
  }
});

// POST /letters/templates/preview — render-test a template (L8)
router.post("/templates/preview", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const body = previewLetterTemplateSchema.parse(req.body);
    const result = await letterService.previewLetter(orgId, {
      contentTemplate: body.content_template,
      templateId: body.template_id,
      employeeId: body.employee_id,
      cycleId: body.cycle_id ?? null,
    });
    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// GET /letters/templates/:id — get template
router.get("/templates/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const { id } = idParamSchema.parse(req.params);
    const result = await letterService.getTemplate(orgId, id);
    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// PUT /letters/templates/:id — update template
router.put("/templates/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const { id } = idParamSchema.parse(req.params);
    const body = updateLetterTemplateSchema.parse(req.body);
    const result = await letterService.updateTemplate(orgId, id, body);
    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// DELETE /letters/templates/:id — soft-delete template
router.delete("/templates/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const { id } = idParamSchema.parse(req.params);
    await letterService.deleteTemplate(orgId, id);
    return sendSuccess(res, { deleted: true });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GENERATED LETTERS
// ---------------------------------------------------------------------------

// POST /letters/generate — generate a letter
router.post("/generate", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const body = generateLetterSchema.parse(req.body);
    const result = await letterService.generateLetter(
      orgId,
      body.employee_id,
      body.template_id,
      body.cycle_id ?? null,
      req.user!.empcloudUserId,
    );
    return sendSuccess(res, result, 201);
  } catch (err) {
    next(err);
  }
});

// GET /letters — list generated letters (paginated + search + status filter)
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const pagination = paginationSchema.parse(req.query);
    const status = req.query.status;
    const result = await letterService.listLetters(orgId, {
      employeeId: req.query.employeeId ? Number(req.query.employeeId) : undefined,
      type: letterService.isLetterType(req.query.type) ? req.query.type : undefined,
      status:
        status === "sent" || status === "draft" || status === "voided" ? status : undefined,
      search: pagination.search,
      page: pagination.page,
      perPage: pagination.perPage,
    });
    return sendPaginated(res, result.data, result.total, result.page, result.perPage);
  } catch (err) {
    next(err);
  }
});

// GET /letters/:id — get letter detail
router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const { id } = idParamSchema.parse(req.params);
    const result = await letterService.getLetter(orgId, id);
    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// (GET /letters/:id/download is registered above the admin gate — see there —
// so recipients can download their own letter.)

// POST /letters/:id/send — deliver the letter (email + audit)
router.post("/:id/send", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const { id } = idParamSchema.parse(req.params);
    const result = await letterService.sendLetter(orgId, id);
    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// POST /letters/:id/regenerate — re-render a draft letter (L8)
router.post("/:id/regenerate", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const { id } = idParamSchema.parse(req.params);
    const result = await letterService.regenerateLetter(orgId, id);
    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// POST /letters/:id/void — void / revoke a letter (L8)
router.post("/:id/void", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const { id } = idParamSchema.parse(req.params);
    const result = await letterService.voidLetter(orgId, id, req.user!.empcloudUserId);
    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

export { router as letterRoutes };

// ============================================================================
// PIP ROUTES
// REST endpoints for Performance Improvement Plans.
// All routes require auth. PIPs are confidential, so reads/lists are
// additionally access-checked in the service layer (subject employee, their
// manager chain, or HR/admin); mutations are restricted to HR/admin roles.
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate, authorize } from "../middleware/auth.middleware";
import { sendSuccess, sendPaginated } from "../../utils/response";
import {
  createPIPSchema,
  updatePIPSchema,
  addPIPObjectiveSchema,
  updatePIPObjectiveSchema,
  addPIPUpdateSchema,
  closePIPSchema,
  extendPIPSchema,
  acknowledgePIPSchema,
  paginationSchema,
  idParamSchema,
} from "@emp-performance/shared";
import * as pipService from "../../services/pip/pip.service";

const router = Router();
router.use(authenticate);

function actorOf(req: Request): pipService.Actor {
  return { userId: req.user!.empcloudUserId, role: req.user!.role };
}

// ---------------------------------------------------------------------------
// GET / — list PIPs (access-scoped per actor)
// ---------------------------------------------------------------------------
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const pagination = paginationSchema.parse(req.query);

    const result = await pipService.listPIPs(orgId, actorOf(req), {
      status: req.query.status as string | undefined,
      employeeId: req.query.employeeId ? Number(req.query.employeeId) : undefined,
      managerId: req.query.managerId ? Number(req.query.managerId) : undefined,
      page: pagination.page,
      perPage: pagination.perPage,
      sort: pagination.sort,
      order: pagination.order,
      search: pagination.search,
    });

    return sendPaginated(res, result.data, result.total, result.page, result.perPage);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST / — create PIP (admin/manager)
// ---------------------------------------------------------------------------
router.post(
  "/",
  authorize("org_admin", "hr_admin", "hr_manager"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const data = createPIPSchema.parse(req.body);

      // P3: persist the supplied/derived reporting manager instead of always
      // forcing the creator (handled in the service).
      const pip = await pipService.createPIP(orgId, req.user!.empcloudUserId, data);
      return sendSuccess(res, pip, 201);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /:id — PIP detail with objectives and updates (access-scoped)
// ---------------------------------------------------------------------------
router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const { id } = idParamSchema.parse(req.params);

    const pip = await pipService.getPIP(orgId, id, actorOf(req));
    return sendSuccess(res, pip);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PUT /:id — update PIP (validated)
// ---------------------------------------------------------------------------
router.put(
  "/:id",
  authorize("org_admin", "hr_admin", "hr_manager"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const { id } = idParamSchema.parse(req.params);
      const data = updatePIPSchema.parse(req.body);

      const pip = await pipService.updatePIP(orgId, id, data);
      return sendSuccess(res, pip);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// DELETE /:id — soft-delete PIP (admin/manager)
// ---------------------------------------------------------------------------
router.delete(
  "/:id",
  authorize("org_admin", "hr_admin", "hr_manager"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const { id } = idParamSchema.parse(req.params);

      await pipService.deletePIP(orgId, id);
      return sendSuccess(res, { id, deleted: true });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /:id/acknowledge — employee sign-off (P7)
// ---------------------------------------------------------------------------
router.post("/:id/acknowledge", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const { id } = idParamSchema.parse(req.params);
    const data = acknowledgePIPSchema.parse(req.body ?? {});

    const pip = await pipService.acknowledgePIP(orgId, id, actorOf(req), data.note);
    return sendSuccess(res, pip);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /:id/objectives — add objective
// ---------------------------------------------------------------------------
router.post(
  "/:id/objectives",
  authorize("org_admin", "hr_admin", "hr_manager"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const { id } = idParamSchema.parse(req.params);
      const data = addPIPObjectiveSchema.parse(req.body);

      const objective = await pipService.addObjective(orgId, id, data);
      return sendSuccess(res, objective, 201);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// PUT /:id/objectives/:objId — update objective (validated, admin/manager) — P2/P5
// ---------------------------------------------------------------------------
router.put(
  "/:id/objectives/:objId",
  authorize("org_admin", "hr_admin", "hr_manager"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const { id } = idParamSchema.parse(req.params);
      const objId = req.params.objId as string;
      const data = updatePIPObjectiveSchema.parse(req.body);

      const objective = await pipService.updateObjective(orgId, id, objId, data);
      return sendSuccess(res, objective);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// DELETE /:id/objectives/:objId — remove objective (P6) (admin/manager)
// ---------------------------------------------------------------------------
router.delete(
  "/:id/objectives/:objId",
  authorize("org_admin", "hr_admin", "hr_manager"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const { id } = idParamSchema.parse(req.params);
      const objId = req.params.objId as string;

      await pipService.deleteObjective(orgId, id, objId);
      return sendSuccess(res, { id: objId, deleted: true });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /:id/updates — add update/check-in
// ---------------------------------------------------------------------------
router.post("/:id/updates", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const { id } = idParamSchema.parse(req.params);
    const data = addPIPUpdateSchema.parse(req.body);

    const update = await pipService.addUpdate(orgId, id, req.user!.empcloudUserId, data);
    return sendSuccess(res, update, 201);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /:id/close — close PIP with outcome
// ---------------------------------------------------------------------------
router.post(
  "/:id/close",
  authorize("org_admin", "hr_admin", "hr_manager"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const { id } = idParamSchema.parse(req.params);
      const data = closePIPSchema.parse(req.body);

      if (data.status === "extended") {
        // Use extend flow instead
        if (!data.extended_end_date) {
          return res.status(400).json({
            success: false,
            error: { code: "VALIDATION_ERROR", message: "extended_end_date is required when extending a PIP" },
          });
        }
        const pip = await pipService.extendPIP(orgId, id, data.extended_end_date);
        return sendSuccess(res, pip);
      }

      const pip = await pipService.closePIP(
        orgId,
        id,
        data.status as "completed_success" | "completed_failure" | "cancelled",
        data.outcome_notes,
      );
      return sendSuccess(res, pip);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /:id/extend — extend PIP end date (validated, date-ordered) — P5
// ---------------------------------------------------------------------------
router.post(
  "/:id/extend",
  authorize("org_admin", "hr_admin", "hr_manager"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const { id } = idParamSchema.parse(req.params);
      const { end_date } = extendPIPSchema.parse(req.body);

      const pip = await pipService.extendPIP(orgId, id, end_date);
      return sendSuccess(res, pip);
    } catch (err) {
      next(err);
    }
  },
);

export { router as pipRoutes };

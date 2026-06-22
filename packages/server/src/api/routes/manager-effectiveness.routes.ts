// ============================================================================
// MANAGER EFFECTIVENESS ROUTES
// Calculate, list, detail, dashboard for manager effectiveness scoring.
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate, authorize } from "../middleware/auth.middleware";
import * as meService from "../../services/manager-effectiveness/manager-effectiveness.service";
import { resolveEmployees } from "../../services/analytics/nine-box.service";
import { sendSuccess, sendPaginated } from "../../utils/response";
import { ValidationError, ForbiddenError } from "../../utils/errors";
import { paginationSchema } from "@emp-performance/shared";

const router = Router();
router.use(authenticate);

// GET /manager-effectiveness/dashboard — Dashboard stats (HR)
// Must be before /:managerId to avoid "dashboard" being matched as an ID
router.get(
  "/dashboard",
  authorize("hr_admin", "hr_manager", "org_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const result = await meService.getDashboard(orgId);

      // A6: resolve names for top/bottom performers.
      const ids = [
        ...result.top_performers.map((s) => s.manager_user_id),
        ...result.bottom_performers.map((s) => s.manager_user_id),
      ];
      const identities = await resolveEmployees(orgId, ids);
      const decorate = (s: meService.ManagerEffectivenessScore) => ({
        ...s,
        manager_name: identities.get(s.manager_user_id)?.name ?? `Manager ${s.manager_user_id}`,
        department: identities.get(s.manager_user_id)?.department ?? null,
      });

      sendSuccess(res, {
        ...result,
        top_performers: result.top_performers.map(decorate),
        bottom_performers: result.bottom_performers.map(decorate),
      });
    } catch (err) {
      next(err);
    }
  },
);

// GET /manager-effectiveness — Paginated/sortable list of manager scores (HR)
router.get(
  "/",
  authorize("hr_admin", "hr_manager", "org_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const period = req.query.period as string;
      if (!period) throw new ValidationError("period query parameter is required (e.g. 2026-Q1)");
      const pagination = paginationSchema.parse(req.query);
      const result = await meService.listManagerScores(orgId, period, {
        page: pagination.page,
        perPage: pagination.perPage,
        sort: pagination.sort,
        order: pagination.order,
      });

      // A6: resolve real manager names for display.
      const identities = await resolveEmployees(
        orgId,
        result.data.map((s) => s.manager_user_id),
      );
      const data = result.data.map((s) => ({
        ...s,
        manager_name: identities.get(s.manager_user_id)?.name ?? `Manager ${s.manager_user_id}`,
        department: identities.get(s.manager_user_id)?.department ?? null,
      }));

      sendPaginated(res, data, result.total, result.page, result.perPage);
    } catch (err) {
      next(err);
    }
  },
);

// POST /manager-effectiveness/calculate-all — Batch calculate for all managers (HR)
router.post(
  "/calculate-all",
  authorize("hr_admin", "hr_manager", "org_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const { period } = req.body;
      if (!period) throw new ValidationError("period is required in body (e.g. 2026-Q1)");
      const result = await meService.calculateAll(orgId, period);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },
);

// POST /manager-effectiveness/calculate/:managerId — Calculate/recalculate score (HR)
router.post(
  "/calculate/:managerId",
  authorize("hr_admin", "hr_manager", "org_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const managerId = parseInt(req.params.managerId as string);
      const { period } = req.body;
      if (isNaN(managerId)) throw new ValidationError("managerId must be a number");
      if (!period) throw new ValidationError("period is required in body (e.g. 2026-Q1)");
      const result = await meService.calculateScore(orgId, managerId, period);
      sendSuccess(res, result, 201);
    } catch (err) {
      next(err);
    }
  },
);

// GET /manager-effectiveness/:managerId — Manager detail
// A4: a manager may read their own score; otherwise HR/admin only.
router.get("/:managerId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const managerId = parseInt(req.params.managerId as string);
    const period = req.query.period as string;
    if (isNaN(managerId)) throw new ValidationError("managerId must be a number");
    if (!period) throw new ValidationError("period query parameter is required (e.g. 2026-Q1)");

    const isHr = ["hr_admin", "hr_manager", "org_admin", "super_admin"].includes(req.user!.role);
    const isSelf = req.user!.empcloudUserId === managerId;
    if (!isHr && !isSelf) {
      throw new ForbiddenError("You may only view your own manager effectiveness score");
    }

    const result = await meService.getManagerDetail(orgId, managerId, period);
    const identities = await resolveEmployees(orgId, [managerId]);
    sendSuccess(res, {
      ...result,
      manager_name: identities.get(managerId)?.name ?? `Manager ${managerId}`,
      department: identities.get(managerId)?.department ?? null,
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /manager-effectiveness/:managerId?period=YYYY-QN — remove a score (HR)
router.delete(
  "/:managerId",
  authorize("hr_admin", "hr_manager", "org_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const managerId = parseInt(req.params.managerId as string);
      const period = req.query.period as string;
      if (isNaN(managerId)) throw new ValidationError("managerId must be a number");
      if (!period) throw new ValidationError("period query parameter is required (e.g. 2026-Q1)");
      await meService.deleteScore(orgId, managerId, period);
      sendSuccess(res, { deleted: true });
    } catch (err) {
      next(err);
    }
  },
);

export { router as managerEffectivenessRoutes };

// ============================================================================
// AI SUMMARY ROUTES
// GET review summary, employee summary, team summary.
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate, authorize } from "../middleware/auth.middleware";
import * as aiSummaryService from "../../services/ai-summary/ai-summary.service";
import { sendSuccess } from "../../utils/response";
import { ValidationError, ForbiddenError } from "../../utils/errors";

const router = Router();
router.use(authenticate);

const HR_ROLES = ["hr_admin", "hr_manager", "org_admin", "super_admin"];

// GET /ai-summary/review/:reviewId — Generate/get review summary
// A4: only HR/admin or the review's employee/reviewer may read the summary.
router.get("/review/:reviewId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const { reviewId } = req.params;
    if (!reviewId) throw new ValidationError("reviewId is required");
    const regenerate = req.query.regenerate === "1" || req.query.regenerate === "true";
    const result = await aiSummaryService.generateReviewSummary(orgId, reviewId as string, regenerate);

    const isHr = HR_ROLES.includes(req.user!.role);
    const me = req.user!.empcloudUserId;
    if (!isHr && result.employee_id !== me && result.reviewer_id !== me) {
      throw new ForbiddenError("You do not have access to this review summary");
    }

    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// GET /ai-summary/employee/:userId — Employee performance summary
// A4: a user may read their own summary; otherwise HR/admin only.
router.get("/employee/:userId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const userId = parseInt(req.params.userId as string);
    const cycleId = req.query.cycleId as string;
    if (isNaN(userId)) throw new ValidationError("userId must be a number");
    if (!cycleId) throw new ValidationError("cycleId query parameter is required");

    const isHr = HR_ROLES.includes(req.user!.role);
    if (!isHr && req.user!.empcloudUserId !== userId) {
      throw new ForbiddenError("You may only view your own performance summary");
    }

    const regenerate = req.query.regenerate === "1" || req.query.regenerate === "true";
    const result = await aiSummaryService.generateEmployeeSummary(orgId, userId, cycleId, regenerate);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// GET /ai-summary/team/:managerId — Team summary for manager
router.get(
  "/team/:managerId",
  authorize("hr_admin", "hr_manager", "org_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const managerId = parseInt(req.params.managerId as string);
      const cycleId = req.query.cycleId as string;
      if (isNaN(managerId)) throw new ValidationError("managerId must be a number");
      if (!cycleId) throw new ValidationError("cycleId query parameter is required");
      const regenerate = req.query.regenerate === "1" || req.query.regenerate === "true";
      const result = await aiSummaryService.generateTeamSummary(orgId, managerId, cycleId, regenerate);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },
);

export { router as aiSummaryRoutes };

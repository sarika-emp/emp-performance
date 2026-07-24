// ============================================================================
// FEEDBACK ROUTES
// POST give, GET received/given/wall/:id, PUT edit, DELETE feedback.
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate, authorize } from "../middleware/auth.middleware";
import * as feedbackService from "../../services/feedback/feedback.service";
import { sendSuccess, sendPaginated } from "../../utils/response";
import {
  paginationSchema,
  giveFeedbackSchema,
  updateFeedbackSchema,
  idParamSchema,
} from "@emp-performance/shared";

const router = Router();
router.use(authenticate);

// GET /feedback — list ALL feedback in the org (includes private / manager-only
// items), so it must be admin-only. Without this gate any authenticated
// employee could read every colleague's confidential feedback.
router.get("/", authorize("super_admin", "org_admin", "hr_admin", "hr_manager"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const pagination = paginationSchema.parse(req.query);
    const result = await feedbackService.listAll(orgId, {
      page: pagination.page,
      limit: pagination.perPage,
      type: req.query.type as string | undefined,
      search: pagination.search,
    });
    sendPaginated(res, result.data, result.total, result.page, result.limit);
  } catch (err) {
    next(err);
  }
});

// POST /feedback — give feedback
router.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const fromUserId = req.user!.empcloudUserId;
    const data = giveFeedbackSchema.parse(req.body);
    const result = await feedbackService.giveFeedback(orgId, fromUserId, data);
    sendSuccess(res, result, 201);
  } catch (err) {
    next(err);
  }
});

// GET /feedback/received
router.get("/received", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const userId = req.user!.empcloudUserId;
    const pagination = paginationSchema.parse(req.query);
    const result = await feedbackService.listReceived(orgId, userId, {
      page: pagination.page,
      limit: pagination.perPage,
      type: req.query.type as string | undefined,
      search: pagination.search,
    });
    sendPaginated(res, result.data, result.total, result.page, result.limit);
  } catch (err) {
    next(err);
  }
});

// GET /feedback/given
router.get("/given", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const userId = req.user!.empcloudUserId;
    const pagination = paginationSchema.parse(req.query);
    const result = await feedbackService.listGiven(orgId, userId, {
      page: pagination.page,
      limit: pagination.perPage,
      type: req.query.type as string | undefined,
      search: pagination.search,
    });
    sendPaginated(res, result.data, result.total, result.page, result.limit);
  } catch (err) {
    next(err);
  }
});

// GET /feedback/wall — public kudos feed
router.get("/wall", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const pagination = paginationSchema.parse(req.query);
    const result = await feedbackService.getPublicWall(orgId, {
      page: pagination.page,
      limit: pagination.perPage,
      search: pagination.search,
    });
    sendPaginated(res, result.data, result.total, result.page, result.limit);
  } catch (err) {
    next(err);
  }
});

// GET /feedback/:id — single feedback (anonymity-respecting + access-scoped:
// only the sender, recipient, or an admin may read a non-public item).
router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const { id } = idParamSchema.parse(req.params);
    const result = await feedbackService.getFeedback(orgId, id, req.user!.empcloudUserId, req.user!.role);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// PUT /feedback/:id — edit feedback (author or admin)
router.put("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const { id } = idParamSchema.parse(req.params);
    const data = updateFeedbackSchema.parse(req.body);
    const result = await feedbackService.updateFeedback(
      orgId,
      id,
      req.user!.empcloudUserId,
      req.user!.role,
      data,
    );
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// DELETE /feedback/:id — author or admin only (#F1)
router.delete("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const { id } = idParamSchema.parse(req.params);
    await feedbackService.deleteFeedback(
      orgId,
      id,
      req.user!.empcloudUserId,
      req.user!.role,
    );
    sendSuccess(res, { deleted: true });
  } catch (err) {
    next(err);
  }
});

export { router as feedbackRoutes };

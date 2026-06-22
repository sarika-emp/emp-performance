// ============================================================================
// GOAL ROUTES
// REST endpoints for goals, key results, and check-ins.
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate } from "../middleware/auth.middleware";
import { sendSuccess, sendPaginated } from "../../utils/response";
import {
  createGoalSchema,
  updateGoalSchema,
  addKeyResultSchema,
  updateKeyResultSchema,
  checkInSchema,
  paginationSchema,
  idParamSchema,
} from "@emp-performance/shared";
import * as goalService from "../../services/goal/goal.service";

const router = Router();
router.use(authenticate);

// Build the acting-user descriptor used for ownership/RBAC checks (G5).
function actorOf(req: Request) {
  return { userId: req.user!.empcloudUserId, role: req.user!.role };
}

// ---------------------------------------------------------------------------
// GET /tree — hierarchical goal alignment tree
// ---------------------------------------------------------------------------
router.get("/tree", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const cycleId = req.query.cycleId as string | undefined;
    const tree = await goalService.getGoalTree(orgId, cycleId);
    return sendSuccess(res, tree);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /:id/alignment — goal with ancestors + descendants
// ---------------------------------------------------------------------------
router.get("/:id/alignment", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const { id } = idParamSchema.parse(req.params);
    const result = await goalService.getGoalAlignment(orgId, id);
    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET / — list goals (paginated, filterable)
// ---------------------------------------------------------------------------
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const pagination = paginationSchema.parse(req.query);

    const result = await goalService.listGoals(orgId, {
      employeeId: req.query.employeeId ? Number(req.query.employeeId) : undefined,
      cycleId: req.query.cycleId as string | undefined,
      category: req.query.category as string | undefined,
      status: req.query.status as string | undefined,
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
// POST / — create goal
// ---------------------------------------------------------------------------
router.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const data = createGoalSchema.parse(req.body);

    const goal = await goalService.createGoal(orgId, req.user!.empcloudUserId, data);
    return sendSuccess(res, goal, 201);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /:id — goal detail with KRs and check-ins
// ---------------------------------------------------------------------------
router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const { id } = idParamSchema.parse(req.params);

    const goal = await goalService.getGoal(orgId, id);
    return sendSuccess(res, goal);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PUT /:id — update goal
// ---------------------------------------------------------------------------
router.put("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const { id } = idParamSchema.parse(req.params);
    const data = updateGoalSchema.parse(req.body);

    const goal = await goalService.updateGoal(orgId, id, data, actorOf(req));
    return sendSuccess(res, goal);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// DELETE /:id — soft delete
// ---------------------------------------------------------------------------
router.delete("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const { id } = idParamSchema.parse(req.params);

    await goalService.deleteGoal(orgId, id, actorOf(req));
    return sendSuccess(res, { deleted: true });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /:id/key-results — add key result
// ---------------------------------------------------------------------------
router.post("/:id/key-results", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const { id } = idParamSchema.parse(req.params);
    const data = addKeyResultSchema.parse(req.body);

    const kr = await goalService.addKeyResult(orgId, id, data, actorOf(req));
    return sendSuccess(res, kr, 201);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PUT /:id/key-results/:krId — update key result
// ---------------------------------------------------------------------------
router.put("/:id/key-results/:krId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const { id } = idParamSchema.parse(req.params);
    const krId = req.params.krId as string;
    const data = updateKeyResultSchema.parse(req.body);

    const kr = await goalService.updateKeyResult(orgId, id, krId, data, actorOf(req));
    return sendSuccess(res, kr);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// DELETE /:id/key-results/:krId — delete key result
// ---------------------------------------------------------------------------
router.delete(
  "/:id/key-results/:krId",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const { id } = idParamSchema.parse(req.params);
      const krId = req.params.krId as string;

      await goalService.deleteKeyResult(orgId, id, krId, actorOf(req));
      return sendSuccess(res, { deleted: true });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /:id/check-in — log check-in
// ---------------------------------------------------------------------------
router.post("/:id/check-in", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const { id } = idParamSchema.parse(req.params);
    const data = checkInSchema.parse(req.body);

    const checkIn = await goalService.checkIn(
      orgId,
      id,
      req.user!.empcloudUserId,
      data,
      actorOf(req),
    );
    return sendSuccess(res, checkIn, 201);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /:id/check-ins — list check-ins
// ---------------------------------------------------------------------------
router.get("/:id/check-ins", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const { id } = idParamSchema.parse(req.params);
    const pagination = paginationSchema.parse(req.query);

    const result = await goalService.getCheckIns(orgId, id, {
      page: pagination.page,
      perPage: pagination.perPage,
    });
    return sendPaginated(res, result.data, result.total, result.page, result.perPage);
  } catch (err) {
    next(err);
  }
});

export { router as goalRoutes };

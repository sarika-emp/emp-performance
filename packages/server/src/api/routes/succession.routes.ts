// ============================================================================
// SUCCESSION PLANNING ROUTES
// CRUD for succession plans and candidates.
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate, authorize } from "../middleware/auth.middleware";
import * as analyticsService from "../../services/analytics/succession.service";
import { sendSuccess, sendPaginated } from "../../utils/response";
import { ValidationError } from "../../utils/errors";
import {
  createSuccessionPlanSchema,
  updateSuccessionPlanSchema,
  addSuccessionCandidateSchema,
  updateSuccessionCandidateSchema,
  paginationSchema,
} from "@emp-performance/shared";

const router = Router();
router.use(authenticate);
router.use(authorize("hr_admin", "hr_manager", "org_admin"));

// GET /succession-plans — paginated + search + criticality/status/department filters
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const pagination = paginationSchema.parse(req.query);
    const result = await analyticsService.listSuccessionPlans(orgId, {
      page: pagination.page,
      perPage: pagination.perPage,
      sort: pagination.sort,
      order: pagination.order,
      search: pagination.search,
      criticality: (req.query.criticality as string) || undefined,
      status: (req.query.status as string) || undefined,
      department: (req.query.department as string) || undefined,
    });
    sendPaginated(res, result.data, result.total, result.page, result.perPage);
  } catch (err) {
    next(err);
  }
});

// POST /succession-plans
router.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const data = createSuccessionPlanSchema.parse(req.body);
    const result = await analyticsService.createSuccessionPlan(orgId, data);
    sendSuccess(res, result, 201);
  } catch (err: any) {
    if (err.name === "ZodError") {
      return next(new ValidationError("Invalid succession plan data", err.flatten().fieldErrors));
    }
    next(err);
  }
});

// GET /succession-plans/:id
router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const result = await analyticsService.getSuccessionPlan(orgId, req.params.id as string);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// PUT /succession-plans/:id — update plan lifecycle (S1)
router.put("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const data = updateSuccessionPlanSchema.parse(req.body);
    const result = await analyticsService.updateSuccessionPlan(
      orgId,
      req.params.id as string,
      data,
    );
    sendSuccess(res, result);
  } catch (err: any) {
    if (err.name === "ZodError") {
      return next(new ValidationError("Invalid succession plan data", err.flatten().fieldErrors));
    }
    next(err);
  }
});

// DELETE /succession-plans/:id — delete plan (S2)
router.delete(
  "/:id",
  authorize("hr_admin", "org_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      await analyticsService.deleteSuccessionPlan(orgId, req.params.id as string);
      sendSuccess(res, { deleted: true });
    } catch (err) {
      next(err);
    }
  },
);

// POST /succession-plans/:id/candidates
router.post("/:id/candidates", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const data = addSuccessionCandidateSchema.parse(req.body);
    const result = await analyticsService.addSuccessionCandidate(orgId, req.params.id as string, data);
    sendSuccess(res, result, 201);
  } catch (err: any) {
    if (err.name === "ZodError") {
      return next(new ValidationError("Invalid candidate data", err.flatten().fieldErrors));
    }
    next(err);
  }
});

// PUT /succession-plans/:id/candidates/:candidateId
router.put(
  "/:id/candidates/:candidateId",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const data = updateSuccessionCandidateSchema.parse(req.body);
      const result = await analyticsService.updateSuccessionCandidate(
        orgId,
        req.params.id as string,
        req.params.candidateId as string,
        data,
      );
      sendSuccess(res, result);
    } catch (err: any) {
      if (err.name === "ZodError") {
        return next(new ValidationError("Invalid candidate data", err.flatten().fieldErrors));
      }
      next(err);
    }
  },
);

// DELETE /succession-plans/:id/candidates/:candidateId — remove candidate (S2)
router.delete(
  "/:id/candidates/:candidateId",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      await analyticsService.deleteSuccessionCandidate(
        orgId,
        req.params.id as string,
        req.params.candidateId as string,
      );
      sendSuccess(res, { deleted: true });
    } catch (err) {
      next(err);
    }
  },
);

export { router as successionRoutes };

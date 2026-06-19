import { Router, Request, Response, NextFunction } from "express";
import { authenticate, authorize } from "../middleware/auth.middleware";
import { sendSuccess, sendPaginated } from "../../utils/response";
import { ValidationError } from "../../utils/errors";
import {
  createFrameworkSchema,
  addCompetencySchema,
  reorderCompetenciesSchema,
  paginationSchema,
  idParamSchema,
} from "@emp-performance/shared";
import * as frameworkService from "../../services/competency/competency-framework.service";

const router = Router();

// All routes require authentication
router.use(authenticate);

// GET / — list frameworks (paginated + search + active filter)
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const pagination = paginationSchema.parse(req.query);
    const isActiveParam = req.query.is_active as string | undefined;
    const result = await frameworkService.listFrameworks(orgId, {
      page: pagination.page,
      perPage: pagination.perPage,
      sort: pagination.sort,
      order: pagination.order,
      search: pagination.search,
      isActive:
        isActiveParam === undefined || isActiveParam === ""
          ? undefined
          : isActiveParam === "true" || isActiveParam === "1",
    });
    return sendPaginated(res, result.data, result.total, result.page, result.perPage);
  } catch (err) {
    next(err);
  }
});

// POST / — create framework (admin only)
router.post(
  "/",
  authorize("super_admin", "org_admin", "hr_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = createFrameworkSchema.parse(req.body);
      const orgId = req.user!.empcloudOrgId;
      const framework = await frameworkService.createFramework(orgId, data, req.user!.empcloudUserId);
      return sendSuccess(res, framework, 201);
    } catch (err: any) {
      if (err.name === "ZodError") {
        return next(new ValidationError("Invalid framework data", err.flatten().fieldErrors));
      }
      next(err);
    }
  },
);

// GET /:id — get framework with competencies
router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    const orgId = req.user!.empcloudOrgId;
    const framework = await frameworkService.getFramework(orgId, id);
    return sendSuccess(res, framework);
  } catch (err) {
    next(err);
  }
});

// PUT /:id — update framework
router.put(
  "/:id",
  authorize("super_admin", "org_admin", "hr_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const data = createFrameworkSchema.partial().parse(req.body);
      const orgId = req.user!.empcloudOrgId;
      const framework = await frameworkService.updateFramework(orgId, id, data);
      return sendSuccess(res, framework);
    } catch (err: any) {
      if (err.name === "ZodError") {
        return next(new ValidationError("Invalid framework data", err.flatten().fieldErrors));
      }
      next(err);
    }
  },
);

// DELETE /:id — soft delete framework
router.delete(
  "/:id",
  authorize("super_admin", "org_admin", "hr_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const orgId = req.user!.empcloudOrgId;
      await frameworkService.deleteFramework(orgId, id);
      return sendSuccess(res, { message: "Framework deleted" });
    } catch (err) {
      next(err);
    }
  },
);

// POST /:id/competencies — add competency
router.post(
  "/:id/competencies",
  authorize("super_admin", "org_admin", "hr_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const data = addCompetencySchema.parse(req.body);
      const orgId = req.user!.empcloudOrgId;
      const competency = await frameworkService.addCompetency(orgId, id, data);
      return sendSuccess(res, competency, 201);
    } catch (err: any) {
      if (err.name === "ZodError") {
        return next(new ValidationError("Invalid competency data", err.flatten().fieldErrors));
      }
      next(err);
    }
  },
);

// PUT /:id/competencies/reorder — bulk reorder competencies within a framework
// NOTE: must be declared before "/:id/competencies/:compId" so "reorder" is not
// captured as a :compId param.
router.put(
  "/:id/competencies/reorder",
  authorize("super_admin", "org_admin", "hr_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const { competency_ids } = reorderCompetenciesSchema.parse(req.body);
      const orgId = req.user!.empcloudOrgId;
      const competencies = await frameworkService.reorderCompetencies(orgId, id, competency_ids);
      return sendSuccess(res, competencies);
    } catch (err: any) {
      if (err.name === "ZodError") {
        return next(new ValidationError("Invalid reorder data", err.flatten().fieldErrors));
      }
      next(err);
    }
  },
);

// PUT /:id/competencies/:compId — update competency
router.put(
  "/:id/competencies/:compId",
  authorize("super_admin", "org_admin", "hr_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const compId = req.params.compId as string;
      const data = addCompetencySchema.partial().parse(req.body);
      const orgId = req.user!.empcloudOrgId;
      const competency = await frameworkService.updateCompetency(orgId, id, compId, data);
      return sendSuccess(res, competency);
    } catch (err: any) {
      if (err.name === "ZodError") {
        return next(new ValidationError("Invalid competency data", err.flatten().fieldErrors));
      }
      next(err);
    }
  },
);

// DELETE /:id/competencies/:compId — remove competency
router.delete(
  "/:id/competencies/:compId",
  authorize("super_admin", "org_admin", "hr_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const compId = req.params.compId as string;
      const orgId = req.user!.empcloudOrgId;
      await frameworkService.removeCompetency(orgId, id, compId);
      return sendSuccess(res, { message: "Competency removed" });
    } catch (err) {
      next(err);
    }
  },
);

export { router as competencyRoutes };

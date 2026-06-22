// ============================================================================
// CAREER PATH ROUTES
// CRUD for paths, levels, and employee track assignments.
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate, authorize } from "../middleware/auth.middleware";
import * as careerPathService from "../../services/career/career-path.service";
import { sendSuccess, sendPaginated } from "../../utils/response";
import { ValidationError } from "../../utils/errors";
import {
  createCareerPathSchema,
  addLevelSchema,
  paginationSchema,
} from "@emp-performance/shared";

const router = Router();
router.use(authenticate);

// ---------------------------------------------------------------------------
// Career Paths
// ---------------------------------------------------------------------------

// GET /career-paths — paginated + search + department/active filters
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const pagination = paginationSchema.parse(req.query);
    const isActiveParam = req.query.is_active as string | undefined;
    const result = await careerPathService.listPaths(orgId, {
      page: pagination.page,
      limit: pagination.perPage,
      sort: pagination.sort,
      order: pagination.order,
      search: pagination.search,
      department: (req.query.department as string) || undefined,
      isActive:
        isActiveParam === undefined || isActiveParam === ""
          ? undefined
          : isActiveParam === "true" || isActiveParam === "1",
    });
    sendPaginated(res, result.data, result.total, result.page, result.limit);
  } catch (err) {
    next(err);
  }
});

// GET /career-paths/tracks/roster — org-wide track roster / coverage view
router.get(
  "/tracks/roster",
  authorize("hr_admin", "hr_manager", "org_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const pagination = paginationSchema.parse(req.query);
      const result = await careerPathService.listTrackRoster(orgId, {
        page: pagination.page,
        limit: pagination.perPage,
      });
      sendPaginated(res, result.data, result.total, result.page, result.limit);
    } catch (err) {
      next(err);
    }
  },
);

// GET /career-paths/:id
router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const result = await careerPathService.getPath(orgId, req.params.id as string);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// POST /career-paths
router.post(
  "/",
  authorize("hr_admin", "hr_manager", "org_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const data = createCareerPathSchema.parse(req.body);
      const result = await careerPathService.createPath(orgId, {
        name: data.name,
        description: data.description,
        department: data.department,
        is_active: data.is_active,
        created_by: req.user!.empcloudUserId,
      });
      sendSuccess(res, result, 201);
    } catch (err: any) {
      if (err.name === "ZodError") {
        return next(new ValidationError("Invalid career path data", err.flatten().fieldErrors));
      }
      next(err);
    }
  },
);

// PUT /career-paths/:id
router.put(
  "/:id",
  authorize("hr_admin", "hr_manager", "org_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const data = createCareerPathSchema.partial().parse(req.body);
      const result = await careerPathService.updatePath(orgId, req.params.id as string, data);
      sendSuccess(res, result);
    } catch (err: any) {
      if (err.name === "ZodError") {
        return next(new ValidationError("Invalid career path data", err.flatten().fieldErrors));
      }
      next(err);
    }
  },
);

// DELETE /career-paths/:id
router.delete(
  "/:id",
  authorize("hr_admin", "org_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      await careerPathService.deletePath(orgId, req.params.id as string);
      sendSuccess(res, { deleted: true });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// Career Path Levels
// ---------------------------------------------------------------------------

// POST /career-paths/:pathId/levels
router.post(
  "/:pathId/levels",
  authorize("hr_admin", "hr_manager", "org_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const data = addLevelSchema.parse(req.body);
      const result = await careerPathService.addLevel(orgId, req.params.pathId as string, {
        title: data.title,
        level: data.level,
        description: data.description,
        requirements: data.requirements,
        min_years_experience: data.min_years_experience,
      });
      sendSuccess(res, result, 201);
    } catch (err: any) {
      if (err.name === "ZodError") {
        return next(new ValidationError("Invalid level data", err.flatten().fieldErrors));
      }
      next(err);
    }
  },
);

// PUT /career-paths/levels/:levelId
router.put(
  "/levels/:levelId",
  authorize("hr_admin", "hr_manager", "org_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const data = addLevelSchema.partial().parse(req.body);
      const result = await careerPathService.updateLevel(orgId, req.params.levelId as string, data);
      sendSuccess(res, result);
    } catch (err: any) {
      if (err.name === "ZodError") {
        return next(new ValidationError("Invalid level data", err.flatten().fieldErrors));
      }
      next(err);
    }
  },
);

// DELETE /career-paths/levels/:levelId
router.delete(
  "/levels/:levelId",
  authorize("hr_admin", "org_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      await careerPathService.removeLevel(orgId, req.params.levelId as string);
      sendSuccess(res, { deleted: true });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// Employee Career Tracks
// ---------------------------------------------------------------------------

// POST /career-paths/tracks/assign
router.post(
  "/tracks/assign",
  authorize("hr_admin", "hr_manager", "org_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const { employeeId, pathId, currentLevelId, targetLevelId } = req.body;
      if (!employeeId || !pathId || !currentLevelId) {
        throw new ValidationError("employeeId, pathId, and currentLevelId are required");
      }
      const result = await careerPathService.assignTrack(
        orgId,
        employeeId,
        pathId,
        currentLevelId,
        targetLevelId,
      );
      sendSuccess(res, result, 201);
    } catch (err) {
      next(err);
    }
  },
);

// GET /career-paths/tracks/employee/:employeeId
router.get(
  "/tracks/employee/:employeeId",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const result = await careerPathService.getEmployeeTrack(
        orgId,
        parseInt(req.params.employeeId as string),
      );
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },
);

export { router as careerPathRoutes };

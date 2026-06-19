// ============================================================================
// USERS ROUTES
// Lookup helpers for selecting employees in pickers/dropdowns.
// Source of truth is the EmpCloud master users table (org-scoped).
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate } from "../middleware/auth.middleware";
import { sendSuccess, sendPaginated } from "../../utils/response";
import { getEmpCloudDB } from "../../db/empcloud";

const router = Router();
router.use(authenticate);

// GET /users — list active employees in the caller's org.
// Optional q= for substring filter on name, email, or emp_code.
//
// PL4: supports proper pagination. Pass `paginated=true` (or any `page`/`perPage`)
// to get a `sendPaginated` envelope with a total count; large orgs no longer
// silently truncate at 100. For backwards compatibility, a plain call without
// pagination params still returns a flat array of up to `limit` rows.
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const q = ((req.query.q as string) || (req.query.search as string) || "").trim();

    const wantsPaginated =
      req.query.paginated === "true" ||
      req.query.page !== undefined ||
      req.query.perPage !== undefined ||
      req.query.per_page !== undefined;

    const db = getEmpCloudDB();

    const applyFilters = (b: any) => {
      b.where({ organization_id: orgId, status: 1 });
      if (q) {
        b.andWhere((w: any) =>
          w
            .where("first_name", "like", `%${q}%`)
            .orWhere("last_name", "like", `%${q}%`)
            .orWhere("email", "like", `%${q}%`)
            .orWhere("emp_code", "like", `%${q}%`),
        );
      }
      return b;
    };

    const columns = [
      "id",
      "first_name",
      "last_name",
      "email",
      "emp_code",
      "designation",
      "department_id",
    ];

    const mapRow = (u: any) => ({
      id: u.id,
      first_name: u.first_name,
      last_name: u.last_name,
      full_name: `${u.first_name} ${u.last_name}`.trim(),
      email: u.email,
      emp_code: u.emp_code,
      designation: u.designation,
      department_id: u.department_id,
    });

    if (wantsPaginated) {
      const page = Math.max(1, parseInt((req.query.page as string) || "1", 10) || 1);
      const perPageRaw =
        parseInt((req.query.perPage as string) || (req.query.per_page as string) || "20", 10) || 20;
      const perPage = Math.min(Math.max(1, perPageRaw), 100);
      const offset = (page - 1) * perPage;

      const [{ count }] = await applyFilters(db("users")).count("* as count");
      const total = Number(count);

      const rows = await applyFilters(db("users"))
        .select(columns)
        .orderBy("first_name", "asc")
        .limit(perPage)
        .offset(offset);

      return sendPaginated(res, rows.map(mapRow), total, page, perPage);
    }

    // Legacy flat-array response (capped). Used by lightweight pickers.
    const limit = Math.min(parseInt((req.query.limit as string) || "100", 10) || 100, 500);
    const rows = await applyFilters(db("users"))
      .select(columns)
      .orderBy("first_name", "asc")
      .limit(limit);

    sendSuccess(res, rows.map(mapRow));
  } catch (err) {
    next(err);
  }
});

// GET /users/departments — active departments in the caller's org
router.get("/departments", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const db = getEmpCloudDB();
    const rows = await db("organization_departments")
      .where({ organization_id: orgId, is_deleted: false })
      .select("id", "name")
      .orderBy("name", "asc");
    sendSuccess(res, rows);
  } catch (err) {
    next(err);
  }
});

export { router as usersRoutes };

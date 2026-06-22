// ============================================================================
// ONE-ON-ONE MEETING ROUTES
// CRUD for meetings, agenda items, action items, and meeting lifecycle.
// All routes require auth; access to a meeting is enforced in the service layer
// (employee, manager, or admin only).
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import {
  createMeetingSchema,
  updateMeetingSchema,
  requestMeetingSchema,
  addAgendaItemSchema,
  updateAgendaItemSchema,
  createActionItemSchema,
  updateActionItemSchema,
  paginationSchema,
} from "@emp-performance/shared";
import { authenticate } from "../middleware/auth.middleware";
import * as meetingService from "../../services/one-on-one/one-on-one.service";
import { sendSuccess, sendPaginated } from "../../utils/response";
import { ValidationError } from "../../utils/errors";

const router = Router();
router.use(authenticate);

function actorOf(req: Request): meetingService.Actor {
  return { userId: req.user!.empcloudUserId, role: req.user!.role };
}

// GET /meetings — paginated, searchable, participant-scoped
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const pagination = paginationSchema.parse(req.query);
    const result = await meetingService.listMeetings(orgId, actorOf(req), {
      page: pagination.page,
      perPage: pagination.perPage,
      sort: pagination.sort,
      order: pagination.order,
      search: pagination.search,
      managerId: req.query.managerId ? Number(req.query.managerId) : undefined,
      employeeId: req.query.employeeId ? Number(req.query.employeeId) : undefined,
      status: req.query.status as string | undefined,
    });
    sendPaginated(res, result.data, result.total, result.page, result.perPage);
  } catch (err) {
    next(err);
  }
});

// GET /meetings/:id — agenda paginated via agendaPage/agendaPerPage
router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const result = await meetingService.getMeeting(orgId, req.params.id as string, actorOf(req), {
      agendaPage: req.query.agendaPage ? Number(req.query.agendaPage) : undefined,
      agendaPerPage: req.query.agendaPerPage ? Number(req.query.agendaPerPage) : undefined,
    });
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// POST /meetings
router.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const data = createMeetingSchema.parse(req.body);
    const result = await meetingService.createMeeting(orgId, data);
    sendSuccess(res, result, 201);
  } catch (err) {
    next(err);
  }
});

// POST /meetings/request — employee-initiated request (O8)
router.post("/request", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const data = requestMeetingSchema.parse(req.body);
    const result = await meetingService.requestMeeting(orgId, req.user!.empcloudUserId, data);
    sendSuccess(res, result, 201);
  } catch (err) {
    next(err);
  }
});

// PUT /meetings/:id
router.put("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const data = updateMeetingSchema.parse(req.body);
    const result = await meetingService.updateMeeting(orgId, req.params.id as string, data, actorOf(req));
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// POST /meetings/:id/complete
router.post("/:id/complete", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const result = await meetingService.completeMeeting(orgId, req.params.id as string, actorOf(req));
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// POST /meetings/:id/reopen (O7)
router.post("/:id/reopen", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const result = await meetingService.reopenMeeting(orgId, req.params.id as string, actorOf(req));
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// POST /meetings/:id/cancel (O3)
router.post("/:id/cancel", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const result = await meetingService.cancelMeeting(orgId, req.params.id as string, actorOf(req));
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// DELETE /meetings/:id (O3)
router.delete("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    await meetingService.deleteMeeting(orgId, req.params.id as string, actorOf(req));
    sendSuccess(res, { deleted: true });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Agenda Items
// ---------------------------------------------------------------------------

// POST /meetings/:meetingId/agenda (also aliased as /:meetingId/agenda-items)
const agendaHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const data = addAgendaItemSchema.parse(req.body);
    const result = await meetingService.addAgendaItem(
      orgId,
      req.params.meetingId as string,
      { title: data.title, description: data.description, added_by: req.user!.empcloudUserId, order: data.order },
      actorOf(req),
    );
    sendSuccess(res, result, 201);
  } catch (err) {
    next(err);
  }
};
router.post("/:meetingId/agenda", agendaHandler);
router.post("/:meetingId/agenda-items", agendaHandler);

// PUT /meetings/agenda/:itemId
router.put("/agenda/:itemId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const data = updateAgendaItemSchema.parse(req.body);
    const result = await meetingService.updateAgendaItem(orgId, req.params.itemId as string, data, actorOf(req));
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// DELETE /meetings/agenda/:itemId (O3)
router.delete("/agenda/:itemId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    await meetingService.deleteAgendaItem(orgId, req.params.itemId as string, actorOf(req));
    sendSuccess(res, { deleted: true });
  } catch (err) {
    next(err);
  }
});

// POST /meetings/agenda/:itemId/complete — toggles discussed state (O7)
router.post("/agenda/:itemId/complete", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const result = await meetingService.completeAgendaItem(orgId, req.params.itemId as string, actorOf(req));
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Action Items (O4)
// ---------------------------------------------------------------------------

// GET /meetings/:meetingId/action-items
router.get("/:meetingId/action-items", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const result = await meetingService.listActionItems(orgId, req.params.meetingId as string, actorOf(req));
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// POST /meetings/:meetingId/action-items
router.post("/:meetingId/action-items", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const data = createActionItemSchema.parse(req.body);
    const result = await meetingService.addActionItem(orgId, req.params.meetingId as string, data, actorOf(req));
    sendSuccess(res, result, 201);
  } catch (err) {
    next(err);
  }
});

// PUT /meetings/action-items/:actionItemId
router.put("/action-items/:actionItemId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const data = updateActionItemSchema.parse(req.body);
    const result = await meetingService.updateActionItem(
      orgId,
      req.params.actionItemId as string,
      data,
      actorOf(req),
    );
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// DELETE /meetings/action-items/:actionItemId
router.delete("/action-items/:actionItemId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    await meetingService.deleteActionItem(orgId, req.params.actionItemId as string, actorOf(req));
    sendSuccess(res, { deleted: true });
  } catch (err) {
    next(err);
  }
});

// POST /meetings/:meetingId/action-items/carry-forward { toMeetingId }
router.post(
  "/:meetingId/action-items/carry-forward",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const toMeetingId = req.body?.toMeetingId as string;
      if (!toMeetingId) {
        throw new ValidationError("toMeetingId is required");
      }
      const result = await meetingService.carryForwardActionItems(
        orgId,
        req.params.meetingId as string,
        toMeetingId,
        actorOf(req),
      );
      sendSuccess(res, result, 201);
    } catch (err) {
      next(err);
    }
  },
);

export { router as oneOnOneRoutes };

// ============================================================================
// AUTH ROUTES
// POST /login, /register, /sso, /refresh-token, /logout,
// /forgot-password, /reset-password, /change-password; GET /me, /profile
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import {
  loginSchema,
  registerSchema,
  ssoSchema,
  refreshTokenSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
} from "@emp-performance/shared";
import * as authService from "../../services/auth/auth.service";
import { sendSuccess } from "../../utils/response";
import { authenticate } from "../middleware/auth.middleware";
import { sendEmail } from "../../services/email/email.service";
import { config } from "../../config";
import { logger } from "../../utils/logger";

function passwordResetEmailHtml(resetUrl: string): string {
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:32px;font-family:sans-serif;background:#f4f5f7;">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <h2 style="color:#4f46e5;margin:0 0 16px;">Reset your password</h2>
    <p style="color:#374151;">We received a request to reset your EMP Performance password. Click the button below to choose a new one. This link expires in 1 hour.</p>
    <p style="margin:24px 0;"><a href="${resetUrl}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:500;">Reset Password</a></p>
    <p style="color:#6b7280;font-size:13px;">If you didn't request this, you can safely ignore this email.</p>
  </div>
</body></html>`;
}

const router = Router();

function sessionContext(req: Request) {
  return {
    userAgent: req.headers["user-agent"],
    ipAddress: (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip,
  };
}

// POST /auth/login
router.post("/login", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const result = await authService.login(email, password, sessionContext(req));
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// POST /auth/register
router.post("/register", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = registerSchema.parse(req.body);
    const result = await authService.register(data, sessionContext(req));
    sendSuccess(res, result, 201);
  } catch (err) {
    next(err);
  }
});

// POST /auth/sso
router.post("/sso", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token } = ssoSchema.parse(req.body);
    const result = await authService.ssoLogin(token, sessionContext(req));
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// POST /auth/refresh-token
router.post("/refresh-token", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = refreshTokenSchema.parse(req.body);
    const result = await authService.refreshToken(refreshToken, sessionContext(req));
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// POST /auth/logout — revoke the supplied refresh token's session
router.post("/logout", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body ?? {};
    await authService.logout(refreshToken, req.user!.empcloudUserId);
    sendSuccess(res, { message: "Logged out" });
  } catch (err) {
    next(err);
  }
});

// POST /auth/forgot-password — always returns 200 (no user enumeration)
router.post("/forgot-password", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = forgotPasswordSchema.parse(req.body);
    const result = await authService.requestPasswordReset(email);
    if (result) {
      const resetUrl = `${config.appUrl}/reset-password?token=${encodeURIComponent(result.token)}`;
      try {
        await sendEmail(result.email, "Reset your EMP Performance password", passwordResetEmailHtml(resetUrl));
      } catch (mailErr) {
        logger.error("Failed to send password reset email:", mailErr);
      }
    }
    sendSuccess(res, {
      message: "If an account exists for that email, a reset link has been sent.",
    });
  } catch (err) {
    next(err);
  }
});

// POST /auth/reset-password — complete forgot-password with a single-use token
router.post("/reset-password", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token, password } = resetPasswordSchema.parse(req.body);
    await authService.resetPassword(token, password);
    sendSuccess(res, { message: "Password has been reset. You can now sign in." });
  } catch (err) {
    next(err);
  }
});

// POST /auth/change-password — authenticated password change
router.post("/change-password", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
    await authService.changePassword(req.user!.empcloudUserId, currentPassword, newPassword);
    sendSuccess(res, { message: "Password updated successfully." });
  } catch (err) {
    next(err);
  }
});

// GET /auth/me — return current user from JWT
router.get("/me", authenticate, (req: Request, res: Response) => {
  sendSuccess(res, req.user);
});

// GET /auth/profile — full profile for the account page
router.get("/profile", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const profile = await authService.getProfile(req.user!.empcloudUserId);
    sendSuccess(res, profile);
  } catch (err) {
    next(err);
  }
});

export { router as authRoutes };

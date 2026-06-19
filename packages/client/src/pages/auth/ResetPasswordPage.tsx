import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Target, Loader2 } from "lucide-react";
import { apiPost } from "@/api/client";
import toast from "react-hot-toast";

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords do not match");
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiPost("/auth/reset-password", { token, password });
      if (res.success) {
        toast.success("Password reset. Please sign in.");
        navigate("/login");
      } else {
        toast.error(res.error?.message || "Reset failed");
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || "Reset failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600">
            <Target className="h-6 w-6 text-white" />
          </div>
          <span className="text-xl font-bold text-gray-900">EMP Performance</span>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-bold text-gray-900">Reset password</h2>
          {!token ? (
            <p className="mt-2 text-sm text-red-500">
              This reset link is missing its token. Please request a new link.
            </p>
          ) : (
            <>
              <p className="mt-1 text-sm text-gray-500">Choose a new password for your account.</p>
              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">New password</label>
                  <input
                    type="password"
                    value={password}
                    required
                    onChange={(e) => setPassword(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                  <p className="mt-1 text-xs text-gray-400">At least 8 characters</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Confirm password</label>
                  <input
                    type="password"
                    value={confirm}
                    required
                    onChange={(e) => setConfirm(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Reset password
                </button>
              </form>
            </>
          )}
          <p className="mt-4 text-center text-sm text-gray-500">
            <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

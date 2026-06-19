import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Target, Eye, EyeOff, Loader2, Building2 } from "lucide-react";
import { useLogin } from "@/api/hooks";
import { useAuthStore } from "@/lib/auth-store";
import toast from "react-hot-toast";

// EMP Cloud SSO entry point — redirects to the dashboard which signs the user
// in and bounces back with `?sso_token=...` (handled by SSOGate in App.tsx).
const SSO_LOGIN_URL = (import.meta as any).env?.VITE_SSO_LOGIN_URL as string | undefined;

export function LoginPage() {
  const navigate = useNavigate();
  const loginMutation = useLogin();
  const login = useAuthStore((s) => s.login);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  function handleSSO() {
    if (SSO_LOGIN_URL) {
      window.location.href = SSO_LOGIN_URL;
    } else {
      toast.error("Single sign-on is not configured. Please sign in with email and password.");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await loginMutation.mutateAsync({ email, password });
      if (res.success) {
        login(res.data.user, res.data.tokens);
        toast.success(`Welcome back, ${res.data.user.firstName}!`);
        navigate("/dashboard");
      } else {
        toast.error(res.error?.message || "Login failed");
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || "Login failed. Check your credentials.");
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* Left brand panel */}
      <div className="hidden lg:flex lg:w-1/2 items-center justify-center bg-gradient-to-br from-brand-600 to-brand-800 p-12">
        <div className="max-w-md text-white">
          <div className="flex items-center gap-3 mb-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20">
              <Target className="h-7 w-7 text-white" />
            </div>
            <span className="text-2xl font-bold">EMP Performance</span>
          </div>
          <h2 className="text-3xl font-bold leading-tight mb-4">Drive employee performance</h2>
          <p className="text-brand-100 text-lg leading-relaxed">
            Run review cycles, set goals, collect 360 feedback, manage PIPs, and build career paths -- all in one place.
          </p>
          <div className="mt-10 grid grid-cols-2 gap-4">
            {["Review cycles", "Goal setting", "360 feedback", "9-Box grid", "PIPs", "Competencies", "Career paths", "Analytics"].map((f) => (
              <div key={f} className="flex items-center gap-2 text-sm text-brand-100">
                <div className="h-1.5 w-1.5 rounded-full bg-brand-300" />
                {f}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex w-full lg:w-1/2 items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="mb-8 flex items-center justify-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600">
              <Target className="h-6 w-6 text-white" />
            </div>
            <span className="text-xl font-bold text-gray-900">EMP Performance</span>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-bold text-gray-900">Welcome back</h2>
            <p className="mt-1 text-sm text-gray-500">Sign in to manage performance reviews</p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  Password
                </label>
                <div className="relative mt-1">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-end">
                <Link to="/forgot-password" className="text-sm font-medium text-brand-600 hover:text-brand-700">
                  Forgot password?
                </Link>
              </div>
              <button
                type="submit"
                disabled={loginMutation.isPending}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {loginMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  "Sign in"
                )}
              </button>
            </form>

            {/* SSO */}
            <div className="my-4 flex items-center gap-3">
              <div className="h-px flex-1 bg-gray-200" />
              <span className="text-xs text-gray-400">or</span>
              <div className="h-px flex-1 bg-gray-200" />
            </div>
            <button
              type="button"
              onClick={handleSSO}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Building2 className="h-4 w-4" />
              Sign in with EMP Cloud
            </button>

            <p className="mt-6 text-center text-sm text-gray-500">
              New organization?{" "}
              <Link to="/register" className="font-medium text-brand-600 hover:text-brand-700">
                Create an account
              </Link>
            </p>
          </div>

          <p className="mt-6 text-center text-xs text-gray-400">Part of the EMP HRMS ecosystem</p>
        </div>
      </div>
    </div>
  );
}

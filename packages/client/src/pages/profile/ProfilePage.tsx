import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { User, Lock, Loader2, Save } from "lucide-react";
import { apiGet, apiPost } from "@/api/client";
import { getInitials } from "@/lib/utils";
import toast from "react-hot-toast";

interface Profile {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  emp_code: string | null;
  designation: string | null;
  contact_number: string | null;
  role: string;
  org_name: string | null;
  date_of_joining: string | null;
  has_password: boolean;
}

export function ProfilePage() {
  const { data, isLoading } = useQuery({
    queryKey: ["profile"],
    queryFn: () => apiGet<Profile>("/auth/profile"),
  });
  const profile = data?.data;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
      </div>
    );
  }

  const displayName = profile ? `${profile.first_name} ${profile.last_name}` : "User";

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3">
        <User className="h-6 w-6 text-gray-400" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
          <p className="mt-1 text-sm text-gray-500">Your account details and security.</p>
        </div>
      </div>

      {/* Account card */}
      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 text-lg font-semibold text-brand-700">
            {getInitials(displayName)}
          </div>
          <div>
            <p className="text-lg font-semibold text-gray-900">{displayName}</p>
            <p className="text-sm text-gray-500">{profile?.email}</p>
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Detail label="Organization" value={profile?.org_name} />
          <Detail label="Role" value={profile?.role} />
          <Detail label="Employee code" value={profile?.emp_code} />
          <Detail label="Designation" value={profile?.designation} />
          <Detail label="Contact number" value={profile?.contact_number} />
          <Detail label="Date of joining" value={profile?.date_of_joining} />
        </dl>
      </div>

      {/* Change password */}
      {profile?.has_password && <ChangePasswordCard />}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</dt>
      <dd className="mt-0.5 text-sm text-gray-900">{value || "—"}</dd>
    </div>
  );
}

function ChangePasswordCard() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast.error("New password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirm) {
      toast.error("Passwords do not match");
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiPost("/auth/change-password", { currentPassword, newPassword });
      if (res.success) {
        toast.success("Password updated");
        setCurrentPassword("");
        setNewPassword("");
        setConfirm("");
      } else {
        toast.error(res.error?.message || "Update failed");
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || "Update failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-2">
        <Lock className="h-5 w-5 text-gray-400" />
        <h2 className="text-lg font-semibold text-gray-900">Change password</h2>
      </div>
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <PwField label="Current password" value={currentPassword} onChange={setCurrentPassword} />
        <PwField label="New password" value={newPassword} onChange={setNewPassword} hint="At least 8 characters" />
        <PwField label="Confirm new password" value={confirm} onChange={setConfirm} />
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={submitting}
            className="flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Update password
          </button>
        </div>
      </form>
    </div>
  );
}

function PwField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <input
        type="password"
        value={value}
        required
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block w-full max-w-sm rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
      />
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

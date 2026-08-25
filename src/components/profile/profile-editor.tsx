"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, KeyRound, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader } from "@/components/ui/card";
import { Toast } from "@/components/ui/toast";
import { AvatarImage } from "./avatar-image";
import { AVATAR_MAX_BYTES } from "@/lib/validation/profile";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { apiFetch } from "@/lib/api-client/browser";

export type ProfileData = {
  email: string;
  name: string | null;
  role: string;
  createdAt: string;
  lastLoginAt: string | null;
  avatarUpdatedAt: string | null;
};

type Tone = "success" | "error";

export function ProfileEditor({
  profile,
  labels,
}: {
  profile: ProfileData;
  labels: Dictionary["profile"];
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [toast, setToast] = useState<{ message: string; tone: Tone } | null>(null);
  const [savingName, setSavingName] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [passwordErrors, setPasswordErrors] = useState<Record<string, string>>({});

  async function call(url: string, options: RequestInit) {
    const res = await apiFetch(url, {
      headers: options.body instanceof FormData ? undefined : { "Content-Type": "application/json" },
      ...options,
    });
    const json = (await res.json().catch(() => ({ ok: false }))) as {
      ok: boolean;
      error?: { message: string; details?: { path: string; message: string }[] };
    };
    if (!res.ok || !json.ok) throw json.error ?? { message: labels.requestFailed };
    return json;
  }

  async function onPickFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset immediately so picking the same file twice still fires a change.
    event.target.value = "";
    if (!file) return;

    setUploading(true);
    try {
      const body = new FormData();
      body.append("avatar", file);
      await call("/api/profile/avatar", { method: "POST", body });
      setToast({ message: labels.uploaded, tone: "success" });
      router.refresh();
    } catch (error) {
      setToast({ message: (error as { message?: string }).message ?? labels.requestFailed, tone: "error" });
    } finally {
      setUploading(false);
    }
  }

  async function removePicture() {
    if (!window.confirm(labels.removeConfirm)) return;
    setUploading(true);
    try {
      await call("/api/profile/avatar", { method: "DELETE" });
      setToast({ message: labels.removed, tone: "success" });
      router.refresh();
    } catch (error) {
      setToast({ message: (error as { message?: string }).message ?? labels.requestFailed, tone: "error" });
    } finally {
      setUploading(false);
    }
  }

  async function saveName(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingName(true);
    setNameError(null);
    const form = new FormData(event.currentTarget);

    try {
      await call("/api/profile", {
        method: "PATCH",
        body: JSON.stringify({ name: String(form.get("name") ?? "") }),
      });
      setToast({ message: labels.saved, tone: "success" });
      router.refresh();
    } catch (error) {
      const err = error as { message?: string; details?: { path: string; message: string }[] };
      setNameError(err.details?.find((d) => d.path === "name")?.message ?? err.message ?? labels.requestFailed);
      setToast({ message: err.message ?? labels.requestFailed, tone: "error" });
    } finally {
      setSavingName(false);
    }
  }

  async function savePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const currentPassword = String(form.get("currentPassword") ?? "");
    const newPassword = String(form.get("newPassword") ?? "");
    const confirm = String(form.get("confirm") ?? "");

    if (newPassword !== confirm) {
      setPasswordErrors({ confirm: labels.passwordsDoNotMatch });
      return;
    }

    setSavingPassword(true);
    setPasswordErrors({});
    const formEl = event.currentTarget;

    try {
      await call("/api/profile/password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setToast({ message: labels.passwordChanged, tone: "success" });
      formEl.reset();
    } catch (error) {
      const err = error as { message?: string; details?: { path: string; message: string }[] };
      if (err.details) {
        setPasswordErrors(Object.fromEntries(err.details.map((d) => [d.path, d.message])));
      }
      setToast({ message: err.message ?? labels.requestFailed, tone: "error" });
    } finally {
      setSavingPassword(false);
    }
  }

  const maxKb = Math.floor(AVATAR_MAX_BYTES / 1024);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title={labels.pictureTitle}
          subtitle={labels.pictureSubtitle.replace("{max}", String(maxKb))}
        />
        <div className="flex flex-wrap items-center gap-5">
          <AvatarImage
            name={profile.name}
            email={profile.email}
            avatarUpdatedAt={profile.avatarUpdatedAt}
            className="h-20 w-20"
            textClassName="text-2xl"
          />

          <div className="flex flex-wrap gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={onPickFile}
              className="hidden"
            />
            <Button size="sm" variant="secondary" loading={uploading} onClick={() => fileRef.current?.click()}>
              <Camera className="h-4 w-4" />
              {profile.avatarUpdatedAt ? labels.change : labels.upload}
            </Button>
            {profile.avatarUpdatedAt && (
              <Button size="sm" variant="ghost" loading={uploading} onClick={removePicture}>
                <Trash2 className="h-4 w-4" />
                {labels.removePicture}
              </Button>
            )}
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title={labels.detailsTitle} subtitle={labels.detailsSubtitle} />
        <form onSubmit={saveName} className="space-y-4">
          <Input name="name" label={labels.name} defaultValue={profile.name ?? ""} maxLength={80} error={nameError ?? undefined} />

          <div className="space-y-1.5">
            <Input name="email" label={labels.email} defaultValue={profile.email} disabled readOnly />
            <p className="text-xs text-muted">{labels.emailHint}</p>
          </div>

          <dl className="grid gap-4 sm:grid-cols-3">
            <Fact label={labels.role} value={profile.role} />
            <Fact label={labels.memberSince} value={new Date(profile.createdAt).toLocaleDateString()} />
            <Fact
              label={labels.lastLogin}
              value={profile.lastLoginAt ? new Date(profile.lastLoginAt).toLocaleString() : labels.never}
            />
          </dl>

          <Button type="submit" loading={savingName}>
            <Save className="h-4 w-4" />
            {labels.saveChanges}
          </Button>
        </form>
      </Card>

      <Card>
        <CardHeader title={labels.passwordTitle} subtitle={labels.passwordSubtitle} />
        <form onSubmit={savePassword} className="space-y-4">
          <Input
            name="currentPassword"
            type="password"
            label={labels.currentPassword}
            required
            autoComplete="current-password"
            error={passwordErrors.currentPassword}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              name="newPassword"
              type="password"
              label={labels.newPassword}
              required
              autoComplete="new-password"
              error={passwordErrors.newPassword}
            />
            <Input
              name="confirm"
              type="password"
              label={labels.confirmPassword}
              required
              autoComplete="new-password"
              error={passwordErrors.confirm}
            />
          </div>
          <Button type="submit" loading={savingPassword}>
            <KeyRound className="h-4 w-4" />
            {labels.changePassword}
          </Button>
        </form>
      </Card>

      {toast && <Toast message={toast.message} tone={toast.tone} onDismiss={() => setToast(null)} />}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-1 text-sm font-medium">{value}</dd>
    </div>
  );
}

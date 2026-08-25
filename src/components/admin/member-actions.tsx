"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Save, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toast } from "@/components/ui/toast";
import { useT } from "@/components/i18n/locale-provider";
import { apiFetch } from "@/lib/api-client/browser";

export type AdminMemberRow = {
  id: string;
  email: string;
  name: string | null;
  role: "ADMIN" | "MEMBER";
  status: string;
  lockedUntil: string | null;
  accounts: number;
  subscriptions: number;
};

type ApiResponse = {
  ok: boolean;
  data?: { deletionBlockers?: { code: string; message: string }[] };
  error?: { message: string; details?: unknown };
};

export function MemberActions({ member, isSelf }: { member: AdminMemberRow; isSelf: boolean }) {
  const router = useRouter();
  const t = useT();
  const [mode, setMode] = useState<"idle" | "edit" | "delete">("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" } | null>(null);
  const [blockers, setBlockers] = useState<{ code: string; message: string }[]>([]);
  const [confirmEmail, setConfirmEmail] = useState("");

  const locked = member.lockedUntil !== null && new Date(member.lockedUntil) > new Date();

  async function call(url: string, options: RequestInit) {
    const res = await apiFetch(url, {
      headers: options.body ? { "Content-Type": "application/json" } : undefined,
      ...options,
    });
    const json = (await res.json().catch(() => ({ ok: false }))) as ApiResponse;
    if (!res.ok || !json.ok) throw json.error ?? { message: t.memberActions.requestFailed };
    return json;
  }

  async function openDelete() {
    setError(null);
    setConfirmEmail("");
    setMode("delete");
    try {
      // Ask first, so the admin sees what stands in the way before typing an
      // email to confirm something that cannot then happen.
      const json = await call(`/api/admin/members/${member.id}`, { method: "GET" });
      setBlockers(json.data?.deletionBlockers ?? []);
    } catch {
      setBlockers([]);
    }
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);

    try {
      await call(`/api/admin/members/${member.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: String(form.get("name") ?? ""),
          role: String(form.get("role") ?? member.role),
          status: String(form.get("status") ?? member.status),
          unlock: form.get("unlock") === "on",
        }),
      });
      setToast({ message: t.memberActions.updated.replace("{email}", member.email), tone: "success" });
      setMode("idle");
      router.refresh();
    } catch (err) {
      setError((err as { message?: string }).message ?? t.memberActions.couldNotUpdate);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await call(`/api/admin/members/${member.id}`, {
        method: "DELETE",
        body: JSON.stringify({ confirmEmail }),
      });
      setToast({ message: t.memberActions.deleted.replace("{email}", member.email), tone: "success" });
      setMode("idle");
      router.refresh();
    } catch (err) {
      setError((err as { message?: string }).message ?? t.memberActions.couldNotDelete);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="secondary" onClick={() => setMode("edit")}>
          <Pencil className="h-4 w-4" />
          {t.memberActions.edit}
        </Button>
        <Button size="sm" variant="danger" disabled={isSelf} onClick={openDelete} title={isSelf ? t.memberActions.cannotDeleteSelf : undefined}>
          <Trash2 className="h-4 w-4" />
          {t.memberActions.delete}
        </Button>
      </div>

      {mode === "edit" && (
        <Dialog title={t.memberActions.editTitle.replace("{email}", member.email)} onClose={() => setMode("idle")}>
          <form onSubmit={save} className="space-y-4">
            <Input name="name" label={t.memberActions.name} defaultValue={member.name ?? ""} maxLength={80} />

            <div className="grid gap-4 sm:grid-cols-2">
              <Select name="role" label={t.memberActions.role} defaultValue={member.role} options={["MEMBER", "ADMIN"]} disabled={isSelf} />
              <Select
                name="status"
                label={t.memberActions.status}
                defaultValue={member.status}
                options={["ACTIVE", "SUSPENDED", "PENDING_VERIFICATION"]}
                disabled={isSelf}
              />
            </div>

            {isSelf && (
              <p className="text-xs text-muted">
                {t.memberActions.selfNote}
              </p>
            )}

            {locked && (
              <label className="flex items-start gap-3 rounded-lg p-3 text-sm" style={{ background: "var(--bg)" }}>
                <input type="checkbox" name="unlock" className="mt-1" />
                <span>
                  <span className="block font-medium">{t.memberActions.clearLockout}</span>
                  <span className="block text-xs text-muted">
                    {t.memberActions.lockedUntil.replace(
                      "{time}",
                      new Date(member.lockedUntil!).toLocaleString(),
                    )}
                  </span>
                </span>
              </label>
            )}

            <p className="text-xs leading-relaxed text-muted">
              {t.memberActions.suspendNote}
            </p>

            {error && <p className="text-sm text-red-500">{error}</p>}

            <div className="flex gap-2">
              <Button type="submit" loading={busy}>
                <Save className="h-4 w-4" />
                {t.memberActions.saveChanges}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setMode("idle")}>
                <X className="h-4 w-4" />
                {t.memberActions.cancel}
              </Button>
            </div>
          </form>
        </Dialog>
      )}

      {mode === "delete" && (
        <Dialog title={t.memberActions.deleteTitle.replace("{email}", member.email)} onClose={() => setMode("idle")}>
          <div className="space-y-4">
            <div className="rounded-lg p-3 text-sm" style={{ background: "var(--bg)" }}>
              <p className="font-medium">{t.memberActions.cannotBeUndone}</p>
              <p className="mt-1 text-muted">
                {t.memberActions.deleteBody
                  .replace("{accounts}", String(member.accounts))
                  .replace("{subscriptions}", String(member.subscriptions))}
                <span className="font-medium">{t.memberActions.notClosed}</span>
                {t.memberActions.deleteBodyTail}
              </p>
              <p className="mt-2 text-muted">
                {t.memberActions.suspendInstead}
              </p>
            </div>

            {blockers.length > 0 && (
              <ul className="space-y-1 rounded-lg p-3 text-sm" style={{ background: "var(--bg)" }}>
                {blockers.map((blocker) => (
                  <li key={blocker.code} className="text-red-500">
                    {blocker.message}
                  </li>
                ))}
              </ul>
            )}

            <Input
              name="confirmEmail"
              label={t.memberActions.typeToConfirm.replace("{email}", member.email)}
              value={confirmEmail}
              onChange={(event) => setConfirmEmail(event.target.value)}
              autoComplete="off"
            />

            {error && <p className="text-sm text-red-500">{error}</p>}

            <div className="flex gap-2">
              <Button
                variant="danger"
                loading={busy}
                disabled={blockers.length > 0 || confirmEmail.trim().toLowerCase() !== member.email.toLowerCase()}
                onClick={remove}
              >
                <Trash2 className="h-4 w-4" />
                {t.memberActions.deletePermanently}
              </Button>
              <Button variant="ghost" onClick={() => setMode("idle")}>
                <X className="h-4 w-4" />
                {t.memberActions.cancel}
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {toast && <Toast message={toast.message} tone={toast.tone} onDismiss={() => setToast(null)} />}
    </>
  );
}

function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const t = useT();

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="panel my-10 w-full max-w-lg rounded-2xl p-6 text-left">
        <div className="mb-5 flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label={t.memberActions.close} className="text-muted transition hover:opacity-70">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Select({
  name,
  label,
  options,
  defaultValue,
  disabled,
}: {
  name: string;
  label: string;
  options: string[];
  defaultValue: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={name} className="block text-sm font-medium">
        {label}
      </label>
      <select
        id={name}
        name={name}
        defaultValue={defaultValue}
        disabled={disabled}
        className="panel h-10 w-full rounded-lg px-3 text-sm outline-none transition focus:border-brand-500 disabled:opacity-60"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}

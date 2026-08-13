import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import api from "../lib/api";
import {
  canEditEmployeeAccounts,
  getCurrentUser,
  type UserRole,
} from "../lib/auth";
import { dashboardSections, type DashboardSectionKey } from "../lib/dashboardSettings";
import SignInApprovalsPanel from "../components/SignInApprovalsPanel";

type Branch = { id: string; name: string };

type EmployeeRecord = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: UserRole;
  isActive: boolean;
  assignedWork: string | null;
  allowedSections: DashboardSectionKey[] | null;
  branchIds: string[];
  lastLoginAt: string | null;
  createdAt: string;
};

const DEFAULT_SECTIONS: DashboardSectionKey[] = [
  "sales",
  "dailySales",
  "historySales",
  "taskEmployee",
];

const emptyForm = () => ({
  name: "",
  email: "",
  phone: "",
  password: "",
  role: "EMPLOYEE" as UserRole,
  assignedWork: "",
  branchIds: [] as string[],
  allowedSections: [...DEFAULT_SECTIONS] as DashboardSectionKey[],
  isActive: true,
});

export default function EmployeeAccounts() {
  const { t } = useTranslation();
  const currentUser = getCurrentUser();
  const canEdit = canEditEmployeeAccounts(currentUser);
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const roleOptions: UserRole[] = useMemo(
    () => ["EMPLOYEE", "MANAGER", "ADMIN", "TRUSTEE"],
    []
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [employeesRes, branchesRes] = await Promise.all([
        api.get<{ employees: EmployeeRecord[] }>("/employees"),
        api.get<{ branches: Branch[] }>("/employees/branches/list"),
      ]);
      setEmployees(employeesRes.data.employees);
      setBranches(branchesRes.data.branches);
    } catch (loadError: unknown) {
      const msg =
        loadError instanceof Error ? loadError.message : t("employeeAccounts.loadFailed");
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const resetForm = () => {
    setEditingId(null);
    setForm(emptyForm());
    setMessage(null);
    setError(null);
  };

  const startEdit = (employee: EmployeeRecord) => {
    if (!canEdit) return;
    setEditingId(employee.id);
    setForm({
      name: employee.name,
      email: employee.email,
      phone: employee.phone ?? "",
      password: "",
      role: employee.role,
      assignedWork: employee.assignedWork ?? "",
      branchIds: [...employee.branchIds],
      allowedSections: employee.allowedSections?.length
        ? [...employee.allowedSections]
        : [...DEFAULT_SECTIONS],
      isActive: employee.isActive,
    });
    setMessage(null);
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const toggleSection = (key: DashboardSectionKey) => {
    setForm((current) => ({
      ...current,
      allowedSections: current.allowedSections.includes(key)
        ? current.allowedSections.filter((section) => section !== key)
        : [...current.allowedSections, key],
    }));
  };

  const toggleBranch = (branchId: string) => {
    setForm((current) => ({
      ...current,
      branchIds: current.branchIds.includes(branchId)
        ? current.branchIds.filter((id) => id !== branchId)
        : [...current.branchIds, branchId],
    }));
  };

  const showAccessPanel = form.role === "EMPLOYEE" || form.role === "TRUSTEE";
  const roleNeedsDeviceApproval = showAccessPanel;

  const handleSubmit = async () => {
    if (!canEdit) return;
    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || null,
        role: form.role,
        assignedWork: form.assignedWork.trim() || null,
        branchIds: form.branchIds,
        allowedSections: showAccessPanel ? form.allowedSections : null,
        isActive: form.isActive,
        ...(form.password ? { password: form.password } : {}),
      };

      if (editingId) {
        await api.patch(`/employees/${editingId}`, payload);
        setMessage(t("employeeAccounts.updated"));
      } else {
        if (!form.password.trim()) {
          setError(t("employeeAccounts.passwordRequired"));
          setSaving(false);
          return;
        }
        await api.post("/employees", { ...payload, password: form.password });
        setMessage(
          roleNeedsDeviceApproval
            ? t("employeeAccounts.createdAwaitingDeviceSignIn")
            : t("employeeAccounts.created")
        );
      }

      await loadData();
      resetForm();
    } catch (submitError: unknown) {
      const responseError =
        submitError &&
        typeof submitError === "object" &&
        "response" in submitError &&
        submitError.response &&
        typeof submitError.response === "object" &&
        "data" in submitError.response &&
        submitError.response.data &&
        typeof submitError.response.data === "object" &&
        "error" in submitError.response.data
          ? String(submitError.response.data.error)
          : t("employeeAccounts.saveFailed");
      setError(responseError);
    } finally {
      setSaving(false);
    }
  };

  const roleLabel = (role: UserRole) => {
    const map: Record<UserRole, string> = {
      ADMIN: t("common.admin"),
      MANAGER: t("common.manager"),
      EMPLOYEE: t("common.employeeRole"),
      TRUSTEE: t("common.trusteeRole"),
    };
    return map[role];
  };

  if (!currentUser || (currentUser.role !== "ADMIN" && currentUser.role !== "MANAGER")) {
    return (
      <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-red-800">
        {t("employeeAccounts.adminOnly")}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-black">{t("employeeAccounts.title")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-600">{t("employeeAccounts.subtitle")}</p>
        </div>
        {canEdit && (
          <button type="button" className="btn-secondary" onClick={resetForm}>
            {t("employeeAccounts.newAccount")}
          </button>
        )}
      </div>

      <SignInApprovalsPanel />

      {canEdit && (
        <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-black">
            {editingId ? t("employeeAccounts.editAccount") : t("employeeAccounts.createAccount")}
          </h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium text-gray-700">{t("employeeAccounts.fullName")}</span>
              <input
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                className="input-field mt-1"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-gray-700">{t("employeeAccounts.email")}</span>
              <input
                type="email"
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                className="input-field mt-1"
                disabled={Boolean(editingId)}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-gray-700">{t("employeeAccounts.phone")}</span>
              <input
                value={form.phone}
                onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                className="input-field mt-1"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-gray-700">
                {editingId ? t("employeeAccounts.newPasswordOptional") : t("employeeAccounts.password")}
              </span>
              <input
                type="password"
                value={form.password}
                onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                className="input-field mt-1"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-gray-700">{t("employeeAccounts.role")}</span>
              <select
                value={form.role}
                onChange={(event) =>
                  setForm((current) => ({ ...current, role: event.target.value as UserRole }))
                }
                className="input-field mt-1"
              >
                {roleOptions.map((role) => (
                  <option key={role} value={role}>
                    {roleLabel(role)}
                  </option>
                ))}
              </select>
            </label>
            {roleNeedsDeviceApproval && !editingId && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 md:col-span-2">
                {t("employeeAccounts.deviceSignInNotice")}
              </div>
            )}
            <label className="flex items-start gap-3 rounded-xl bg-gray-50 px-4 py-3 text-sm md:col-span-2">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={form.isActive}
                onChange={(event) =>
                  setForm((current) => ({ ...current, isActive: event.target.checked }))
                }
              />
              <span>
                <span className="font-medium text-gray-700">{t("employeeAccounts.activeAccount")}</span>
                <span className="mt-0.5 block text-xs text-gray-500">
                  {t("employeeAccounts.activeAccountHint")}
                </span>
              </span>
            </label>
          </div>

          <label className="mt-4 block text-sm">
            <span className="font-medium text-gray-700">{t("employeeAccounts.assignedWork")}</span>
            <textarea
              value={form.assignedWork}
              onChange={(event) =>
                setForm((current) => ({ ...current, assignedWork: event.target.value }))
              }
              className="input-field mt-1 min-h-20"
              placeholder={t("employeeAccounts.assignedWorkPlaceholder")}
            />
          </label>

          <div className="mt-5">
            <h3 className="text-sm font-semibold text-gray-800">{t("employeeAccounts.branches")}</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {branches.map((branch) => (
                <label
                  key={branch.id}
                  className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-2 text-sm ${
                    form.branchIds.includes(branch.id)
                      ? "border-black bg-black text-white"
                      : "border-gray-200 bg-gray-50 text-gray-700"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={form.branchIds.includes(branch.id)}
                    onChange={() => toggleBranch(branch.id)}
                  />
                  {branch.name} ({branch.id})
                </label>
              ))}
            </div>
          </div>

          {showAccessPanel ? (
            <div className="mt-5">
              <h3 className="text-sm font-semibold text-gray-800">
                {t("employeeAccounts.sidebarAccess")}
              </h3>
              <p className="mt-1 text-xs text-gray-500">{t("employeeAccounts.sidebarAccessHint")}</p>
              <div className="mt-3 grid max-h-56 grid-cols-2 gap-2 overflow-auto pr-1 md:grid-cols-3">
                {dashboardSections.map((section) => (
                  <label
                    key={section.key}
                    className="flex items-center gap-2 rounded-xl bg-gray-50 p-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={form.allowedSections.includes(section.key)}
                      onChange={() => toggleSection(section.key)}
                    />
                    <span>{t(section.labelKey)}</span>
                  </label>
                ))}
              </div>
            </div>
          ) : (
            <p className="mt-5 rounded-2xl bg-gray-50 p-4 text-sm text-gray-600">
              {t("employeeAccounts.fullAccessRole")}
            </p>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" className="btn-primary" disabled={saving} onClick={handleSubmit}>
              {saving
                ? t("common.saving")
                : editingId
                  ? t("common.saveChanges")
                  : t("employeeAccounts.createAccount")}
            </button>
            {editingId && (
              <button type="button" className="btn-outline" onClick={resetForm}>
                {t("common.cancel")}
              </button>
            )}
          </div>
          {message && <p className="mt-3 text-sm font-medium text-magenta-600">{message}</p>}
          {error && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}
        </section>
      )}

      <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold text-black">{t("employeeAccounts.existingAccounts")}</h2>
        {loading ? (
          <p className="mt-4 text-sm text-gray-500">{t("common.loading")}</p>
        ) : (
          <div className="mt-4 space-y-3">
            {employees.map((employee) => (
              <article
                key={employee.id}
                className="rounded-2xl border border-gray-100 bg-gray-50 p-4 transition hover:border-gray-200"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold text-black">{employee.name}</h3>
                      <span className="rounded-full bg-black px-2.5 py-0.5 text-xs font-semibold text-white">
                        {roleLabel(employee.role)}
                      </span>
                      {!employee.isActive && (
                        <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">
                          {t("employeeAccounts.inactive")}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-gray-600">{employee.email}</p>
                    {employee.assignedWork && (
                      <p className="mt-2 text-sm text-gray-700">{employee.assignedWork}</p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      {(employee.allowedSections ?? dashboardSections.map((section) => section.key))
                        .slice(0, 8)
                        .map((sectionKey) => {
                          const section = dashboardSections.find((entry) => entry.key === sectionKey);
                          return (
                            <span
                              key={sectionKey}
                              className="rounded-full border border-gray-200 bg-white px-2 py-1 text-gray-600"
                            >
                              {section ? t(section.labelKey) : sectionKey}
                            </span>
                          );
                        })}
                      {employee.role === "ADMIN" || employee.role === "MANAGER" ? (
                        <span className="rounded-full border border-magenta-200 bg-magenta-50 px-2 py-1 text-magenta-700">
                          {t("employeeAccounts.fullAccessBadge")}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  {canEdit && employee.id !== currentUser?.id && (
                    <button type="button" className="btn-outline shrink-0" onClick={() => startEdit(employee)}>
                      {t("common.edit")}
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

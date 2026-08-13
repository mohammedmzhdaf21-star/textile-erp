import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import SignInApprovalsPanel from "../components/SignInApprovalsPanel";
import { getCurrentUser, logout } from "../lib/auth";

export default function Dashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = getCurrentUser();

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="card animate-fade-in">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-extrabold text-black">
              {t("dashboard.welcome", { name: user?.name })}
            </h1>
            <p className="mt-1 text-gray-500">{user?.email}</p>
          </div>
          <button onClick={handleLogout} className="btn-secondary">
            {t("common.signOut")}
          </button>
        </div>

        <SignInApprovalsPanel className="mb-8" />

        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-xl bg-gradient-to-br from-magenta-500 to-magenta-700 p-6 text-white shadow-lg">
            <p className="text-sm opacity-80">{t("common.role")}</p>
            <p className="mt-1 text-2xl font-bold">{user?.role}</p>
          </div>
          <div className="rounded-xl bg-black p-6 text-white shadow-lg">
            <p className="text-sm opacity-80">{t("common.status")}</p>
            <p className="mt-1 text-2xl font-bold">{t("common.active")}</p>
          </div>
          <div className="rounded-xl border-2 border-magenta-500 bg-white p-6 text-black">
            <p className="text-sm text-gray-500">{t("common.login")}</p>
            <p className="mt-1 text-2xl font-bold text-magenta-500">{t("common.success")}</p>
          </div>
        </div>

        <div className="mt-8 rounded-xl border border-gray-200 bg-gradient-to-br from-gray-50 to-white p-6">
          <h2 className="text-lg font-bold text-black">{t("dashboard.overviewTitle")}</h2>
          <p className="mt-2 text-gray-600">{t("dashboard.overviewDescription")}</p>
        </div>
      </div>
    </div>
  );
}

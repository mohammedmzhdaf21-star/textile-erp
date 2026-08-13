import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { login } from "../lib/auth";
import LanguageSwitcher from "../components/LanguageSwitcher";

export default function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const registrationPending = Boolean(
    (location.state as { registrationPending?: boolean } | null)?.registrationPending
  );
  const registeredEmail =
    (location.state as { email?: string } | null)?.email ?? "";

  const [email, setEmail] = useState(registeredEmail);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await login(email, password);
      navigate("/dashboard");
    } catch (err: any) {
      const msg =
        err?.response?.data?.error ||
        err?.message ||
        t("login.loginFailed");
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-white via-gray-50 to-magenta-50 p-4">
      <div className="absolute top-4 end-4">
        <LanguageSwitcher />
      </div>
      <div className="w-full max-w-md animate-slide-up">
        <div className="text-center mb-8">
          <div className="inline-block bg-black rounded-2xl p-4 mb-4 shadow-lg">
            <svg
              className="w-12 h-12 text-magenta-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
              />
            </svg>
          </div>
          <h1 className="text-4xl font-extrabold text-black tracking-tight">
            {t("login.title")} <span className="text-magenta-500">{t("login.titleAccent")}</span>
          </h1>
          <p className="text-gray-500 mt-2">{t("login.subtitle")}</p>
        </div>

        <div className="card animate-fade-in">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-semibold text-black mb-2"
              >
                {t("login.emailLabel")}
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("login.emailPlaceholder")}
                required
                disabled={loading}
                className="input-field"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-semibold text-black mb-2"
              >
                {t("login.passwordLabel")}
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("login.passwordPlaceholder")}
                required
                disabled={loading}
                className="input-field"
              />
            </div>

            {registrationPending && (
              <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded animate-fade-in">
                <p className="text-amber-800 text-sm font-medium">
                  {t("login.registrationPending")}
                </p>
              </div>
            )}

            {error && (
              <div className="bg-magenta-50 border-l-4 border-magenta-500 p-4 rounded animate-fade-in">
                <p className="text-magenta-700 text-sm font-medium">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg
                    className="animate-spin h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"
                    />
                  </svg>
                  {t("common.signingIn")}
                </>
              ) : (
                t("common.signIn")
              )}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-gray-100 text-center">
            <p className="text-sm text-gray-600">
              {t("login.newEmployee")}{" "}
              <button
                type="button"
                onClick={() => navigate("/register")}
                className="text-magenta-600 font-semibold hover:underline"
              >
                {t("register.title")}
              </button>
            </p>
          </div>

          <div className="mt-6 pt-6 border-t border-gray-100">
            <p className="text-xs text-gray-500 text-center mb-2 font-semibold">
              {t("login.demoCredentials")}
            </p>
            <div className="grid grid-cols-1 gap-2 text-xs">
              <div className="flex justify-between bg-gray-50 px-3 py-2 rounded">
                <span className="text-gray-600">{t("common.admin")}</span>
                <span className="text-black font-mono">admin@textile.com</span>
              </div>
              <div className="flex justify-between bg-gray-50 px-3 py-2 rounded">
                <span className="text-gray-600">{t("common.manager")}</span>
                <span className="text-black font-mono">manager@textile.com</span>
              </div>
              <div className="flex justify-between bg-gray-50 px-3 py-2 rounded">
                <span className="text-gray-600">{t("common.employeeRole")}</span>
                <span className="text-black font-mono">employee@textile.com</span>
              </div>
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          {t("common.copyright")}
        </p>
      </div>
    </div>
  );
}

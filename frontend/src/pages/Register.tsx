import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import LanguageSwitcher from "../components/LanguageSwitcher";
import { fetchPublicBranches, registerEmployee, type BranchOption } from "../lib/registrationApi";

export default function Register() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [branchId, setBranchId] = useState("");
  const [registrationNote, setRegistrationNote] = useState("");
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void fetchPublicBranches()
      .then(setBranches)
      .catch(() => setBranches([]));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (password !== confirmPassword) {
      setError(t("register.passwordMismatch"));
      return;
    }

    setLoading(true);
    try {
      const result = await registerEmployee({
        name,
        email,
        password,
        phone: phone || undefined,
        branchId: branchId || undefined,
        registrationNote: registrationNote || undefined,
      });
      setSuccess(result.message || t("register.successMessage"));
      setTimeout(
        () =>
          navigate("/login", {
            state: { email: email.trim() },
          }),
        1500
      );
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || t("register.failed"));
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
          <h1 className="text-3xl font-extrabold text-black tracking-tight">
            {t("register.title")}
          </h1>
          <p className="text-gray-500 mt-2">{t("register.subtitle")}</p>
        </div>

        <div className="card animate-fade-in">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-semibold text-black mb-2">
                {t("register.nameLabel")}
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                disabled={loading}
                className="input-field"
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-black mb-2">
                {t("login.emailLabel")}
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                className="input-field"
              />
            </div>

            <div>
              <label htmlFor="phone" className="block text-sm font-semibold text-black mb-2">
                {t("common.phone")}
              </label>
              <input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={loading}
                className="input-field"
              />
            </div>

            {branches.length > 0 && (
              <div>
                <label htmlFor="branch" className="block text-sm font-semibold text-black mb-2">
                  {t("register.branchLabel")}
                </label>
                <select
                  id="branch"
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value)}
                  disabled={loading}
                  className="input-field"
                >
                  <option value="">{t("register.branchOptional")}</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name} ({branch.id})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-black mb-2">
                {t("login.passwordLabel")}
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                disabled={loading}
                className="input-field"
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-semibold text-black mb-2">
                {t("register.confirmPasswordLabel")}
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                disabled={loading}
                className="input-field"
              />
            </div>

            <div>
              <label htmlFor="note" className="block text-sm font-semibold text-black mb-2">
                {t("register.noteLabel")}
              </label>
              <textarea
                id="note"
                value={registrationNote}
                onChange={(e) => setRegistrationNote(e.target.value)}
                rows={2}
                disabled={loading}
                className="input-field"
                placeholder={t("register.notePlaceholder")}
              />
            </div>

            {error && (
              <div className="bg-magenta-50 border-l-4 border-magenta-500 p-4 rounded">
                <p className="text-magenta-700 text-sm font-medium">{error}</p>
              </div>
            )}

            {success && (
              <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded">
                <p className="text-green-700 text-sm font-medium">{success}</p>
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? t("register.submitting") : t("register.submit")}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-500">
            {t("register.alreadyHaveAccount")}{" "}
            <Link to="/login" className="text-magenta-600 font-semibold hover:underline">
              {t("common.signIn")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

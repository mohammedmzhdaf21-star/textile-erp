import { useNavigate } from "react-router-dom";
import { getCurrentUser, logout } from "../lib/auth";

export default function Dashboard() {
  const navigate = useNavigate();
  const user = getCurrentUser();

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="card animate-fade-in">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-extrabold text-black">
                Welcome, <span className="text-magenta-500">{user?.name}</span>!
              </h1>
              <p className="text-gray-500 mt-1">{user?.email}</p>
            </div>
            <button onClick={handleLogout} className="btn-secondary">
              Sign Out
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
            <div className="bg-gradient-to-br from-magenta-500 to-magenta-700 text-white p-6 rounded-xl shadow-lg">
              <p className="text-sm opacity-80">Role</p>
              <p className="text-2xl font-bold mt-1">{user?.role}</p>
            </div>
            <div className="bg-black text-white p-6 rounded-xl shadow-lg">
              <p className="text-sm opacity-80">Status</p>
              <p className="text-2xl font-bold mt-1">Active</p>
            </div>
            <div className="bg-white border-2 border-magenta-500 text-black p-6 rounded-xl">
              <p className="text-sm text-gray-500">Login</p>
              <p className="text-2xl font-bold mt-1 text-magenta-500">Success!</p>
            </div>
          </div>

          <div className="mt-8 p-6 bg-gradient-to-br from-gray-50 to-white border border-gray-200 rounded-xl">
            <h2 className="text-lg font-bold text-black mb-2">
              You are logged in!
            </h2>
            <p className="text-gray-600">
              Authentication is working. The real dashboard with inventory, sales,
              and reports is coming soon!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

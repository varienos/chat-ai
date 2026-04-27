import { NavLink } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

const navItems = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/sessions", label: "Oturumlar" },
  { to: "/settings", label: "Ayarlar" },
  { to: "/chat", label: "Test Chat" },
  { to: "/api-docs", label: "API Docs" },
];

export default function TopNav() {
  const { user, logout } = useAuth();

  return (
    <nav className="bg-gray-900 text-white">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-14">
          <div className="flex items-center gap-6">
            <span className="text-lg font-bold tracking-tight">Deck</span>
            <div className="flex items-center gap-1">
              {navItems.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      isActive ? "bg-gray-700 text-white" : "text-gray-300 hover:bg-gray-800 hover:text-white"
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-400">{user}</span>
            <button
              onClick={logout}
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              Cikis
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}

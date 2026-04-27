import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./AuthContext";
import DefaultLayout from "../layout/DefaultLayout";

export default function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-screen"><p>Loading...</p></div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <DefaultLayout>
      <Outlet />
    </DefaultLayout>
  );
}

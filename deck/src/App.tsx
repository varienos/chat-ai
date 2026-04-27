import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./auth/AuthContext";
import ProtectedRoute from "./auth/ProtectedRoute";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import SessionsPage from "./pages/SessionsPage";
import SessionDetailPage from "./pages/SessionDetailPage";
import SettingsPage from "./pages/SettingsPage";
import ChatPage from "./pages/ChatPage";
import ApiDocsPage from "./pages/ApiDocsPage";
import KnowledgeBasePage from "./pages/KnowledgeBasePage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 3, staleTime: 30_000 },
  },
});

export default function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter basename="/deck">
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/sessions" element={<SessionsPage />} />
              <Route path="/sessions/:id" element={<SessionDetailPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/chat" element={<ChatPage />} />
              <Route path="/api-docs" element={<ApiDocsPage />} />
              <Route path="/knowledge" element={<KnowledgeBasePage />} />
              <Route path="/" element={<Navigate to="/dashboard" />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </AuthProvider>
  );
}

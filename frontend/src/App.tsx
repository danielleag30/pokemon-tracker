import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { ForgotPin } from './pages/ForgotPin';
import { ResetPin } from './pages/ResetPin';
import { PrivacyPolicy } from './pages/PrivacyPolicy';
import { Dashboard } from './pages/Dashboard';
import { ByRegion } from './pages/ByRegion';
import { ByStarter } from './pages/ByStarter';
import { ByType } from './pages/ByType';
import { ByEvolutionStage } from './pages/ByEvolutionStage';
import { BySet } from './pages/BySet';
import { MissingCards } from './pages/MissingCards';
import { Duplicates } from './pages/Duplicates';
import { MyCards } from './pages/MyCards';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      refetchOnWindowFocus: true,
      staleTime: 30_000,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* Public auth routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-pin" element={<ForgotPin />} />
            <Route path="/reset-pin" element={<ResetPin />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />

            {/* Protected app routes */}
            <Route
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="region" element={<ByRegion />} />
              <Route path="region/:regionId" element={<ByRegion />} />
              <Route path="starters" element={<ByStarter />} />
              <Route path="type" element={<ByType />} />
              <Route path="evolution" element={<ByEvolutionStage />} />
              <Route path="sets" element={<BySet />} />
              <Route path="my-cards" element={<MyCards />} />
              <Route path="missing" element={<MissingCards />} />
              <Route path="duplicates" element={<Duplicates />} />
            </Route>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

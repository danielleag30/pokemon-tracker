import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './contexts/AuthContext';
import { ConfirmProvider } from './contexts/ConfirmContext';
import { setStatusBarText } from './lib/native';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { ForgotPin } from './pages/ForgotPin';
import { ResetPin } from './pages/ResetPin';
import { PrivacyPolicy } from './pages/PrivacyPolicy';
import { Dashboard } from './pages/Dashboard';
import { BySeries } from './pages/BySeries';
import { ByStarter } from './pages/ByStarter';
import { ByType } from './pages/ByType';
import { ByEvolutionStage } from './pages/ByEvolutionStage';
import { BySet } from './pages/BySet';
import { MissingCards } from './pages/MissingCards';
import { Duplicates } from './pages/Duplicates';
import { MyCards } from './pages/MyCards';
import { Pokedex } from './pages/Pokedex';
import { Admin } from './pages/Admin';
import { Me } from './pages/Me';
import { SectionTabs } from './components/SectionTabs';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      refetchOnWindowFocus: true,
      staleTime: 30_000,
    },
  },
});

// Pages whose top edge is light, so the clock and battery need dark text.
// Every other screen has the navy bar or the blue sign-in background up top.
const LIGHT_TOP_PAGES = ['/privacy'];

function StatusBarSync() {
  const { pathname } = useLocation();
  useEffect(() => {
    setStatusBarText(LIGHT_TOP_PAGES.includes(pathname) ? 'dark' : 'light');
  }, [pathname]);
  return null;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <StatusBarSync />
        <AuthProvider>
          <ConfirmProvider>
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

              {/* Browse tab: every "By ___" view plus the Pokédex. URLs are
                  unchanged; SectionTabs adds the pill row on phones. */}
              <Route element={<SectionTabs section="browse" />}>
                <Route path="sets" element={<BySet />} />
                <Route path="series" element={<BySeries />} />
                <Route path="series/:seriesSlug" element={<BySeries />} />
                <Route path="starters" element={<ByStarter />} />
                <Route path="type" element={<ByType />} />
                <Route path="evolution" element={<ByEvolutionStage />} />
                <Route path="pokedex" element={<Pokedex />} />
              </Route>
              <Route path="browse" element={<Navigate to="/sets" replace />} />

              {/* My Cards tab: the collection, Duplicates and Missing. */}
              <Route element={<SectionTabs section="collection" />}>
                <Route path="my-cards" element={<MyCards />} />
                <Route path="duplicates" element={<Duplicates />} />
                <Route path="missing" element={<MissingCards />} />
              </Route>

              <Route path="me" element={<Me />} />
              <Route path="admin" element={<Admin />} />
            </Route>
          </Routes>
          </ConfirmProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

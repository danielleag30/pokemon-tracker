import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { ByRegion } from './pages/ByRegion';
import { ByStarter } from './pages/ByStarter';
import { ByType } from './pages/ByType';
import { ByEvolutionStage } from './pages/ByEvolutionStage';
import { BySet } from './pages/BySet';
import { MissingCards } from './pages/MissingCards';
import { Duplicates } from './pages/Duplicates';

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
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="region" element={<ByRegion />} />
            <Route path="region/:regionId" element={<ByRegion />} />
            <Route path="starters" element={<ByStarter />} />
            <Route path="type" element={<ByType />} />
            <Route path="evolution" element={<ByEvolutionStage />} />
            <Route path="sets" element={<BySet />} />
            <Route path="missing" element={<MissingCards />} />
            <Route path="duplicates" element={<Duplicates />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

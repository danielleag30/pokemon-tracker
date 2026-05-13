import { useLocation } from 'react-router-dom';
import { Outlet } from 'react-router-dom';
import { NavBar } from './NavBar';
import { ChatModal } from './ChatModal';

export function Layout() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);

  const pageContext = {
    page: location.pathname,
    setId: params.get('set') ?? undefined,
    regionId: params.get('region') ?? undefined,
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <NavBar />
      <main className="flex-1 min-w-0 pt-14 lg:pt-0 overflow-x-hidden">
        <div className="max-w-7xl mx-auto p-4 lg:p-6">
          <Outlet />
        </div>
      </main>
      <ChatModal pageContext={pageContext} />
    </div>
  );
}

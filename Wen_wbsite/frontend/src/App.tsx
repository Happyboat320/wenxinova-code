import { Routes, Route } from "react-router-dom";
import { lazy, Suspense, useEffect, useState } from "react";
import { AuthContext } from '@/contexts/authContext';
import { Toaster } from 'sonner';
import type { User } from '@/api';
import * as api from '@/api';
import AuthModal from '@/components/AuthModal';

const Home = lazy(() => import('@/pages/Home'));
const LibraryPage = lazy(() => import('@/pages/LibraryPage'));
const BookViewPage = lazy(() => import('@/pages/BookViewPage'));
const AdaptPage = lazy(() => import('@/pages/AdaptPage'));
const UGCCommunityPage = lazy(() => import('@/pages/UGCCommunityPage'));
const DigitalCoPlayPage = lazy(() => import('@/pages/DigitalCoPlayPage'));
const MyCollectionPage = lazy(() => import('@/pages/MyCollectionPage'));
const ProfilePage = lazy(() => import('@/pages/ProfilePage'));
const AdminPage = lazy(() => import('@/pages/AdminPage'));

const PageFallback = () => (
  <div className="flex min-h-screen items-center justify-center bg-[#f7f0df] text-amber-900" role="status">
    页面加载中…
  </div>
);

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [loginOpen, setLoginOpen] = useState(false);

  useEffect(() => {
    api.onAuthFailure(() => setUser(null));
    const restoreSession = async () => {
      try {
        await api.refreshAuth();
        setUser(await api.getCurrentUser());
      } catch {
        api.setAccessToken(null);
        setUser(null);
      } finally {
        setIsInitializing(false);
      }
    };
    void restoreSession();
    return () => api.onAuthFailure(null);
  }, []);

  const logout = async () => {
    await api.logout();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{ isAuthenticated: Boolean(user), isInitializing, user, openLogin: () => setLoginOpen(true), updateUser: setUser, logout }}
    >
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/classical-library" element={<LibraryPage />} />
          <Route path="/book/:id" element={<BookViewPage />} />
          <Route path="/classical-library/:id/adapt" element={<AdaptPage />} />
          <Route path="/classical-library/:id/style-adapt" element={<AdaptPage />} />
          <Route path="/classical-library/:id/script" element={<AdaptPage />} />
          <Route path="/classical-library/:id/ai-adapt" element={<AdaptPage />} />
          <Route path="/ugc-community" element={<UGCCommunityPage />} />
          <Route path="/digital-coplay" element={<DigitalCoPlayPage />} />
          <Route path="/my-collection" element={<MyCollectionPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
      </Suspense>
      <Toaster />
      <AuthModal
        open={loginOpen}
        onClose={() => setLoginOpen(false)}
        onAuthenticated={session => setUser(session.user)}
      />
    </AuthContext.Provider>
  );
}

export default App;

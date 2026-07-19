import { Routes, Route } from "react-router-dom";
import Home from "@/pages/Home";
import LibraryPage from "@/pages/LibraryPage";
import BookViewPage from "@/pages/BookViewPage";
import UGCCommunityPage from "@/pages/UGCCommunityPage";
import MyCollectionPage from "@/pages/MyCollectionPage";
import AdaptPage from "@/pages/AdaptPage";
import { useEffect, useState } from "react";
import { AuthContext } from '@/contexts/authContext';
import { Toaster } from 'sonner';
import type { User } from '@/api';
import * as api from '@/api';
import SmsLoginModal from '@/components/SmsLoginModal';

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
      value={{ isAuthenticated: Boolean(user), isInitializing, user, openLogin: () => setLoginOpen(true), logout }}
    >
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/classical-library" element={<LibraryPage />} />
        <Route path="/book/:id" element={<BookViewPage />} />
        <Route path="/classical-library/:id/adapt" element={<AdaptPage />} />
        <Route path="/classical-library/:id/style-adapt" element={<AdaptPage />} />
        <Route path="/classical-library/:id/script" element={<AdaptPage />} />
        <Route path="/classical-library/:id/ai-adapt" element={<AdaptPage />} />
        <Route path="/ugc-community" element={<UGCCommunityPage />} />
        <Route path="/my-collection" element={<MyCollectionPage />} />
      </Routes>
      <Toaster />
      <SmsLoginModal
        open={loginOpen}
        onClose={() => setLoginOpen(false)}
        onAuthenticated={session => setUser(session.user)}
      />
    </AuthContext.Provider>
  );
}

export default App;

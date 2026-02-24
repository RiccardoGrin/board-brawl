import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import { Loader2 } from 'lucide-react';
import App from './App.tsx';
import Landing from './pages/Landing.tsx';
import NewTournament from './pages/NewTournament.tsx';
import TournamentDashboard from './pages/TournamentDashboard.tsx';
import AddGame from './pages/AddGame.tsx';
import Library from './pages/Library.tsx';
import PublicLibrary from './pages/PublicLibrary.tsx';
import UserProfile from './pages/UserProfile.tsx';
import GameDetail from './pages/GameDetail.tsx';
import { ProtectedRoute } from './components/ProtectedRoute.tsx';
import { useAuthSync } from './hooks/useAuthSync.ts';
import { useLibrarySync } from './hooks/useLibrarySync.ts';
import { useStatsSync } from './hooks/useStatsSync.ts';
import { useAuthStore } from './store/authStore.ts';
import { BackgroundOrnaments } from './components/BackgroundOrnaments.tsx';
import { SkipLink } from './components/SkipLink.tsx';
import { SyncStatusBar } from './components/SyncStatusBar.tsx';
import { NotificationBar } from './components/NotificationBar.tsx';
import './index.css';

registerSW({ immediate: true });

function AuthSyncGate() {
  useAuthSync();
  return null;
}

function LibrarySyncGate() {
  useLibrarySync();
  return null;
}

function StatsSyncGate() {
  useStatsSync();
  return null;
}

/**
 * Root component that shows Landing for guests and App for authenticated users.
 */
function AuthenticatedHome() {
  const user = useAuthStore((state) => state.user);
  const initialized = useAuthStore((state) => state.initialized);

  if (!initialized) {
    return (
      <div className="min-h-screen page-frame flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-gold mx-auto mb-4 animate-spin" />
          <p className="text-muted">Loading...</p>
        </div>
      </div>
    );
  }

  return user ? <App /> : <Landing />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthSyncGate />
      <LibrarySyncGate />
      <StatsSyncGate />
      <SkipLink />
      <BackgroundOrnaments />
      <SyncStatusBar />
      <NotificationBar />
      <Routes>
        {/* Root: Landing for guests, Dashboard for authenticated */}
        <Route path="/" element={<AuthenticatedHome />} />

        {/* Protected routes */}
        <Route path="/tournaments" element={<ProtectedRoute><App /></ProtectedRoute>} />
        <Route path="/library" element={<ProtectedRoute><App /></ProtectedRoute>} />
        <Route path="/library/:libraryId" element={<ProtectedRoute><Library /></ProtectedRoute>} />
        <Route path="/plays" element={<ProtectedRoute><App /></ProtectedRoute>} />
        <Route path="/new" element={<ProtectedRoute><NewTournament /></ProtectedRoute>} />
        <Route path="/tournament/:tournamentId" element={<ProtectedRoute><TournamentDashboard /></ProtectedRoute>} />
        <Route path="/add-game" element={<ProtectedRoute><AddGame /></ProtectedRoute>} />
        <Route path="/edit-game/:sessionId" element={<ProtectedRoute><AddGame /></ProtectedRoute>} />

        {/* Public routes (these handle auth internally) */}
        <Route path="/u/:usercode" element={<UserProfile />} />
        <Route path="/u/:usercode/library/:libraryId" element={<PublicLibrary />} />
        <Route path="/games/:gameId" element={<GameDetail />} />

        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);

import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

/**
 * Route guard that redirects unauthenticated users to the landing page.
 * Shows a loading spinner while auth state initializes.
 */
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const user = useAuthStore((state) => state.user);
  const initialized = useAuthStore((state) => state.initialized);

  if (!initialized) {
    // Show loading spinner while auth initializes
    return (
      <div className="min-h-screen page-frame flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-gold mx-auto mb-4 animate-spin" />
          <p className="text-muted">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    // Redirect to landing page
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

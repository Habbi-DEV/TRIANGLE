import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-brand-500 border-t-transparent" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

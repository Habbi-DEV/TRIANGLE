import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, role, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-brand-500 border-t-transparent" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;

  // New accounts (any signup method, including Google) start as 'pending'
  // and have no staff access until an admin promotes them — show a clear
  // message instead of a dashboard that silently fails every API call.
  if (role === 'pending') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-6 text-center">
        <div className="max-w-sm">
          <p className="font-display text-xl font-bold text-white">Compte en attente d'approbation</p>
          <p className="mt-2 text-sm text-zinc-400">
            Votre compte a bien été créé, mais un administrateur doit vous attribuer
            un rôle avant que vous puissiez accéder à cette interface.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

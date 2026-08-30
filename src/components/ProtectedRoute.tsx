import { Navigate } from 'react-router-dom';
import { useAuth, type StaffRole } from '../contexts/AuthContext';

interface Props {
  children: React.ReactNode;
  /** Restrict to specific staff roles (e.g. the Driver Dashboard). Admins
   *  always pass, so support can access any staff-only screen. Omit to
   *  allow any authenticated staff role, same as before. */
  allowedRoles?: StaffRole[];
}

export default function ProtectedRoute({ children, allowedRoles }: Props) {
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

  if (allowedRoles && role !== 'admin' && !allowedRoles.includes(role)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-6 text-center">
        <div className="max-w-sm">
          <p className="font-display text-xl font-bold text-white">Accès réservé</p>
          <p className="mt-2 text-sm text-zinc-400">
            Cette interface n'est pas disponible pour votre rôle.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

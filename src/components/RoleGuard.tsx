import { Navigate } from 'react-router-dom';
import { useAuth, type StaffRole } from '../contexts/AuthContext';

interface Props {
  allowedRoles: StaffRole[];
  children: React.ReactNode;
}

/** Inline guard for a single admin child page — shows a clear 403 instead of
 *  rendering the page to a user who shouldn't land there via a direct URL. */
export default function RoleGuard({ allowedRoles, children }: Props) {
  const { role, loading } = useAuth();
  if (loading) return null;
  if (!role || role === 'pending') return <Navigate to="/login" replace />;
  if (!allowedRoles.includes(role)) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-8 text-center">
        <div className="max-w-sm">
          <p className="text-3xl">🔒</p>
          <p className="mt-3 font-display text-lg font-bold text-zinc-900">Accès réservé</p>
          <p className="mt-1 text-sm text-zinc-500">
            Cette page est réservée aux rôles : {allowedRoles.join(', ')}.
            Votre rôle actuel : {role}.
          </p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

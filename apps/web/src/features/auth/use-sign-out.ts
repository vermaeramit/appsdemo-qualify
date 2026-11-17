import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import { authClient } from '@/lib/auth-client';

export function useSignOut(): () => Promise<void> {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return async () => {
    const { error } = await authClient.signOut();
    if (error) {
      toast.error('Could not sign out. Please try again.');
      return;
    }
    queryClient.clear(); // drop every cached response of the previous user
    await navigate({ to: '/login' });
  };
}

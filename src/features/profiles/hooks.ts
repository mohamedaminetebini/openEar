import { useQuery } from '@tanstack/react-query';
import { database, profiles } from '@/lib/db/database';

export function useProfiles() {
  return useQuery({ queryKey: ['profiles'], queryFn: () => profiles.list(), staleTime: 0 });
}
export function usePreferredProfile() {
  return useQuery({
    queryKey: ['preferred-profile'],
    queryFn: async () => {
      const value = (await database.settings.get('preferredProfile'))?.value;
      return typeof value === 'string' ? value : null;
    },
  });
}

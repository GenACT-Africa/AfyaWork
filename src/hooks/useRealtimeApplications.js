import { useEffect } from 'react';
import { supabase } from '../lib/supabase';

export function useRealtimeApplications(coId, onUpdate) {
  useEffect(() => {
    if (!coId) return;
    const channel = supabase
      .channel(`co-${coId}-applications`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'applications', filter: `co_id=eq.${coId}` },
        onUpdate
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [coId, onUpdate]);
}

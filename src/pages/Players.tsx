import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search } from 'lucide-react';

const Players = () => {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');

  const { data: players, isLoading } = useQuery({
    queryKey: ['public-players'],
    queryFn: async () => {
      const { data } = await supabase
        .from('players')
        .select('id, name, license, club, current_handicap, gender, is_senior')
        .order('name');
      return data || [];
    },
  });

  const { data: resultCounts } = useQuery({
    queryKey: ['public-player-result-counts'],
    queryFn: async () => {
      const { data } = await supabase
        .from('results')
        .select('player_id, stableford_points, rounds!inner(status)')
        .eq('rounds.status', 'published')
        .not('stableford_points', 'is', null);
      
      const counts = new Map<string, { rounds: number; bestScore: number; totalPoints: number }>();
      for (const r of (data || [])) {
        const pid = r.player_id;
        const existing = counts.get(pid) || { rounds: 0, bestScore: 0, totalPoints: 0 };
        existing.rounds++;
        existing.bestScore = Math.max(existing.bestScore, r.stableford_points || 0);
        existing.totalPoints += r.stableford_points || 0;
        counts.set(pid, existing);
      }
      return counts;
    },
  });

  const filtered = players?.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.license?.toLowerCase().includes(search.toLowerCase()) ||
    p.club?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="container py-8 lg:py-12 animate-fade-in">
      <h1 className="font-display text-3xl font-bold mb-2">{t('players.title')}</h1>
      <p className="text-muted-foreground mb-6">{t('common.season')} 2026 — {players?.length || 0} jugadors</p>

      <div className="relative mb-6 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('common.search') + '...'}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">{t('common.loading')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40 text-muted-foreground">
                <th className="text-left py-2.5">{t('common.name')}</th>
                <th className="text-left py-2.5 px-2">{t('common.club')}</th>
                <th className="text-right py-2.5 px-2">{t('common.handicap')}</th>
                <th className="text-right py-2.5 px-2">Jornades</th>
                <th className="text-right py-2.5 px-2">Millor</th>
                <th className="text-right py-2.5">Mitjana</th>
              </tr>
            </thead>
            <tbody>
              {filtered?.map((p) => {
                const stats = resultCounts?.get(p.id);
                const avg = stats ? Math.round(stats.totalPoints / stats.rounds * 10) / 10 : null;
                return (
                  <tr key={p.id} className="border-b border-border/20 last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="py-2 font-medium">
                      <Link to={`/jugadors/${p.id}`} className="hover:text-primary transition-colors">
                        {p.name}
                      </Link>
                      {p.gender === 'F' && <Badge variant="outline" className="ml-1.5 text-[10px] px-1.5 py-0">F</Badge>}
                      {p.is_senior && <Badge variant="outline" className="ml-1 text-[10px] px-1.5 py-0">SR</Badge>}
                    </td>
                    <td className="py-2 px-2 text-muted-foreground">{p.club || '—'}</td>
                    <td className="py-2 px-2 text-right font-mono">{p.current_handicap ?? '—'}</td>
                    <td className="py-2 px-2 text-right font-mono">{stats?.rounds || 0}</td>
                    <td className="py-2 px-2 text-right font-mono font-bold text-primary">{stats?.bestScore || '—'}</td>
                    <td className="py-2 text-right font-mono text-muted-foreground">{avg ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Players;

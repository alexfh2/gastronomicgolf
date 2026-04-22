import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import PlayerProfileDialog from '@/components/PlayerProfileDialog';
import { useCategoryRankings, buildPlayerRankPositions, type CategoryKey } from '@/hooks/useCategoryRankings';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { fetchPublicCircuitData, publicCircuitDataQueryKey } from '@/lib/publicCircuitData';
import {
  Search,
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart3,
  Trophy,
  Users,
} from 'lucide-react';

type Player = {
  id: string;
  name: string;
  license: string | null;
  club: string | null;
  current_handicap: number | null;
  gender: string | null;
  is_senior: boolean;
  photo_url: string | null;
  updated_at: string;
};

type ResultRow = {
  player_id: string;
  stableford_points: number | null;
  scratch_score: number | null;
  rounds: { date: string; status: string } | null;
};

type PlayerStats = {
  rounds: number;
  bestStableford: number;
  bestScratch: number;
  avgScratch: number;
  avgStableford: number;
  stdev: number;
  trend: 'up' | 'down' | 'stable';
  prob: number;
  scratchScores: number[];
  stbScores: number[];
};

const initials = (name: string) =>
  name.split(/[\s,]+/).filter(Boolean).slice(0, 2).map((n) => n[0]).join('').toUpperCase();

const formatHcp = (h: number | null) => {
  if (h === null || h === undefined) return '—';
  if (h < 0) return `+${Math.abs(h).toFixed(1)}`;
  return h.toFixed(1);
};

const nameSortKey = (name: string) => {
  if (name.includes(',')) return name.split(',')[0].trim().toLowerCase();
  return name.trim().toLowerCase();
};

const RANK_LABELS: Record<CategoryKey, string> = {
  hcpInf: 'HcpInf',
  hcpSup: 'HcpSup',
  female: 'Fem',
  senior: 'Sr',
};

const Players = () => {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<string>('name');
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  const { data: players, isLoading } = useQuery({
    queryKey: publicCircuitDataQueryKey,
    queryFn: fetchPublicCircuitData,
    select: (data) => data.players as Player[],
  });

  const { data: results } = useQuery({
    queryKey: ['public-players-results'],
    queryFn: async () => {
      const { data } = await supabase
        .from('results')
        .select('player_id, stableford_points, scratch_score, rounds!inner(date, status)')
        .eq('rounds.status', 'published');
      return (data || []) as unknown as ResultRow[];
    },
  });

  const statsByPlayer = useMemo(() => {
    const map = new Map<string, PlayerStats>();
    if (!results) return map;
    const grouped = new Map<string, ResultRow[]>();
    for (const r of results) {
      if (!grouped.has(r.player_id)) grouped.set(r.player_id, []);
      grouped.get(r.player_id)!.push(r);
    }
    for (const [pid, rows] of grouped.entries()) {
      const sorted = [...rows].sort((a, b) => (a.rounds?.date ?? '').localeCompare(b.rounds?.date ?? ''));
      const scratchScores = sorted.map((r) => r.scratch_score).filter((v): v is number => v !== null && v !== undefined);
      const stbScores = sorted.map((r) => r.stableford_points).filter((v): v is number => v !== null && v !== undefined);
      if (scratchScores.length === 0 && stbScores.length === 0) continue;
      const avgScratch = scratchScores.length ? scratchScores.reduce((a, b) => a + b, 0) / scratchScores.length : 0;
      const avgStb = stbScores.length ? stbScores.reduce((a, b) => a + b, 0) / stbScores.length : 0;
      const bestScratch = scratchScores.length ? Math.min(...scratchScores) : 0;
      const bestStb = stbScores.length ? Math.max(...stbScores) : 0;
      const variance = scratchScores.length > 1 ? scratchScores.reduce((sum, v) => sum + Math.pow(v - avgScratch, 2), 0) / scratchScores.length : 0;
      const stdev = Math.sqrt(variance);
      let trend: 'up' | 'down' | 'stable' = 'stable';
      if (scratchScores.length >= 3) {
        const recent = scratchScores.slice(-2);
        const earlier = scratchScores.slice(0, -2);
        if (earlier.length > 0) {
          const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
          const earlierAvg = earlier.reduce((a, b) => a + b, 0) / earlier.length;
          const diff = recentAvg - earlierAvg;
          if (diff < -1.5) trend = 'up';
          else if (diff > 1.5) trend = 'down';
        }
      }
      map.set(pid, { rounds: sorted.length, bestStableford: bestStb, bestScratch, avgScratch: Math.round(avgScratch * 10) / 10, avgStableford: Math.round(avgStb * 10) / 10, stdev: Math.round(stdev * 10) / 10, trend, prob: 0, scratchScores, stbScores });
    }
    return map;
  }, [results]);

  const categoryRankings = useCategoryRankings();
  const rankPositions = useMemo(() => buildPlayerRankPositions(categoryRankings), [categoryRankings]);

  const enriched = useMemo(() => {
    if (!players) return [];
    return players.map((p) => ({ player: p, stats: statsByPlayer.get(p.id), ranks: rankPositions.get(p.id) || {} }));
  }, [players, statsByPlayer, rankPositions]);

  const filterCategories = [
    { key: 'low', label: 'HCP Baix (≤15)' },
    { key: 'high', label: 'HCP Alt (>15)' },
    { key: 'female', label: t('categories.female') },
    { key: 'senior', label: t('categories.senior') },
  ];

  const sortOptions = [
    { key: 'hcp', label: 'Per rànquing' },
    { key: 'name', label: 'Per nom' },
    { key: 'handicap', label: 'Per hàndicap' },
  ];

  const filtered = useMemo(() => {
    let list = enriched.filter((e) => {
      const p = e.player;
      const q = search.toLowerCase();
      if (q && !(p.name.toLowerCase().includes(q) || p.license?.toLowerCase().includes(q) || p.club?.toLowerCase().includes(q))) return false;
      if (activeFilter) {
        const hcp = p.current_handicap;
        if (activeFilter === 'low' && !(hcp !== null && hcp !== undefined && hcp <= 15)) return false;
        if (activeFilter === 'high' && !(hcp !== null && hcp !== undefined && hcp > 15)) return false;
        if (activeFilter === 'female' && p.gender !== 'F') return false;
        if (activeFilter === 'senior' && !p.is_senior) return false;
      }
      return true;
    });
    list.sort((a, b) => {
      if (sortBy === 'hcp') {
        const bestPos = (e: typeof a) => {
          const positions = Object.values(e.ranks).filter((v): v is number => typeof v === 'number');
          return positions.length ? Math.min(...positions) : 9999;
        };
        return bestPos(a) - bestPos(b);
      }
      if (sortBy === 'name') return nameSortKey(a.player.name).localeCompare(nameSortKey(b.player.name));
      if (sortBy === 'handicap') return (a.player.current_handicap ?? 99) - (b.player.current_handicap ?? 99);
      return 0;
    });
    return list;
  }, [enriched, search, activeFilter, sortBy]);

  return (
    <div className="animate-fade-in">
      <section className="container pt-6 pb-4">
        <div className="flex items-center gap-3 mb-1">
          <Users className="h-5 w-5 text-accent/70" strokeWidth={1.5} />
          <h1 className="font-display text-2xl font-semibold text-foreground">{t('players.title')}</h1>
        </div>
        <p className="text-[11px] font-body text-muted-foreground tracking-wide mb-6">
          {players?.length || 0} jugadors registrats — {t('common.season')} 2026
        </p>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cercar jugador..."
            className="pl-9 bg-card/30 border-border/50 font-body text-sm"
          />
        </div>

        {/* Filter & Sort pills */}
        <div className="flex items-center gap-4 mb-3">
          <div className="h-px flex-1 bg-border/60" />
          <span className="font-body text-[10px] font-medium tracking-[0.3em] uppercase text-muted-foreground">Categories</span>
          <div className="h-px flex-1 bg-border/60" />
        </div>
        <div className="flex flex-wrap gap-2 mb-4">
          {filterCategories.map((cat) => (
            <button
              key={cat.key}
              onClick={() => setActiveFilter(activeFilter === cat.key ? null : cat.key)}
              className={`px-4 py-2 text-[11px] font-body font-medium tracking-[0.15em] uppercase transition-all duration-300 border ${
                activeFilter === cat.key
                  ? 'border-accent/40 bg-accent/10 text-accent'
                  : 'border-border/50 bg-card/30 text-muted-foreground hover:border-accent/20 hover:text-foreground'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-4 mb-3">
          <div className="h-px flex-1 bg-border/60" />
          <span className="font-body text-[10px] font-medium tracking-[0.3em] uppercase text-muted-foreground">Ordenar</span>
          <div className="h-px flex-1 bg-border/60" />
        </div>
        <div className="flex flex-wrap gap-2 mb-6">
          {sortOptions.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setSortBy(opt.key)}
              className={`px-4 py-2 text-[11px] font-body font-medium tracking-[0.15em] uppercase transition-all duration-300 border ${
                sortBy === opt.key
                  ? 'border-accent/40 bg-accent/10 text-accent'
                  : 'border-border/50 bg-card/30 text-muted-foreground hover:border-accent/20 hover:text-foreground'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </section>

      <section className="container pb-14">
        {isLoading ? (
          <p className="text-muted-foreground text-sm py-8 text-center">{t('common.loading')}</p>
        ) : (
          <>
            <p className="text-[11px] font-body text-muted-foreground tracking-wide mb-3">{filtered.length} jugadors</p>
            <div className="border border-border/50 bg-card/30">
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-separate border-spacing-0">
                  <thead>
                    <tr className="text-[10px] text-muted-foreground/70 font-body font-medium tracking-[0.15em] uppercase">
                      <th className="text-left py-3 pl-5 border-b border-border/30">{t('common.name')}</th>
                      <th className="text-center py-3 px-2 border-b border-border/30">Hdcp</th>
                      <th className="text-center py-3 px-2 border-b border-border/30">Rànquing</th>
                      <th className="text-center py-3 px-2 border-b border-border/30">Proves</th>
                      <th className="text-center py-3 px-2 border-b border-border/30">Ø Stb</th>
                      <th className="text-center py-3 px-2 border-b border-border/30">Millor</th>
                      <th className="text-center py-3 pr-5 border-b border-border/30">Tendència</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(({ player: p, stats, ranks }) => {
                      const rankBadges = (Object.keys(ranks) as CategoryKey[])
                        .map((k) => ({ key: k, pos: ranks[k]! }))
                        .filter((r) => r.pos)
                        .sort((a, b) => a.pos - b.pos);

                      return (
                        <tr key={p.id} className="border-b border-border/20 last:border-0 hover:bg-muted/20 transition-colors">
                          <td className="py-3 pl-5">
                            <button
                              type="button"
                              onClick={() => setSelectedPlayerId(p.id)}
                              className="flex items-center gap-2.5 hover:text-accent transition-colors text-left"
                            >
                              <Avatar className="h-7 w-7 border border-border/30">
                                {p.photo_url && <AvatarImage src={p.photo_url} alt={p.name} />}
                                <AvatarFallback className="bg-muted/40 text-[9px] font-body font-semibold">{initials(p.name)}</AvatarFallback>
                              </Avatar>
                              <span className="text-sm font-body font-medium text-foreground">{p.name}</span>
                            </button>
                          </td>
                          <td className="py-3 px-2 text-center font-mono text-xs text-muted-foreground">{formatHcp(p.current_handicap)}</td>
                          <td className="py-3 px-2 text-center">
                            <div className="flex flex-wrap gap-1 justify-center">
                              {rankBadges.length > 0 ? rankBadges.map((r) => (
                                <span key={r.key} className="text-[9px] font-mono text-accent/80">#{r.pos} {RANK_LABELS[r.key]}</span>
                              )) : <span className="text-muted-foreground/30 text-xs">—</span>}
                            </div>
                          </td>
                          <td className="py-3 px-2 text-center font-mono text-xs text-muted-foreground">{stats?.rounds ?? 0}</td>
                          <td className="py-3 px-2 text-center font-mono text-xs text-foreground">{stats?.avgStableford ?? '—'}</td>
                          <td className="py-3 px-2 text-center font-mono text-xs font-bold text-foreground">{stats?.bestStableford || '—'}</td>
                          <td className="py-3 pr-5 text-center">
                            {stats?.trend === 'up' && <TrendingUp className="h-3.5 w-3.5 text-accent inline-block" />}
                            {stats?.trend === 'down' && <TrendingDown className="h-3.5 w-3.5 text-destructive inline-block" />}
                            {(!stats || stats.trend === 'stable') && <Minus className="h-3.5 w-3.5 text-muted-foreground/40 inline-block" />}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </section>

      <PlayerProfileDialog
        playerId={selectedPlayerId}
        open={!!selectedPlayerId}
        onOpenChange={(o) => !o && setSelectedPlayerId(null)}
      />
    </div>
  );
};

export default Players;

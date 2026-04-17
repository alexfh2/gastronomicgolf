import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Search,
  Award,
  Target,
  Flame,
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
  name
    .split(/[\s,]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase();

const formatHcp = (h: number | null) => {
  if (h === null || h === undefined) return '—';
  if (h < 0) return `+${Math.abs(h).toFixed(1)}`;
  return h.toFixed(1);
};

const formatDate = (s: string) => {
  const d = new Date(s);
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
};

const Players = () => {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [genderFilter, setGenderFilter] = useState<string>('all');
  const [seniorFilter, setSeniorFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('scratch');

  const { data: players, isLoading } = useQuery({
    queryKey: ['public-players-cards'],
    queryFn: async () => {
      const { data } = await supabase
        .from('players')
        .select('id, name, license, club, current_handicap, gender, is_senior, photo_url, updated_at')
        .order('name');
      return (data || []) as Player[];
    },
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
      const sorted = [...rows].sort((a, b) => {
        const da = a.rounds?.date ?? '';
        const db = b.rounds?.date ?? '';
        return da.localeCompare(db);
      });
      const scratchScores = sorted.map((r) => r.scratch_score).filter((v): v is number => v !== null && v !== undefined);
      const stbScores = sorted.map((r) => r.stableford_points).filter((v): v is number => v !== null && v !== undefined);

      if (scratchScores.length === 0 && stbScores.length === 0) continue;

      const avgScratch = scratchScores.length ? scratchScores.reduce((a, b) => a + b, 0) / scratchScores.length : 0;
      const avgStb = stbScores.length ? stbScores.reduce((a, b) => a + b, 0) / stbScores.length : 0;
      const bestScratch = scratchScores.length ? Math.min(...scratchScores) : 0;
      const bestStb = stbScores.length ? Math.max(...stbScores) : 0;

      const variance = scratchScores.length > 1
        ? scratchScores.reduce((sum, v) => sum + Math.pow(v - avgScratch, 2), 0) / scratchScores.length
        : 0;
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

      map.set(pid, {
        rounds: sorted.length,
        bestStableford: bestStb,
        bestScratch,
        avgScratch: Math.round(avgScratch * 10) / 10,
        avgStableford: Math.round(avgStb * 10) / 10,
        stdev: Math.round(stdev * 10) / 10,
        trend,
        prob: 0,
        scratchScores,
        stbScores,
      });
    }

    return map;
  }, [results]);

  // Compute rankings + probability
  const enriched = useMemo(() => {
    if (!players) return [];

    // Scratch ranking: lower avg = better (only players with rounds)
    const withStats = players.filter((p) => statsByPlayer.has(p.id));
    const scratchRank = new Map<string, number>();
    [...withStats]
      .sort((a, b) => {
        const sa = statsByPlayer.get(a.id)!;
        const sb = statsByPlayer.get(b.id)!;
        return sa.avgScratch - sb.avgScratch;
      })
      .forEach((p, i) => scratchRank.set(p.id, i + 1));

    // Hcp ranking: higher avg stableford = better
    const hcpRank = new Map<string, number>();
    [...withStats]
      .sort((a, b) => {
        const sa = statsByPlayer.get(a.id)!;
        const sb = statsByPlayer.get(b.id)!;
        return sb.avgStableford - sa.avgStableford;
      })
      .forEach((p, i) => hcpRank.set(p.id, i + 1));

    // Probability: weighted score normalized 0-25%
    // hcp 40%, recent results 30%, regularity 20%, trend 10%
    const hcps = players.map((p) => p.current_handicap).filter((h): h is number => h !== null);
    const minH = Math.min(...hcps, 0);
    const maxH = Math.max(...hcps, 36);
    const hRange = maxH - minH || 1;

    const stdevs = withStats.map((p) => statsByPlayer.get(p.id)!.stdev);
    const maxStdev = Math.max(...stdevs, 1);

    const enrichedList = players.map((p) => {
      const stats = statsByPlayer.get(p.id);
      let prob = 0;
      if (stats) {
        const hcpScore = p.current_handicap !== null ? 1 - (p.current_handicap - minH) / hRange : 0.5;
        const recentScore = stats.scratchScores.length
          ? Math.max(0, 1 - (stats.scratchScores.slice(-2).reduce((a, b) => a + b, 0) / stats.scratchScores.slice(-2).length - 50) / 30)
          : 0.5;
        const regScore = 1 - stats.stdev / maxStdev;
        const trendScore = stats.trend === 'up' ? 1 : stats.trend === 'down' ? 0 : 0.5;
        const raw = hcpScore * 0.4 + recentScore * 0.3 + regScore * 0.2 + trendScore * 0.1;
        prob = Math.round(raw * 25);
      }
      return {
        player: p,
        stats,
        scratchPos: scratchRank.get(p.id),
        hcpPos: hcpRank.get(p.id),
        prob,
      };
    });

    return enrichedList;
  }, [players, statsByPlayer]);

  const highlights = useMemo(() => {
    const withHcp = enriched.filter((e) => e.player.current_handicap !== null);
    const bestHcp = withHcp.length
      ? [...withHcp].sort((a, b) => (a.player.current_handicap! - b.player.current_handicap!))[0]
      : null;

    const withStats = enriched.filter((e) => e.stats && e.stats.rounds >= 2);
    const mostRegular = withStats.length
      ? [...withStats].sort((a, b) => a.stats!.stdev - b.stats!.stdev)[0]
      : null;

    const favorite = enriched.length
      ? [...enriched].sort((a, b) => b.prob - a.prob)[0]
      : null;

    return { bestHcp, mostRegular, favorite };
  }, [enriched]);

  const filtered = useMemo(() => {
    let list = enriched.filter((e) => {
      const p = e.player;
      const q = search.toLowerCase();
      if (q && !(
        p.name.toLowerCase().includes(q) ||
        p.license?.toLowerCase().includes(q) ||
        p.club?.toLowerCase().includes(q)
      )) return false;
      if (genderFilter !== 'all' && p.gender !== genderFilter) return false;
      if (seniorFilter === 'senior' && !p.is_senior) return false;
      if (seniorFilter === 'no-senior' && p.is_senior) return false;
      return true;
    });

    list.sort((a, b) => {
      if (sortBy === 'scratch') {
        return (a.scratchPos ?? 9999) - (b.scratchPos ?? 9999);
      }
      if (sortBy === 'hcp') {
        return (a.hcpPos ?? 9999) - (b.hcpPos ?? 9999);
      }
      if (sortBy === 'name') {
        return a.player.name.localeCompare(b.player.name);
      }
      if (sortBy === 'handicap') {
        const ah = a.player.current_handicap ?? 99;
        const bh = b.player.current_handicap ?? 99;
        return ah - bh;
      }
      return 0;
    });

    return list;
  }, [enriched, search, genderFilter, seniorFilter, sortBy]);

  return (
    <div className="container py-8 lg:py-12 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <Users className="h-7 w-7 text-primary" />
        <h1 className="font-display text-3xl lg:text-4xl font-bold">{t('players.title')}</h1>
      </div>
      <p className="text-muted-foreground mb-6">{players?.length || 0} jugadors registrats</p>

      {/* Highlight stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card className="p-4 border-border/50">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <Award className="h-4 w-4 text-primary" />
            <span>Millor handicap</span>
          </div>
          {highlights.bestHcp ? (
            <Link to={`/jugadors/${highlights.bestHcp.player.id}`} className="block hover:text-primary transition-colors">
              <p className="font-semibold truncate">{highlights.bestHcp.player.name}</p>
              <p className="text-sm text-muted-foreground font-mono mt-1">
                Hdcp {formatHcp(highlights.bestHcp.player.current_handicap)}
              </p>
            </Link>
          ) : (
            <p className="text-sm text-muted-foreground">—</p>
          )}
        </Card>

        <Card className="p-4 border-border/50">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <Target className="h-4 w-4 text-primary" />
            <span>Més regular</span>
          </div>
          {highlights.mostRegular ? (
            <Link to={`/jugadors/${highlights.mostRegular.player.id}`} className="block hover:text-primary transition-colors">
              <p className="font-semibold truncate">{highlights.mostRegular.player.name}</p>
              <p className="text-sm text-muted-foreground font-mono mt-1">
                σ {highlights.mostRegular.stats!.stdev.toFixed(1)}
              </p>
            </Link>
          ) : (
            <p className="text-sm text-muted-foreground">—</p>
          )}
        </Card>

        <Card className="p-4 border-border/50">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <Flame className="h-4 w-4 text-primary" />
            <span>Favorit pròxima prova</span>
          </div>
          {highlights.favorite && highlights.favorite.stats ? (
            <Link to={`/jugadors/${highlights.favorite.player.id}`} className="block hover:text-primary transition-colors">
              <p className="font-semibold truncate">{highlights.favorite.player.name}</p>
              <p className="text-sm text-primary font-mono font-bold mt-1">{highlights.favorite.prob}%</p>
            </Link>
          ) : (
            <p className="text-sm text-muted-foreground">—</p>
          )}
        </Card>
      </div>

      {/* Legend */}
      <div className="text-xs text-muted-foreground mb-4 flex flex-wrap gap-x-3 gap-y-1">
        <span><strong>Hdcp +X</strong> = Hàndicap (+ millor)</span>
        <span><strong>#N</strong> = Rànquing</span>
        <span>Ø Mitjana</span>
        <span>Millor resultat</span>
        <span><strong>Prob.</strong> = Predicció</span>
      </div>

      {/* Filters */}
      <Card className="p-3 mb-6 border-border/50">
        <div className="flex flex-col md:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cercar jugador..."
              className="pl-9"
            />
          </div>
          <Select value={genderFilter} onValueChange={setGenderFilter}>
            <SelectTrigger className="w-full md:w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tots</SelectItem>
              <SelectItem value="M">Masculí</SelectItem>
              <SelectItem value="F">Femení</SelectItem>
            </SelectContent>
          </Select>
          <Select value={seniorFilter} onValueChange={setSeniorFilter}>
            <SelectTrigger className="w-full md:w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tots</SelectItem>
              <SelectItem value="senior">Sènior</SelectItem>
              <SelectItem value="no-senior">No sènior</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-full md:w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="scratch">Rànquing Scratch</SelectItem>
              <SelectItem value="hcp">Rànquing Hcp</SelectItem>
              <SelectItem value="handicap">Per hàndicap</SelectItem>
              <SelectItem value="name">Per nom</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {isLoading ? (
        <p className="text-muted-foreground">{t('common.loading')}</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground mb-3">{filtered.length} jugadors</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(({ player: p, stats, scratchPos, hcpPos, prob }) => (
              <Card key={p.id} className="p-4 border-border/50 hover:border-primary/40 hover:shadow-md transition-all">
                <div className="flex items-start gap-3 mb-3">
                  <Avatar className="h-12 w-12 border border-border/40">
                    {p.photo_url && <AvatarImage src={p.photo_url} alt={p.name} />}
                    <AvatarFallback className="bg-muted text-xs font-semibold">{initials(p.name)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <Link
                      to={`/jugadors/${p.id}`}
                      className="font-semibold text-sm leading-tight hover:text-primary transition-colors block truncate"
                    >
                      {p.name}
                    </Link>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-mono">
                        Hdcp {formatHcp(p.current_handicap)}
                      </Badge>
                      {scratchPos && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">#{scratchPos} Scr</Badge>
                      )}
                      {hcpPos && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">#{hcpPos} Hcp</Badge>
                      )}
                      {p.gender === 'F' && <Badge variant="outline" className="text-[10px] px-1.5 py-0">F</Badge>}
                      {p.is_senior && <Badge variant="outline" className="text-[10px] px-1.5 py-0">SR</Badge>}
                    </div>
                  </div>
                  <div className="flex items-center text-xs text-muted-foreground shrink-0" title={
                    stats?.trend === 'up' ? 'Millora' : stats?.trend === 'down' ? 'Empitjora' : 'Estable'
                  }>
                    {stats?.trend === 'up' && <TrendingUp className="h-4 w-4 text-primary" />}
                    {stats?.trend === 'down' && <TrendingDown className="h-4 w-4 text-destructive" />}
                    {(!stats || stats.trend === 'stable') && <Minus className="h-4 w-4" />}
                  </div>
                </div>

                {stats ? (
                  <>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2 font-mono">
                      <span className="flex items-center gap-1">
                        <BarChart3 className="h-3 w-3" /> Ø{stats.avgScratch}
                      </span>
                      <span className="flex items-center gap-1">
                        <Trophy className="h-3 w-3" /> {stats.bestScratch || '—'}
                      </span>
                      <span>{stats.rounds} {stats.rounds === 1 ? 'prova' : 'proves'}</span>
                    </div>

                    <div className="mt-3">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-muted-foreground">Prob. guanyar</span>
                        <span className="font-mono font-semibold text-primary">{prob}%</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all"
                          style={{ width: `${Math.min(100, prob * 4)}%` }}
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground italic">Sense proves jugades</p>
                )}

                <div className="mt-3 pt-3 border-t border-border/30 text-[10px] text-muted-foreground">
                  Act. {formatDate(p.updated_at)}
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default Players;

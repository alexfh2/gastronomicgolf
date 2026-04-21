import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import PlayerProfileDialog from '@/components/PlayerProfileDialog';
import { useCategoryRankings, buildPlayerRankPositions, type CategoryKey } from '@/hooks/useCategoryRankings';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { fetchPublicCircuitData, publicCircuitDataQueryKey } from '@/lib/publicCircuitData';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

const nameSortKey = (name: string) => {
  // All names are normalized to "APELLIDOS, NOMBRE" → sort by surnames (text before comma).
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
  const [catLow, setCatLow] = useState(false);
  const [catHigh, setCatHigh] = useState(false);
  const [catFemale, setCatFemale] = useState(false);
  const [catSenior, setCatSenior] = useState(false);
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

  const categoryRankings = useCategoryRankings();
  const rankPositions = useMemo(() => buildPlayerRankPositions(categoryRankings), [categoryRankings]);

  // Compute hcp ranking
  const enriched = useMemo(() => {
    if (!players) return [];

    return players.map((p) => ({
      player: p,
      stats: statsByPlayer.get(p.id),
      ranks: rankPositions.get(p.id) || {},
    }));
  }, [players, statsByPlayer, rankPositions]);


  const filtered = useMemo(() => {
    const anyCat = catLow || catHigh || catFemale || catSenior;
    let list = enriched.filter((e) => {
      const p = e.player;
      const q = search.toLowerCase();
      if (q && !(
        p.name.toLowerCase().includes(q) ||
        p.license?.toLowerCase().includes(q) ||
        p.club?.toLowerCase().includes(q)
      )) return false;

      if (anyCat) {
        const hcp = p.current_handicap;
        const isLow = hcp !== null && hcp !== undefined && hcp <= 15;
        const isHigh = hcp !== null && hcp !== undefined && hcp > 15;
        const isFemale = p.gender === 'F';
        const isSenior = p.is_senior;
        const matches =
          (catLow && isLow) ||
          (catHigh && isHigh) ||
          (catFemale && isFemale) ||
          (catSenior && isSenior);
        if (!matches) return false;
      }
      return true;
    });

    list.sort((a, b) => {
      if (sortBy === 'hcp') {
        // Use the best (lowest) ranking position across the player's categories
        const bestPos = (e: typeof a) => {
          const positions = Object.values(e.ranks).filter((v): v is number => typeof v === 'number');
          return positions.length ? Math.min(...positions) : 9999;
        };
        return bestPos(a) - bestPos(b);
      }
      if (sortBy === 'name') {
        return nameSortKey(a.player.name).localeCompare(nameSortKey(b.player.name));
      }
      if (sortBy === 'handicap') {
        const ah = a.player.current_handicap ?? 99;
        const bh = b.player.current_handicap ?? 99;
        return ah - bh;
      }
      return 0;
    });

    return list;
  }, [enriched, search, catLow, catHigh, catFemale, catSenior, sortBy]);

  return (
    <div className="container py-8 lg:py-12 animate-fade-in">
      {/* Header */}
      <div className="bg-primary rounded-lg px-4 py-2.5 mb-2 border border-primary/15 inline-flex items-center gap-3">
        <Users className="h-6 w-6 text-primary-foreground" />
        <h1 className="font-display text-2xl lg:text-3xl font-bold text-primary-foreground">{t('players.title')}</h1>
      </div>
      <p className="text-muted-foreground mb-6">{players?.length || 0} jugadors registrats</p>

      {/* Legend */}
      <div className="text-xs text-muted-foreground mb-4 flex flex-wrap gap-x-3 gap-y-1">
        <span><strong>Hdcp +X</strong> = Hàndicap (+ millor)</span>
        <span><strong>#N</strong> = Rànquing</span>
        <span>Ø Mitjana</span>
        <span>Millor resultat</span>
      </div>

      {/* Filters */}
      <Card className="p-3 mb-6 border-border/50">
        <div className="flex flex-col md:flex-row gap-2 mb-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cercar jugador..."
              className="pl-9"
            />
          </div>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-full md:w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="hcp">Per rànquing</SelectItem>
              <SelectItem value="name">Per nom</SelectItem>
              <SelectItem value="handicap">Per hàndicap</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2 pt-1">
          <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">Categoria:</span>
          <div className="flex items-center gap-2">
            <Checkbox id="cat-low" checked={catLow} onCheckedChange={(v) => setCatLow(!!v)} />
            <Label htmlFor="cat-low" className="text-sm cursor-pointer">HCP Baix (≤15)</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="cat-high" checked={catHigh} onCheckedChange={(v) => setCatHigh(!!v)} />
            <Label htmlFor="cat-high" className="text-sm cursor-pointer">HCP Alt (&gt;15)</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="cat-female" checked={catFemale} onCheckedChange={(v) => setCatFemale(!!v)} />
            <Label htmlFor="cat-female" className="text-sm cursor-pointer">Femení</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="cat-senior" checked={catSenior} onCheckedChange={(v) => setCatSenior(!!v)} />
            <Label htmlFor="cat-senior" className="text-sm cursor-pointer">Sènior</Label>
          </div>
        </div>
      </Card>

      {isLoading ? (
        <p className="text-muted-foreground">{t('common.loading')}</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground mb-3">{filtered.length} jugadors</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(({ player: p, stats, ranks }) => {
              const rankBadges = (Object.keys(ranks) as CategoryKey[])
                .map((k) => ({ key: k, pos: ranks[k]! }))
                .filter((r) => r.pos)
                .sort((a, b) => a.pos - b.pos);
              return (
              <Card key={p.id} className="p-4 border-border/50 hover:border-primary/40 hover:shadow-md transition-all">
                <div className="flex items-start gap-3 mb-3">
                  <Avatar className="h-12 w-12 border border-border/40">
                    {p.photo_url && <AvatarImage src={p.photo_url} alt={p.name} />}
                    <AvatarFallback className="bg-muted text-xs font-semibold">{initials(p.name)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <button
                      type="button"
                      onClick={() => setSelectedPlayerId(p.id)}
                      className="font-semibold text-sm leading-tight hover:text-primary transition-colors block truncate text-left w-full"
                    >
                      {p.name}
                    </button>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-mono">
                        Hdcp {formatHcp(p.current_handicap)}
                      </Badge>
                      {rankBadges.map((r) => (
                        <Badge key={r.key} variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
                          #{r.pos} {RANK_LABELS[r.key]}
                        </Badge>
                      ))}
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
                  <div className="flex items-center gap-3 text-xs text-muted-foreground font-mono">
                    <span className="flex items-center gap-1">
                      <BarChart3 className="h-3 w-3" /> Ø{stats.avgStableford} pts
                    </span>
                    <span className="flex items-center gap-1">
                      <Trophy className="h-3 w-3" /> {stats.bestStableford || '—'}
                    </span>
                    <span>{stats.rounds} {stats.rounds === 1 ? 'prova' : 'proves'}</span>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">Sense proves jugades</p>
                )}

                <div className="mt-3 pt-3 border-t border-border/30 text-[10px] text-muted-foreground">
                  Act. {formatDate(p.updated_at)}
                </div>
              </Card>
              );
            })}
          </div>
        </>
      )}

      <PlayerProfileDialog
        playerId={selectedPlayerId}
        open={!!selectedPlayerId}
        onOpenChange={(o) => !o && setSelectedPlayerId(null)}
      />
    </div>
  );
};

export default Players;

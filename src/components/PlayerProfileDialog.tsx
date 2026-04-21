import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { User, TrendingUp, Trophy, Bird, Target, Square, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { ca, es } from 'date-fns/locale';
import ScorecardVisual from '@/components/ScorecardVisual';
import { fetchPublicCircuitData, publicCircuitDataQueryKey } from '@/lib/publicCircuitData';

interface PlayerProfileDialogProps {
  playerId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const initials = (name: string) =>
  name.split(/[\s,]+/).filter(Boolean).slice(0, 2).map((n) => n[0]).join('').toUpperCase();

const PlayerProfileDialog = ({ playerId, open, onOpenChange }: PlayerProfileDialogProps) => {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'ca' ? ca : es;
  const [openCards, setOpenCards] = useState<string[]>([]);

  const { data: player } = useQuery({
    queryKey: [...publicCircuitDataQueryKey, 'dialog-player', playerId],
    queryFn: fetchPublicCircuitData,
    select: (data) => data.players.find((player) => player.id === playerId) ?? null,
    enabled: !!playerId && open,
  });

  const { data: results } = useQuery({
    queryKey: ['player-profile-dialog-results', playerId],
    queryFn: async () => {
      const { data } = await supabase
        .from('results')
        .select('*, rounds!inner(name, date, club, round_number, status, is_master, master_coefficient, course_par, course_handicap)')
        .eq('player_id', playerId!)
        .eq('rounds.status', 'published')
        .order('rounds(round_number)');
      return data || [];
    },
    enabled: !!playerId && open,
  });

  // Load all season data to compute category rankings
  const { data: allResults } = useQuery({
    queryKey: [...publicCircuitDataQueryKey, 'dialog-results'],
    queryFn: fetchPublicCircuitData,
    select: (data) => data.results.filter((result) => result.stableford_points != null),
    enabled: open,
  });

  const { data: season } = useQuery({
    queryKey: ['player-profile-dialog-season'],
    queryFn: async () => {
      const { data } = await supabase.from('seasons').select('rules_config').eq('active', true).single();
      return data;
    },
    enabled: open,
  });

  const bestN = (season?.rules_config as any)?.best_n_scores || 8;

  // Compute player category positions
  const positions = useMemo(() => {
    if (!allResults?.length || !playerId) return null;

    const byPlayer = new Map<string, {
      gender: string | null;
      is_senior: boolean;
      handicap: number | null;
      scores: { points: number; weighted: number }[];
    }>();

    for (const r of allResults as any[]) {
      if (!r.players_public || r.stableford_points == null) continue;
      const pid = r.player_id;
      if (!byPlayer.has(pid)) {
        byPlayer.set(pid, {
          gender: r.players_public.gender,
          is_senior: r.players_public.is_senior,
          handicap: r.handicap_at_round ?? r.players_public.current_handicap,
          scores: [],
        });
      }
      const isMaster = r.rounds?.is_master || false;
      const coef = r.rounds?.master_coefficient || 1;
      const weighted = Math.round(r.stableford_points * (isMaster ? coef : 1));
      byPlayer.get(pid)!.scores.push({ points: r.stableford_points, weighted });
    }

    const computeTotal = (scores: { weighted: number }[]) =>
      [...scores].sort((a, b) => b.weighted - a.weighted).slice(0, bestN).reduce((s, x) => s + x.weighted, 0);

    const buildRanking = (filterFn: (p: { gender: string | null; is_senior: boolean; handicap: number | null }) => boolean) => {
      return Array.from(byPlayer.entries())
        .filter(([, p]) => filterFn(p))
        .map(([id, p]) => ({ id, total: computeTotal(p.scores) }))
        .sort((a, b) => b.total - a.total);
    };

    const findPos = (ranking: { id: string; total: number }[]) => {
      const idx = ranking.findIndex((r) => r.id === playerId);
      return idx === -1 ? null : { pos: idx + 1, total: ranking[idx].total, of: ranking.length };
    };

    const hcpLow = buildRanking((p) => p.handicap != null && p.handicap <= 15.0);
    const hcpHigh = buildRanking((p) => p.handicap != null && p.handicap > 15.0 && p.handicap <= 36);
    const female = buildRanking((p) => p.gender === 'F');
    const senior = buildRanking((p) => p.is_senior);

    return {
      hcpLow: findPos(hcpLow),
      hcpHigh: findPos(hcpHigh),
      female: findPos(female),
      senior: findPos(senior),
    };
  }, [allResults, playerId, bestN]);

  if (!player) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl">
          <p className="text-sm text-muted-foreground py-8 text-center">{t('common.loading')}</p>
        </DialogContent>
      </Dialog>
    );
  }

  // Stats
  const stbScores = (results || []).filter((r) => r.stableford_points != null).map((r) => r.stableford_points!);
  const avgStb = stbScores.length ? (stbScores.reduce((a, b) => a + b, 0) / stbScores.length).toFixed(1) : '—';
  const bestStb = stbScores.length ? Math.max(...stbScores) : '—';

  const roundsWithScorecard = (results || []).filter((r) => {
    const raw = r.scorecard as any;
    const scores: number[] | null = Array.isArray(raw) ? raw : raw?.scores ?? null;
    const round = r.rounds as any;
    const par: number[] | undefined = Array.isArray(round?.course_par) ? round.course_par : undefined;
    return scores && par && scores.length === par.length;
  });

  let birdies = 0, pars = 0, bogeys = 0, doublePlus = 0;
  const n = roundsWithScorecard.length;
  for (const r of roundsWithScorecard) {
    const raw = r.scorecard as any;
    const scores: number[] = Array.isArray(raw) ? raw : raw?.scores;
    const round = r.rounds as any;
    const par: number[] = round.course_par;
    for (let i = 0; i < scores.length; i++) {
      if (scores[i] === 0 || scores[i] == null) continue;
      const diff = scores[i] - par[i];
      if (diff <= -1) birdies++;
      else if (diff === 0) pars++;
      else if (diff === 1) bogeys++;
      else doublePlus++;
    }
  }

  const stats = [
    { label: 'Mitjana Stb.', value: avgStb, icon: TrendingUp },
    { label: 'Millor Stb.', value: bestStb, icon: Trophy },
    { label: 'Birdies/r.', value: n ? (birdies / n).toFixed(1) : '—', icon: Bird },
    { label: 'Pars/r.', value: n ? (pars / n).toFixed(1) : '—', icon: Target },
    { label: 'Bogeys/r.', value: n ? (bogeys / n).toFixed(1) : '—', icon: Square },
    { label: 'Doble+/r.', value: n ? (doublePlus / n).toFixed(1) : '—', icon: AlertTriangle },
  ];

  // Determine main category (by HCP) and subcategories
  const hcp = player.current_handicap;
  const mainCategory =
    hcp != null && hcp <= 15.0
      ? { key: 'hcpLow', label: 'HCP Baix (≤15.0)', pos: positions?.hcpLow }
      : hcp != null && hcp <= 36
      ? { key: 'hcpHigh', label: 'HCP Alt (15.1-36)', pos: positions?.hcpHigh }
      : null;

  const subCategories: { label: string; pos: { pos: number; total: number; of: number } | null | undefined }[] = [];
  if (player.gender === 'F') subCategories.push({ label: 'Femení', pos: positions?.female });
  if (player.is_senior) subCategories.push({ label: 'Sènior', pos: positions?.senior });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-3">
          <DialogTitle className="flex items-center gap-2 font-display">
            <User className="h-5 w-5 text-primary" />
            Fitxa del Jugador
          </DialogTitle>
        </DialogHeader>

        {/* Solid green header with player name in white */}
        <div className="bg-primary px-6 py-5 mx-6 rounded-lg flex items-center gap-4">
          <Avatar className="h-14 w-14 border-2 border-primary-foreground/20">
            {player.photo_url && <AvatarImage src={player.photo_url} alt={player.name} />}
            <AvatarFallback className="bg-primary-foreground/10 text-primary-foreground font-semibold">
              {initials(player.name)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h3 className="font-display font-bold text-lg leading-tight text-primary-foreground truncate">
              {player.name}
            </h3>
            <p className="text-xs text-primary-foreground/70 mt-1">
              {results?.length || 0} {(results?.length || 0) === 1 ? 'prova disputada' : 'proves disputades'}
              {player.current_handicap != null && <> · Hcp {player.current_handicap}</>}
              {player.club && <> · {player.club}</>}
            </p>
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Category positions */}
          {mainCategory && (
            <div>
              <h4 className="font-display font-semibold text-sm mb-3">Posició al rànquing</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Main category */}
                <div className="border border-border/50 rounded-lg p-4 bg-card">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 font-medium">
                    {mainCategory.label}
                  </div>
                  <div className="flex items-end justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Trophy className="h-5 w-5 text-primary" strokeWidth={1.5} />
                      <span className="font-display font-extrabold text-2xl text-primary tabular-nums">
                        {mainCategory.pos?.pos ?? '—'}
                      </span>
                      <span className="text-xs text-muted-foreground mb-0.5">
                        / {mainCategory.pos?.of ?? '—'}
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-bold text-base">{mainCategory.pos?.total ?? '—'}</div>
                      <div className="text-[10px] text-muted-foreground leading-none">punts</div>
                    </div>
                  </div>
                </div>

                {/* Subcategories */}
                {subCategories.map((sub) => (
                  <div key={sub.label} className="border border-border/50 rounded-lg p-4 bg-card">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 font-medium">
                      {sub.label}
                    </div>
                    <div className="flex items-end justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Trophy className="h-5 w-5 text-accent" strokeWidth={1.5} />
                        <span className="font-display font-extrabold text-2xl text-accent tabular-nums">
                          {sub.pos?.pos ?? '—'}
                        </span>
                        <span className="text-xs text-muted-foreground mb-0.5">
                          / {sub.pos?.of ?? '—'}
                        </span>
                      </div>
                      <div className="text-right">
                        <div className="font-mono font-bold text-base">{sub.pos?.total ?? '—'}</div>
                        <div className="text-[10px] text-muted-foreground leading-none">punts</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* HCP Evolution */}
          {(() => {
            const hcpData = (results || [])
              .filter(r => r.handicap_at_round != null)
              .map(r => ({
                label: `J${(r.rounds as any)?.round_number}`,
                hcp: Number(r.handicap_at_round),
              }));
            if (hcpData.length < 2) return null;

            const values = hcpData.map(d => d.hcp);
            const min = Math.min(...values);
            const max = Math.max(...values);
            const range = max - min || 1;
            const chartH = 60;
            const chartW = Math.max(200, hcpData.length * 60);
            const padX = 30;
            const padY = 22;
            const usableW = chartW - padX * 2;
            const usableH = chartH - padY * 2;

            const points = hcpData.map((d, i) => ({
              x: padX + (i / (hcpData.length - 1)) * usableW,
              y: padY + (1 - (d.hcp - min) / range) * usableH,
              hcp: d.hcp,
              label: d.label,
            }));

            const polyline = points.map(p => `${p.x},${p.y}`).join(' ');

            return (
              <div>
                <h4 className="font-display font-semibold text-sm mb-3">Evolució HCP</h4>
                <div className="bg-muted/30 rounded-lg p-3 border border-border/40 overflow-x-auto">
                  <svg width={chartW} height={chartH + 20} className="text-primary">
                    <polyline
                      points={polyline}
                      fill="none"
                      stroke="hsl(var(--primary))"
                      strokeWidth="2"
                      strokeLinejoin="round"
                    />
                    {points.map((p, i) => (
                      <g key={i}>
                        <circle cx={p.x} cy={p.y} r="4" fill="hsl(var(--primary))" />
                        <text x={p.x} y={p.y - 8} textAnchor="middle" className="fill-foreground text-[10px] font-mono font-semibold">
                          {p.hcp}
                        </text>
                        <text x={p.x} y={chartH + 14} textAnchor="middle" className="fill-muted-foreground text-[9px]">
                          {p.label}
                        </text>
                      </g>
                    ))}
                  </svg>
                </div>
              </div>
            );
          })()}

          {/* Statistics */}
          {n > 0 && (
            <div>
              <h4 className="font-display font-semibold text-sm mb-3">Estadístiques</h4>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 bg-muted/30 rounded-lg p-3 border border-border/40">
                {stats.map((s) => (
                  <div key={s.label} className="text-center">
                    <s.icon className="h-4 w-4 mx-auto text-muted-foreground/60 mb-1" strokeWidth={1.5} />
                    <div className="font-display font-extrabold text-base text-primary tabular-nums">{s.value}</div>
                    <div className="text-[10px] text-muted-foreground leading-tight font-bold">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Rounds list */}
          <div>
            <h4 className="font-display font-semibold text-sm mb-3">Proves disputades</h4>
            {results && results.length > 0 ? (
              <Accordion type="multiple" value={openCards} onValueChange={setOpenCards} className="space-y-2">
                {results.map((r) => {
                  const round = r.rounds as any;
                  const raw = r.scorecard as any;
                  const scorecard: number[] | null = Array.isArray(raw) ? raw : raw?.scores ?? null;
                  const handicapPlay: number | null = raw?.handicap_play ?? null;
                  const coursePar: number[] | undefined = Array.isArray(round?.course_par) ? round.course_par : undefined;

                  return (
                    <AccordionItem key={r.id} value={r.id} className="border border-border/50 rounded-md overflow-hidden bg-background">
                      <AccordionTrigger className="px-3 py-2 hover:no-underline hover:bg-muted/40">
                        <div className="flex items-center gap-2 text-left flex-1 min-w-0">
                          <Badge variant="outline" className="text-[10px] font-mono shrink-0 px-1.5 py-0">J{round?.round_number}</Badge>
                          <span className="font-medium text-sm truncate">{round?.name}</span>
                          {round?.is_master && <Badge variant="secondary" className="text-[9px] px-1.5 py-0 bg-accent/20 text-accent border-0 shrink-0">M</Badge>}
                          <span className="text-xs text-muted-foreground ml-auto mr-2 shrink-0">
                            {round?.date ? format(new Date(round.date), 'dd MMM', { locale }) : ''}
                          </span>
                          <span className="font-mono font-bold text-sm text-primary mr-1 shrink-0">{r.stableford_points ?? '—'}</span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-3 pb-3">
                        <div className="flex gap-4 mb-2 text-xs flex-wrap">
                          <span>Stb: <strong className="text-primary">{r.stableford_points ?? '—'}</strong></span>
                          <span className="text-muted-foreground">Scratch: <strong>{r.scratch_score ?? '—'}</strong></span>
                          <span className="text-muted-foreground">
                            HCP: {r.handicap_at_round ?? '—'}{handicapPlay != null ? ` (HPU: ${handicapPlay})` : ''}
                          </span>
                        </div>
                        {scorecard && scorecard.length > 0 ? (
                          <div className="overflow-x-auto">
                            <ScorecardVisual
                              scores={scorecard}
                              par={coursePar}
                              handicap={Array.isArray(round?.course_handicap) ? round.course_handicap : undefined}
                              playerHandicap={handicapPlay ?? r.handicap_at_round}
                            />
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">Sense targeta hoyo a hoyo</p>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">Sense proves disputades</p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PlayerProfileDialog;

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Trophy, TrendingUp, BarChart3, Award, Repeat, ChevronDown, ArrowUpRight, Mountain, CircleDot } from 'lucide-react';
import { cn } from '@/lib/utils';

type LeaderboardEntry = { name: string; value: number; detail?: string };

const Stats = () => {
  const { t } = useTranslation();
  const [openCards, setOpenCards] = useState<Set<number>>(new Set());

  const toggleCard = (idx: number) => {
    setOpenCards(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const { data: results, isLoading } = useQuery({
    queryKey: ['public-stats-data'],
    queryFn: async () => {
      const { data } = await supabase
        .from('results')
        .select('player_id, stableford_points, scorecard, rounds!inner(status, name, round_number, club, course, course_par), players(name)')
        .eq('rounds.status', 'published');
      return data || [];
    },
  });

  const { stats, leaderboards } = useMemo(() => {
    if (!results?.length) return { stats: null, leaderboards: [] as LeaderboardEntry[][] };

    const byPlayer = new Map<string, { name: string; stableford: number[]; rounds: { name: string; number: number; pts: number }[] }>();

    for (const r of results) {
      const name = (r.players as any)?.name || 'Desconegut';
      const pid = r.player_id;
      if (!byPlayer.has(pid)) {
        byPlayer.set(pid, { name, stableford: [], rounds: [] });
      }
      const p = byPlayer.get(pid)!;
      if (r.stableford_points != null) {
        p.stableford.push(r.stableford_points);
        p.rounds.push({
          name: (r.rounds as any)?.name || '',
          number: (r.rounds as any)?.round_number || 0,
          pts: r.stableford_points,
        });
      }
    }

    const players = Array.from(byPlayer.entries());

    // === Best single round ===
    const allRounds: LeaderboardEntry[] = [];
    for (const r of results) {
      if (r.stableford_points != null) {
        allRounds.push({
          name: (r.players as any)?.name || '',
          value: r.stableford_points,
          detail: (r.rounds as any)?.name || '',
        });
      }
    }
    allRounds.sort((a, b) => b.value - a.value);
    const top10BestRound = allRounds.slice(0, 10);

    // === Best avg stableford (min 2 rounds) ===
    const avgList: LeaderboardEntry[] = [];
    for (const [, p] of players) {
      if (p.stableford.length >= 2) {
        const avg = p.stableford.reduce((a, b) => a + b, 0) / p.stableford.length;
        avgList.push({ name: p.name, value: Math.round(avg * 10) / 10, detail: `${p.stableford.length} jornades` });
      }
    }
    avgList.sort((a, b) => b.value - a.value);
    const top10Avg = avgList.slice(0, 10);

    // === Regularity (most rounds) ===
    const regList: LeaderboardEntry[] = [];
    for (const [, p] of players) {
      regList.push({ name: p.name, value: p.stableford.length });
    }
    regList.sort((a, b) => b.value - a.value);
    const top10Reg = regList.slice(0, 10);

    // === Biggest ranking climb after a round ===
    // Group results by round_number, rank players per round, find biggest position gain
    const roundNumbers = new Set<number>();
    for (const [, p] of players) {
      for (const rd of p.rounds) roundNumbers.add(rd.number);
    }
    const sortedRoundNums = Array.from(roundNumbers).sort((a, b) => a - b);

    // Build cumulative rankings per round
    const climbList: LeaderboardEntry[] = [];
    if (sortedRoundNums.length >= 2) {
      for (let i = 1; i < sortedRoundNums.length; i++) {
        const prevRoundNum = sortedRoundNums[i - 1];
        const currRoundNum = sortedRoundNums[i];

        // Cumulative totals up to previous round
        const prevTotals: { pid: string; name: string; total: number }[] = [];
        const currTotals: { pid: string; name: string; total: number }[] = [];

        for (const [pid, p] of players) {
          const prevSum = p.rounds.filter(r => r.number <= prevRoundNum).reduce((s, r) => s + r.pts, 0);
          const currSum = p.rounds.filter(r => r.number <= currRoundNum).reduce((s, r) => s + r.pts, 0);
          if (p.rounds.some(r => r.number <= prevRoundNum)) {
            prevTotals.push({ pid, name: p.name, total: prevSum });
          }
          if (p.rounds.some(r => r.number <= currRoundNum)) {
            currTotals.push({ pid, name: p.name, total: currSum });
          }
        }

        prevTotals.sort((a, b) => b.total - a.total);
        currTotals.sort((a, b) => b.total - a.total);

        const prevRank = new Map(prevTotals.map((e, idx) => [e.pid, idx + 1]));
        const currRank = new Map(currTotals.map((e, idx) => [e.pid, idx + 1]));

        const firstPlayer = players[0]?.[1];
        const roundName = firstPlayer?.rounds.find((r: any) => r.number === currRoundNum)?.name || `J${currRoundNum}`;

        for (const [pid, pRank] of currRank) {
          const prev = prevRank.get(pid);
          if (prev != null) {
            const climb = prev - pRank; // positive = climbed
            if (climb > 0) {
              const pName = byPlayer.get(pid)?.name || '';
              climbList.push({
                name: pName,
                value: climb,
                detail: `${roundName} (${prev}→${pRank})`,
              });
            }
          }
        }
      }
    }
    climbList.sort((a, b) => b.value - a.value);
    const top10Climb = climbList.slice(0, 10);

    // === Course difficulty (avg stableford per course) ===
    const byCourse = new Map<string, { scores: number[]; club: string }>();
    for (const r of results) {
      if (r.stableford_points == null) continue;
      const course = (r.rounds as any)?.course || (r.rounds as any)?.club || 'Desconegut';
      const club = (r.rounds as any)?.club || '';
      if (!byCourse.has(course)) byCourse.set(course, { scores: [], club });
      byCourse.get(course)!.scores.push(r.stableford_points);
    }
    const courseList: LeaderboardEntry[] = [];
    for (const [course, data] of byCourse) {
      const avg = data.scores.reduce((a, b) => a + b, 0) / data.scores.length;
      courseList.push({
        name: course,
        value: Math.round(avg * 10) / 10,
        detail: `${data.scores.length} targetes`,
      });
    }
    // Most demanding = lowest avg stableford
    const coursesByDifficulty = [...courseList].sort((a, b) => a.value - b.value);
    const top10Courses = coursesByDifficulty.slice(0, 10);

    // === Hardest / Easiest hole ===
    // Analyze scorecard data: each scorecard has hole-by-hole gross scores
    // Compare vs course_par to find avg strokes over/under par per hole
    const holeStats = new Map<string, { totalOverPar: number; count: number; course: string }>();

    for (const r of results) {
      const scorecard = r.scorecard as any;
      const coursePar = (r.rounds as any)?.course_par as any;
      const courseName = (r.rounds as any)?.course || (r.rounds as any)?.club || '';
      if (!scorecard || !coursePar) continue;

      // scorecard and course_par can be arrays of 18 numbers or objects
      const getHoleScores = (sc: any): number[] => {
        if (Array.isArray(sc)) return sc.map(Number);
        if (typeof sc === 'object') return Object.values(sc).map(Number);
        return [];
      };

      const scores = getHoleScores(scorecard);
      const pars = getHoleScores(coursePar);

      for (let h = 0; h < Math.min(scores.length, pars.length); h++) {
        if (isNaN(scores[h]) || isNaN(pars[h]) || scores[h] === 0 || pars[h] === 0) continue;
        const key = `${courseName}#${h + 1}`;
        if (!holeStats.has(key)) holeStats.set(key, { totalOverPar: 0, count: 0, course: courseName });
        const stat = holeStats.get(key)!;
        stat.totalOverPar += scores[h] - pars[h];
        stat.count++;
      }
    }

    const holeList: (LeaderboardEntry & { avgOver: number })[] = [];
    for (const [key, data] of holeStats) {
      if (data.count < 3) continue; // min samples
      const [course, holeNum] = key.split('#');
      const avgOver = data.totalOverPar / data.count;
      holeList.push({
        name: `Forat ${holeNum}`,
        value: Math.round(avgOver * 100) / 100,
        detail: `${course} (${data.count} targetes)`,
        avgOver,
      });
    }

    // Hardest holes (most over par)
    const hardestHoles = [...holeList].sort((a, b) => b.avgOver - a.avgOver).slice(0, 10).map(h => ({
      name: h.name,
      value: h.value,
      detail: h.detail,
    }));

    // Easiest holes (most under par or closest to 0)
    const easiestHoles = [...holeList].sort((a, b) => a.avgOver - b.avgOver).slice(0, 10).map(h => ({
      name: h.name,
      value: h.value,
      detail: h.detail,
    }));

    const bestRound = top10BestRound[0] || { name: '—', value: 0, detail: '' };
    const bestAvg = top10Avg[0] || { name: '—', value: 0 };
    const mostReg = top10Reg[0] || { name: '—', value: 0 };
    const bestClimb = top10Climb[0] || { name: '—', value: 0 };
    const hardestCourse = top10Courses[0] || { name: '—', value: 0 };
    const hardestHole = hardestHoles[0] || { name: '—', value: 0, detail: '' };
    const easiestHole = easiestHoles[0] || { name: '—', value: 0, detail: '' };

    const totalPlayers = players.length;
    const totalResults = results.length;

    return {
      stats: { bestRound, bestAvg, mostReg, bestClimb, hardestCourse, hardestHole, easiestHole, totalPlayers, totalResults },
      leaderboards: [top10BestRound, top10Avg, top10Reg, top10Climb, top10Courses, hardestHoles, easiestHoles, [] as LeaderboardEntry[]],
    };
  }, [results]);

  const statCards = stats ? [
    { icon: Trophy, label: t('stats.bestRound'), value: `${stats.bestRound.value} pts`, detail: `${stats.bestRound.name} — ${stats.bestRound.detail}`, subtitle: '', unit: 'pts' },
    { icon: TrendingUp, label: t('stats.avgStableford'), value: `${stats.bestAvg.value} pts`, detail: stats.bestAvg.name, subtitle: '', unit: 'pts' },
    { icon: Repeat, label: t('stats.regularity'), value: `${stats.mostReg.value} jornades`, detail: stats.mostReg.name, subtitle: '', unit: 'jornades' },
    { icon: ArrowUpRight, label: t('stats.biggestClimb', 'Major pujada de rànquing'), value: `+${stats.bestClimb.value} pos.`, detail: `${stats.bestClimb.name}`, subtitle: t('stats.biggestClimbDesc', 'Posicions guanyades al rànquing general després d\'una jornada'), unit: 'pos.' },
    { icon: Mountain, label: t('stats.courseDifficulty', 'Camps per dificultat'), value: `${stats.hardestCourse.value} pts/avg`, detail: `${stats.hardestCourse.name}`, subtitle: t('stats.courseDifficultyDesc', 'Mitjana Stableford per camp (menor = més exigent)'), unit: 'pts' },
    { icon: CircleDot, label: t('stats.hardestHole', 'Forat més difícil'), value: `+${stats.hardestHole.value}`, detail: `${stats.hardestHole.name} — ${stats.hardestHole.detail || ''}`, subtitle: t('stats.hardestHoleDesc', 'Mitjana de cops per sobre del par'), unit: 'sobre par' },
    { icon: CircleDot, label: t('stats.easiestHole', 'Forat més fàcil'), value: `${stats.easiestHole.value > 0 ? '+' : ''}${stats.easiestHole.value}`, detail: `${stats.easiestHole.name} — ${stats.easiestHole.detail || ''}`, subtitle: t('stats.easiestHoleDesc', 'Mitjana de cops respecte al par'), unit: 'sobre par' },
    { icon: Award, label: t('stats.participation', 'Participació'), value: `${stats.totalPlayers} jugadors`, detail: `${stats.totalResults} resultats totals`, subtitle: '', unit: '' },
  ] : [];

  return (
    <div className="container py-8 lg:py-12 animate-fade-in">
      <h1 className="font-display text-3xl font-bold mb-2">{t('stats.title')}</h1>
      <p className="text-muted-foreground mb-8">{t('common.season')} 2026</p>

      {isLoading ? (
        <p className="text-muted-foreground">{t('common.loading')}</p>
      ) : !stats ? (
        <p className="text-muted-foreground">{t('common.noData')}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {statCards.map((card, idx) => {
            const lb = leaderboards[idx] || [];
            const hasLeaderboard = lb.length > 0;
            const isOpen = openCards.has(idx);

            return (
              <Collapsible key={card.label} open={isOpen} onOpenChange={() => hasLeaderboard && toggleCard(idx)}>
                <Card className={cn(
                  "border-border/60 transition-shadow",
                  hasLeaderboard && "cursor-pointer hover:shadow-md"
                )}>
                  <CollapsibleTrigger asChild disabled={!hasLeaderboard}>
                    <div>
                      <CardHeader className="pb-2 flex-row items-center gap-3 space-y-0">
                        <card.icon className="h-5 w-5 text-primary" />
                        <CardTitle className="text-sm font-medium text-muted-foreground flex-1">{card.label}</CardTitle>
                        {hasLeaderboard && (
                          <ChevronDown className={cn(
                            "h-4 w-4 text-muted-foreground transition-transform duration-200",
                            isOpen && "rotate-180"
                          )} />
                        )}
                      </CardHeader>
                      <CardContent>
                        <p className="text-2xl font-display font-bold text-foreground">{card.value}</p>
                        <p className="text-sm text-muted-foreground mt-1">{card.detail}</p>
                        {card.subtitle && (
                          <p className="text-xs text-muted-foreground/70 mt-2 italic">{card.subtitle}</p>
                        )}
                      </CardContent>
                    </div>
                  </CollapsibleTrigger>

                  {hasLeaderboard && (
                    <CollapsibleContent>
                      <CardContent className="pt-0 pb-4">
                        <div className="border-t border-border/60 pt-3 space-y-1.5">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Top 10</p>
                          {lb.map((entry, i) => (
                            <div key={`${entry.name}-${i}`} className="flex items-center gap-2 text-sm">
                              <span className={cn(
                                "w-6 text-center font-bold text-xs rounded-full py-0.5",
                                i === 0 && "bg-primary/15 text-primary",
                                i === 1 && "bg-muted text-muted-foreground",
                                i === 2 && "bg-muted text-muted-foreground",
                                i > 2 && "text-muted-foreground"
                              )}>
                                {i + 1}
                              </span>
                              <span className="flex-1 truncate text-foreground">{entry.name}</span>
                              <span className="font-semibold text-foreground tabular-nums">
                                {entry.value} <span className="text-xs text-muted-foreground font-normal">{card.unit}</span>
                              </span>
                              {entry.detail && (
                                <span className="text-xs text-muted-foreground hidden sm:inline truncate max-w-[120px]">({entry.detail})</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </CollapsibleContent>
                  )}
                </Card>
              </Collapsible>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Stats;

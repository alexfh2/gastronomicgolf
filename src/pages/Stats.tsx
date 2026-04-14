import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Trophy, TrendingUp, Award, Repeat, ChevronDown, ArrowUpRight, Mountain, CircleDot, Bird } from 'lucide-react';
import { cn } from '@/lib/utils';

type LeaderboardEntry = { name: string; value: number; detail?: string };
type HoleAggregate = { totalOverPar: number; count: number; parCounts: Record<string, number> };
type CourseAggregate = {
  displayName: string;
  scores: number[];
  holes: Map<number, HoleAggregate>;
};

const COURSE_STOPWORDS = new Set(['golf', 'club', 'de', 'del', 'la', 'el', 'los', 'las']);

const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const getCourseKey = (name: string) => {
  const normalized = normalizeText(name);
  const significantTokens = normalized
    .split(' ')
    .filter(token => token && !COURSE_STOPWORDS.has(token))
    .map(token => token.slice(0, 4));

  return significantTokens.join('-') || normalized.replace(/\s+/g, '-') || 'desconegut';
};

const pickDisplayName = (current: string | undefined, candidate: string) => {
  if (!current) return candidate;
  if (candidate.length > current.length) return candidate;
  return current;
};

const getHoleScores = (value: any): number[] => {
  if (Array.isArray(value?.scores)) return value.scores.map(Number);
  if (Array.isArray(value)) return value.map(Number);
  return [];
};

const getMostCommonPar = (parCounts: Record<string, number>) => {
  const topPar = Object.entries(parCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
  return Number(topPar || 0);
};

const Stats = () => {
  const { t } = useTranslation();
  const [openCards, setOpenCards] = useState<Set<number>>(new Set());

  const toggleCard = (idx: number) => {
    setOpenCards(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
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

    const byPlayer = new Map<string, { name: string; stableford: number[]; birdies: number; rounds: { name: string; number: number; pts: number }[] }>();

    for (const r of results) {
      const name = (r.players as any)?.name || 'Desconegut';
      const pid = r.player_id;
      if (!byPlayer.has(pid)) {
        byPlayer.set(pid, { name, stableford: [], birdies: 0, rounds: [] });
      }
      const player = byPlayer.get(pid)!;

      // Count birdies from scorecard vs course_par
      const pars = getHoleScores((r.rounds as any)?.course_par);
      const scores = getHoleScores(r.scorecard);
      for (let h = 0; h < Math.min(scores.length, pars.length); h++) {
        if (pars[h] > 0 && scores[h] > 0 && scores[h] <= pars[h] - 1) {
          player.birdies++;
        }
      }

      if (r.stableford_points != null) {
        player.stableford.push(r.stableford_points);
        player.rounds.push({
          name: (r.rounds as any)?.name || '',
          number: (r.rounds as any)?.round_number || 0,
          pts: r.stableford_points,
        });
      }
    }

    const players = Array.from(byPlayer.entries());

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

    const avgList: LeaderboardEntry[] = [];
    for (const [, player] of players) {
      if (player.stableford.length >= 2) {
        const avg = player.stableford.reduce((a, b) => a + b, 0) / player.stableford.length;
        avgList.push({
          name: player.name,
          value: Math.round(avg * 10) / 10,
          detail: `${player.stableford.length} jornades`,
        });
      }
    }
    avgList.sort((a, b) => b.value - a.value);
    const top10Avg = avgList.slice(0, 10);

    const regList: LeaderboardEntry[] = [];
    for (const [, player] of players) {
      regList.push({ name: player.name, value: player.stableford.length });
    }
    regList.sort((a, b) => b.value - a.value);
    const top10Reg = regList.slice(0, 10);

    const birdieList: LeaderboardEntry[] = [];
    for (const [, player] of players) {
      if (player.birdies > 0) {
        birdieList.push({ name: player.name, value: player.birdies });
      }
    }
    birdieList.sort((a, b) => b.value - a.value);
    const top10Birdies = birdieList.slice(0, 10);

    const roundNumbers = new Set<number>();
    for (const [, player] of players) {
      for (const round of player.rounds) roundNumbers.add(round.number);
    }
    const sortedRoundNums = Array.from(roundNumbers).sort((a, b) => a - b);

    const climbList: LeaderboardEntry[] = [];
    if (sortedRoundNums.length >= 2) {
      for (let i = 1; i < sortedRoundNums.length; i++) {
        const prevRoundNum = sortedRoundNums[i - 1];
        const currRoundNum = sortedRoundNums[i];

        const prevTotals: { pid: string; name: string; total: number }[] = [];
        const currTotals: { pid: string; name: string; total: number }[] = [];

        for (const [pid, player] of players) {
          const prevSum = player.rounds.filter(round => round.number <= prevRoundNum).reduce((sum, round) => sum + round.pts, 0);
          const currSum = player.rounds.filter(round => round.number <= currRoundNum).reduce((sum, round) => sum + round.pts, 0);

          if (player.rounds.some(round => round.number <= prevRoundNum)) {
            prevTotals.push({ pid, name: player.name, total: prevSum });
          }
          if (player.rounds.some(round => round.number <= currRoundNum)) {
            currTotals.push({ pid, name: player.name, total: currSum });
          }
        }

        prevTotals.sort((a, b) => b.total - a.total);
        currTotals.sort((a, b) => b.total - a.total);

        const prevRank = new Map(prevTotals.map((entry, idx) => [entry.pid, idx + 1]));
        const currRank = new Map(currTotals.map((entry, idx) => [entry.pid, idx + 1]));

        const firstPlayer = players[0]?.[1];
        const roundName = firstPlayer?.rounds.find(round => round.number === currRoundNum)?.name || `J${currRoundNum}`;

        for (const [pid, currentRank] of currRank) {
          const previousRank = prevRank.get(pid);
          if (previousRank != null) {
            const climb = previousRank - currentRank;
            if (climb > 0) {
              climbList.push({
                name: byPlayer.get(pid)?.name || '',
                value: climb,
                detail: `${roundName} (${previousRank}→${currentRank})`,
              });
            }
          }
        }
      }
    }
    climbList.sort((a, b) => b.value - a.value);
    const top10Climb = climbList.slice(0, 10);

    const courseAggregates = new Map<string, CourseAggregate>();

    for (const r of results) {
      const rawCourseName = (r.rounds as any)?.course || (r.rounds as any)?.club || '';
      if (!rawCourseName) continue;

      const courseKey = getCourseKey(rawCourseName);
      const courseAggregate = courseAggregates.get(courseKey) ?? {
        displayName: rawCourseName,
        scores: [],
        holes: new Map<number, HoleAggregate>(),
      };

      courseAggregate.displayName = pickDisplayName(courseAggregate.displayName, rawCourseName);

      if (r.stableford_points != null) {
        courseAggregate.scores.push(r.stableford_points);
      }

      const pars = getHoleScores((r.rounds as any)?.course_par);
      const scores = getHoleScores(r.scorecard);

      for (let h = 0; h < Math.min(scores.length, pars.length); h++) {
        if (isNaN(pars[h]) || pars[h] === 0) continue;

        const holeAggregate = courseAggregate.holes.get(h + 1) ?? {
          totalOverPar: 0,
          count: 0,
          parCounts: {},
        };

        const holeScore = !scores[h] || isNaN(scores[h]) || scores[h] === 0 ? pars[h] + 4 : scores[h];
        holeAggregate.totalOverPar += holeScore - pars[h];
        holeAggregate.count += 1;
        holeAggregate.parCounts[String(pars[h])] = (holeAggregate.parCounts[String(pars[h])] || 0) + 1;

        courseAggregate.holes.set(h + 1, holeAggregate);
      }

      courseAggregates.set(courseKey, courseAggregate);
    }

    const courseList: LeaderboardEntry[] = Array.from(courseAggregates.values())
      .filter(course => course.scores.length > 0)
      .map(course => ({
        name: course.displayName,
        value: Math.round((course.scores.reduce((a, b) => a + b, 0) / course.scores.length) * 10) / 10,
        detail: '',
      }));

    const coursesByDifficulty = [...courseList].sort((a, b) => a.value - b.value);
    const top10Courses = coursesByDifficulty.slice(0, 10);

    const holeList: { name: string; avgStrokes: number; avgOver: number; par: number }[] = [];
    for (const [, course] of courseAggregates) {
      for (const [holeNum, hole] of course.holes) {
        if (hole.count < 3) continue;

        const par = getMostCommonPar(hole.parCounts);
        const avgOver = hole.totalOverPar / hole.count;
        const avgStrokes = par + avgOver;
        holeList.push({
          name: `Forat ${holeNum} (${course.displayName})`,
          avgStrokes: Math.round(avgStrokes * 100) / 100,
          avgOver,
          par,
        });
      }
    }

    const hardestHoles: LeaderboardEntry[] = [...holeList]
      .sort((a, b) => b.avgOver - a.avgOver)
      .slice(0, 10)
      .map(hole => ({
        name: hole.name,
        value: hole.avgStrokes,
        detail: `Par ${hole.par}`,
      }));

    const easiestHoles: LeaderboardEntry[] = [...holeList]
      .sort((a, b) => a.avgOver - b.avgOver)
      .slice(0, 10)
      .map(hole => ({
        name: hole.name,
        value: hole.avgStrokes,
        detail: `Par ${hole.par}`,
      }));

    const bestRound = top10BestRound[0] || { name: '—', value: 0, detail: '' };
    const bestAvg = top10Avg[0] || { name: '—', value: 0 };
    const mostReg = top10Reg[0] || { name: '—', value: 0 };
    const bestClimb = top10Climb[0] || { name: '—', value: 0 };
    const topBirdie = top10Birdies[0] || { name: '—', value: 0 };
    const hardestCourse = top10Courses[0] || { name: '—', value: 0 };
    const hardestHole = hardestHoles[0] || { name: '—', value: 0, detail: '' };
    const easiestHole = easiestHoles[0] || { name: '—', value: 0, detail: '' };

    return {
      stats: {
        bestRound,
        bestAvg,
        mostReg,
        bestClimb,
        topBirdie,
        hardestCourse,
        hardestHole,
        easiestHole,
        totalPlayers: players.length,
        totalResults: results.length,
      },
      leaderboards: [top10BestRound, top10Avg, top10Reg, top10Birdies, top10Climb, top10Courses, hardestHoles, easiestHoles, [] as LeaderboardEntry[]],
    };
  }, [results]);

  const statCards = stats
    ? [
        { icon: Trophy, label: t('stats.bestRound'), value: `${stats.bestRound.value} pts`, detail: `${stats.bestRound.name} — ${stats.bestRound.detail}`, subtitle: '', unit: 'pts' },
        { icon: TrendingUp, label: t('stats.avgStableford'), value: `${stats.bestAvg.value} pts`, detail: stats.bestAvg.name, subtitle: '', unit: 'pts' },
        { icon: Repeat, label: t('stats.regularity'), value: `${stats.mostReg.value} jornades`, detail: stats.mostReg.name, subtitle: '', unit: 'jornades' },
        { icon: Bird, label: t('stats.birdies', 'Birdies'), value: `${stats.topBirdie.value}`, detail: stats.topBirdie.name, subtitle: t('stats.birdiesDesc', 'Birdies o millor aconseguits al circuit'), unit: 'birdies' },
        { icon: ArrowUpRight, label: t('stats.biggestClimb', 'Major pujada de rànquing'), value: `+${stats.bestClimb.value} pos.`, detail: `${stats.bestClimb.name}`, subtitle: t('stats.biggestClimbDesc', 'Posicions guanyades al rànquing general després d\'una jornada'), unit: 'pos.' },
        { icon: Mountain, label: t('stats.courseDifficulty', 'Camps per dificultat'), value: `${stats.hardestCourse.value} pts/avg`, detail: `${stats.hardestCourse.name}`, subtitle: t('stats.courseDifficultyDesc', 'Mitjana Stableford per camp (menor = més exigent)'), unit: 'pts' },
        { icon: CircleDot, label: t('stats.hardestHole', 'Forat més difícil'), value: `${stats.hardestHole.value} cops`, detail: `${stats.hardestHole.name} — ${stats.hardestHole.detail || ''}`, subtitle: t('stats.hardestHoleDesc', 'Mitjana de cops per hoyo'), unit: 'cops' },
        { icon: CircleDot, label: t('stats.easiestHole', 'Forat més fàcil'), value: `${stats.easiestHole.value} cops`, detail: `${stats.easiestHole.name} — ${stats.easiestHole.detail || ''}`, subtitle: t('stats.easiestHoleDesc', 'Mitjana de cops per hoyo'), unit: 'cops' },
        { icon: Award, label: t('stats.participation', 'Participació'), value: `${stats.totalPlayers} jugadors`, detail: `${stats.totalResults} resultats totals`, subtitle: '', unit: '' },
      ]
    : [];

  return (
    <div className="container py-8 lg:py-12 animate-fade-in">
      <div className="bg-primary rounded-xl px-5 py-5 mb-8 shadow-md">
        <h1 className="font-display text-3xl font-bold text-primary-foreground">{t('stats.title')}</h1>
        <p className="text-primary-foreground/70 mt-1">{t('common.season')} 2026</p>
      </div>

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
                <Card className={cn('border-border/60 transition-shadow', hasLeaderboard && 'cursor-pointer hover:shadow-md')}>
                  <CollapsibleTrigger asChild disabled={!hasLeaderboard}>
                    <div>
                      <CardHeader className="pb-2 flex-row items-center gap-3 space-y-0 bg-muted/50 rounded-t-lg border-b border-border/30">
                        <card.icon className="h-5 w-5 text-primary" />
                        <CardTitle className="text-sm font-medium text-foreground flex-1">{card.label}</CardTitle>
                        {hasLeaderboard && (
                          <ChevronDown
                            className={cn(
                              'h-4 w-4 text-muted-foreground transition-transform duration-200',
                              isOpen && 'rotate-180',
                            )}
                          />
                        )}
                      </CardHeader>
                      <CardContent>
                        <p className="text-2xl font-semibold tracking-tight text-foreground">{card.value}</p>
                        <p className="text-sm text-muted-foreground mt-1">{card.detail}</p>
                        {card.subtitle && <p className="text-xs text-muted-foreground/70 mt-2 italic">{card.subtitle}</p>}
                      </CardContent>
                    </div>
                  </CollapsibleTrigger>

                  {hasLeaderboard && (
                    <CollapsibleContent>
                      <CardContent className="pt-0 pb-4">
                        <div className="border-t border-border/60 pt-3 space-y-1.5">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Top 10</p>
                          {lb.map((entry, i) => {
                            const isHoleStat = card.unit === 'cops';
                            return (
                              <div key={`${entry.name}-${i}`} className={cn('text-sm', isHoleStat ? 'flex flex-col gap-0.5 py-1.5 border-b border-border/30 last:border-b-0' : 'flex items-start gap-2')}>
                                {isHoleStat ? (
                                  <>
                                    <div className="flex items-center gap-2">
                                      <span
                                        className={cn(
                                          'w-6 text-center font-bold text-xs rounded-full py-0.5 shrink-0',
                                          i === 0 && 'bg-primary/15 text-primary',
                                          i <= 2 && i > 0 && 'bg-muted text-muted-foreground',
                                          i > 2 && 'text-muted-foreground',
                                        )}
                                      >
                                        {i + 1}
                                      </span>
                                      <span className="font-semibold text-foreground tabular-nums">
                                        {entry.value} <span className="text-xs font-normal text-muted-foreground">{card.unit}</span>
                                      </span>
                                      {entry.detail && <span className="text-xs text-muted-foreground">· {entry.detail}</span>}
                                    </div>
                                    <span className="text-xs text-muted-foreground pl-8 leading-snug">{entry.name}</span>
                                  </>
                                ) : (
                                  <>
                                    <span
                                      className={cn(
                                        'w-6 text-center font-bold text-xs rounded-full py-0.5',
                                        i === 0 && 'bg-primary/15 text-primary',
                                        i <= 2 && i > 0 && 'bg-muted text-muted-foreground',
                                        i > 2 && 'text-muted-foreground',
                                      )}
                                    >
                                      {i + 1}
                                    </span>
                                    <span className="flex-1 min-w-0 text-foreground leading-tight">{entry.name}</span>
                                    <span className="font-semibold text-foreground tabular-nums whitespace-nowrap">
                                      {entry.value} <span className="text-xs text-muted-foreground font-normal">{card.unit}</span>
                                    </span>
                                    {entry.detail && <span className="hidden sm:inline text-xs text-muted-foreground whitespace-nowrap">({entry.detail})</span>}
                                  </>
                                )}
                              </div>
                            );
                          })}
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

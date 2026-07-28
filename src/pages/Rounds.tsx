import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, MapPin, Users, ChevronDown, BarChart3, CalendarPlus, CalendarDays } from 'lucide-react';

import { format } from 'date-fns';
import { ca, es } from 'date-fns/locale';
import { fetchPublicCircuitData, publicCircuitDataQueryKey } from '@/lib/publicCircuitData';
import { buildPlayerCategoryHandicapMap } from '@/lib/playerCategoryHandicap';
import { computeScratchStableford } from '@/lib/scratchStableford';
import PlayerProfileDialog from '@/components/PlayerProfileDialog';

const Rounds = ({ mode = 'results' }: { mode?: 'results' | 'calendar' }) => {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'ca' ? ca : es;
  const [expandedRound, setExpandedRound] = useState<string | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [activeResultTab, setActiveResultTab] = useState('hcpLow');
  const [searchParams] = useSearchParams();
  const roundRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const { data: allRounds, isLoading } = useQuery({
    queryKey: ['public-rounds-all', mode],
    queryFn: async () => {
      const { data } = await supabase
        .from('rounds')
        .select('*')
        .order('date', { ascending: true });
      return data || [];
    },
  });

  // Split into played (descending) and upcoming (ascending)
  const today = new Date().toISOString().split('T')[0];
  const isPlayed = (r: NonNullable<typeof allRounds>[number]) => r.date < today || (r.end_date && r.end_date < today);
  const playedRounds = (allRounds || []).filter((r) => isPlayed(r) && r.status === 'published').sort((a, b) => b.date.localeCompare(a.date));
  const upcomingRounds = (allRounds || []).filter((r) => !isPlayed(r)).sort((a, b) => a.date.localeCompare(b.date));
  const rounds = mode === 'calendar' ? upcomingRounds : playedRounds;

  const roundParam = searchParams.get('round');
  useEffect(() => {
    if (mode === 'calendar' || !roundParam || !allRounds?.length) return;
    const target = allRounds.find((r) => r.id === roundParam && r.status === 'published');
    if (!target) return;
    setExpandedRound(target.id);
    setTimeout(() => {
      roundRefs.current[target.id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }, [roundParam, allRounds, mode]);



  const buildIcsContent = (round: any) => {
    const startDate = round.date.replace(/-/g, '');
    const endRaw = round.end_date || round.date;
    const endNext = new Date(endRaw);
    endNext.setDate(endNext.getDate() + 1);
    const endDate = endNext.toISOString().split('T')[0].replace(/-/g, '');
    const title = `${round.name} — Circuit Gastronòmic Golf`;
    const location = [round.club, round.course].filter(Boolean).join(' — ');
    const description = [round.sponsor ? `Patrocinador: ${round.sponsor}` : '', round.is_master ? 'Jornada MASTER (x1.25)' : ''].filter(Boolean).join('\\n');
    return [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Circuit Gastronomic Golf//CA',
      'BEGIN:VEVENT', `DTSTART;VALUE=DATE:${startDate}`, `DTEND;VALUE=DATE:${endDate}`,
      `SUMMARY:${title}`, location ? `LOCATION:${location}` : '', description ? `DESCRIPTION:${description}` : '',
      `UID:${round.id}@gastronomicgolf`, 'END:VEVENT', 'END:VCALENDAR',
    ].filter(Boolean).join('\r\n');
  };

  const downloadIcs = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const downloadAllIcs = () => {
    if (!rounds?.length) return;
    const events = rounds.map(r => {
      const startDate = r.date.replace(/-/g, '');
      const endRaw = r.end_date || r.date;
      const endNext = new Date(endRaw);
      endNext.setDate(endNext.getDate() + 1);
      const endDate = endNext.toISOString().split('T')[0].replace(/-/g, '');
      const title = `${r.name} — Circuit Gastronòmic Golf`;
      const location = [r.club, r.course].filter(Boolean).join(' — ');
      const description = [r.sponsor ? `Patrocinador: ${r.sponsor}` : '', r.is_master ? 'Jornada MASTER (x1.25)' : ''].filter(Boolean).join('\\n');
      return [
        'BEGIN:VEVENT', `DTSTART;VALUE=DATE:${startDate}`, `DTEND;VALUE=DATE:${endDate}`,
        `SUMMARY:${title}`, location ? `LOCATION:${location}` : '', description ? `DESCRIPTION:${description}` : '',
        `UID:${r.id}@gastronomicgolf`, 'END:VEVENT',
      ].filter(Boolean).join('\r\n');
    }).join('\r\n');
    const ics = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Circuit Gastronomic Golf//CA\r\n${events}\r\nEND:VCALENDAR`;
    downloadIcs(ics, 'circuit-gastronomic-golf-2026.ics');
  };

  const { data: roundData } = useQuery({
    queryKey: [...publicCircuitDataQueryKey, 'round-results', expandedRound],
    queryFn: async () => {
      if (!expandedRound) return { results: [], categoryHcpMap: new Map<string, number | null>() };
      const data = await fetchPublicCircuitData();
      const categoryHcpMap = buildPlayerCategoryHandicapMap(data.results as any);
      const getHcp = (r: any) => r.handicap_at_round ?? r.players_public?.current_handicap;
      // Stableford handicap: empate → gana hcp más bajo
      const sortByPointsThenLowHcp = (a: any, b: any) => {
        const diff = (b.stableford_points ?? 0) - (a.stableford_points ?? 0);
        if (diff !== 0) return diff;
        return (getHcp(a) ?? Infinity) - (getHcp(b) ?? Infinity);
      };
      const results = data.results
        .filter((result) => result.round_id === expandedRound)
        .sort(sortByPointsThenLowHcp);
      return { results, categoryHcpMap, sortByPointsThenLowHcp, getHcp };
    },
    enabled: !!expandedRound,
  });

  const roundResults = roundData?.results;
  const categoryHcpMap = roundData?.categoryHcpMap ?? new Map<string, number | null>();
  const getHcp = roundData?.getHcp ?? ((r: any) => r.handicap_at_round ?? r.players_public?.current_handicap);
  const sortByPointsThenLowHcp = roundData?.sortByPointsThenLowHcp ?? ((a: any, b: any) => (b.stableford_points ?? 0) - (a.stableford_points ?? 0));

  const categorizeResults = (results: typeof roundResults) => {
    if (!results) return {};
    const hcpLow = results.filter(r => {
      const hcp = categoryHcpMap.get(r.player_id) ?? r.handicap_at_round ?? ((r as any).players_public)?.current_handicap;
      return hcp != null && hcp <= 15.0;
    }).sort(sortByPointsThenLowHcp);
    const hcpHigh = results.filter(r => {
      const hcp = categoryHcpMap.get(r.player_id) ?? r.handicap_at_round ?? ((r as any).players_public)?.current_handicap;
      return hcp != null && hcp > 15.0;
    }).sort(sortByPointsThenLowHcp);
    const female = results.filter(r => ((r as any).players_public)?.gender === 'F')
      .sort(sortByPointsThenLowHcp);
    const senior = results.filter(r => ((r as any).players_public)?.is_senior)
      .sort(sortByPointsThenLowHcp);
    // Scratch: ranking por Stableford bruto. Empate → gana hcp más alto.
    const scratch = results
      .map(r => ({ ...r, _scratchPts: computeScratchStableford(r.scorecard, (r as any).rounds?.course_par) }))
      .filter(r => r._scratchPts != null)
      .sort((a, b) => {
        const diff = (b._scratchPts ?? 0) - (a._scratchPts ?? 0);
        if (diff !== 0) return diff;
        return (getHcp(b) ?? -Infinity) - (getHcp(a) ?? -Infinity);
      });


    return { hcpLow, hcpHigh, female, senior, scratch };
  };

  const categorized = categorizeResults(roundResults);

  const roundCategories = [
    { key: 'hcpLow', label: 'HCP Baix (≤15)' },
    { key: 'hcpHigh', label: 'HCP Alt (>15)' },
    { key: 'female', label: t('categories.female') },
    { key: 'senior', label: t('categories.senior') },
    { key: 'scratch', label: 'Scratch' },
  ];

  const renderResultsTable = (results: any[], scoreField: 'stableford' | 'scratch' = 'stableford') => {
    if (!results?.length) return <p className="text-muted-foreground text-sm py-4 text-center">{t('common.noData')}</p>;
    const scoreValue = (r: any) =>
      scoreField === 'scratch'
        ? (r._scratchPts ?? computeScratchStableford(r.scorecard, r.rounds?.course_par))
        : r.stableford_points;
    const top3Style = (position: number) => {
      const accentAlpha = position === 1 ? 0.18 : position === 2 ? 0.11 : position === 3 ? 0.06 : 0;
      return position <= 3
        ? { background: `linear-gradient(90deg, hsl(var(--accent) / ${accentAlpha}) 0%, hsl(var(--accent) / ${accentAlpha * 0.4}) 30%, transparent 70%)` }
        : undefined;
    };

    return (
      <>
        {/* ---------- MOBILE: llista compacta ---------- */}
        <div className="sm:hidden">
          <div
            className="grid gap-x-2 py-2 border-b border-border/30 type-table-header"
            style={{ gridTemplateColumns: '32px minmax(0,1fr) 54px' }}
          >
            <span>Pos.</span>
            <span>Jugador</span>
            <span className="text-right">{scoreField === 'scratch' ? 'Scr.' : 'Stbf'}</span>
          </div>
          <ul className="divide-y divide-border/20">
            {results.map((r: any, i: number) => {
              const position = i + 1;
              const isTop3 = position <= 3;
              return (
                <li key={r.id} style={top3Style(position)}>
                  <button
                    type="button"
                    onClick={() => setSelectedPlayerId(r.player_id)}
                    className="w-full grid items-center gap-x-2 min-h-[44px] py-2.5 text-left"
                    style={{ gridTemplateColumns: '32px minmax(0,1fr) 54px' }}
                  >
                    <span className={`font-body text-[13px] font-semibold tabular-nums ${isTop3 ? 'text-accent' : 'text-secondary-foreground'}`}>
                      {position}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-body text-[14px] font-medium text-foreground leading-[1.25] line-clamp-2 break-words">
                        {((r as any).players_public)?.name}
                      </span>
                      {r.handicap_at_round != null && (
                        <span className="block text-[11.5px] leading-tight text-secondary-foreground font-body tabular-nums mt-0.5">
                          Hcp {Number(r.handicap_at_round).toFixed(1)}
                        </span>
                      )}
                    </span>
                    <span className={`text-right font-body font-semibold text-[16px] tabular-nums ${isTop3 ? 'text-accent' : 'text-foreground'}`}>
                      {scoreValue(r) ?? '—'}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {/* ---------- DESKTOP / TABLET ---------- */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr className="type-table-header">
                <th className="text-left py-3 pr-2 w-12 border-b border-border/30">Pos.</th>
                <th className="text-left py-3 border-b border-border/30">{t('common.name')} <span className="font-normal normal-case">(hcp)</span></th>
                <th className="text-right py-3 border-b border-border/30">{scoreField === 'scratch' ? 'Scratch' : 'Stableford'}</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r: any, i: number) => {
                const position = i + 1;
                const isTop3 = position <= 3;
                return (
                  <tr
                    key={r.id}
                    className="border-b border-border/20 last:border-0 hover:bg-muted/20 transition-colors"
                    style={top3Style(position)}
                  >
                    <td className={`py-3 pr-2 font-body text-[14px] font-semibold tabular-nums ${isTop3 ? 'text-accent' : 'text-secondary-foreground'}`}>{position}</td>
                    <td className="py-3">
                      <button type="button" onClick={() => setSelectedPlayerId(r.player_id)} className="flex items-center gap-2 hover:text-accent transition-colors text-left">
                        <div className="h-6 w-6 rounded-full bg-muted/40 flex items-center justify-center shrink-0">
                          <Users className="h-3 w-3 text-secondary-foreground" />
                        </div>
                        <span className="text-[15px] font-body font-medium text-foreground">{((r as any).players_public)?.name}</span>
                        {r.handicap_at_round != null && (
                          <span className="text-[13px] text-secondary-foreground font-body tabular-nums">({Number(r.handicap_at_round).toFixed(1)})</span>
                        )}
                      </button>
                    </td>
                    <td className={`py-3 text-right font-body font-semibold text-[17px] tabular-nums ${isTop3 ? 'text-accent' : 'text-foreground'}`}>{scoreValue(r) ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </>
    );
  };


  return (
    <div className="animate-fade-in">
      <section className="container pt-6 pb-4">
        <div className="flex items-center justify-between gap-3 mb-1.5">
          <div className="flex items-center gap-3">
            <CalendarDays className="h-5 w-5 text-accent/70" strokeWidth={1.5} />
            <h1 className="type-page-title">
              {mode === 'calendar' ? t('nav.calendar') : t('nav.rounds')}
            </h1>
          </div>
          {mode === 'calendar' && (
            <button
              onClick={downloadAllIcs}
              className="flex items-center gap-1.5 px-3 min-h-[44px] type-action-label uppercase tracking-[0.05em] border border-border/60 bg-card/30 text-secondary-foreground hover:border-accent/30 hover:text-foreground transition-all"
            >
              <CalendarPlus className="h-4 w-4" />
              Afegir totes
            </button>
          )}
        </div>
        <p className="type-page-subtitle mb-6">
          {mode === 'calendar' ? t('rounds.calendar') : t('rounds.results')} — {t('common.season')} 2026
        </p>
      </section>


      <section className="container pb-14">
        {isLoading ? (
          <p className="type-body-secondary py-8 text-center">{t('common.loading')}</p>
        ) : !rounds?.length ? (
          <p className="type-body-secondary py-8 text-center">{t('common.noData')}</p>

        ) : (
          <div className="space-y-2">
            {rounds.map((round) => {
              const played = isPlayed(round);
              const hasResults = mode !== 'calendar' && round.status === 'published';
              const isExpanded = expandedRound === round.id;

              return (
                <div key={round.id} ref={(el) => { roundRefs.current[round.id] = el; }} className={`border transition-all ${played ? 'border-accent/20 bg-accent/[0.03]' : 'border-border/50 bg-card/30'}`}>

                  <button
                    onClick={() => hasResults ? setExpandedRound(isExpanded ? null : round.id) : null}
                    className={`w-full text-left px-5 py-4 ${!hasResults ? 'cursor-default' : 'hover:bg-muted/10'}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`font-body text-[12px] font-medium tabular-nums tracking-[0.04em] ${played ? 'text-accent' : 'text-secondary-foreground'}`}>J{round.round_number}</span>
                          <span className={`font-display text-[17px] sm:text-[18px] font-semibold leading-tight ${played ? 'text-foreground' : 'text-secondary-foreground'}`}>{round.name}</span>
                          {round.is_master && (
                            <span className="text-[11px] px-2 py-0.5 border border-accent/40 text-accent font-body font-medium tracking-[0.06em] uppercase">Master</span>
                          )}
                          {played ? (
                            <span className="text-[11px] px-2 py-0.5 border border-accent/30 text-accent font-body font-medium tracking-[0.05em] uppercase">Jugada</span>
                          ) : (
                            <span className="text-[11px] px-2 py-0.5 border border-border/60 text-secondary-foreground font-body font-medium tracking-[0.05em] uppercase">Pendent</span>
                          )}
                          {round.sponsor && (
                            <span className="text-[13px] font-body text-secondary-foreground">· {round.sponsor}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 flex-wrap type-metadata">
                          <span className="flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5" />
                            {format(new Date(round.date), 'dd MMM yyyy', { locale })}
                            {round.end_date && round.end_date !== round.date && (
                              <> — {format(new Date(round.end_date), 'dd MMM yyyy', { locale })}</>
                            )}
                          </span>
                          {round.course && (
                            <span className="flex items-center gap-1.5">
                              <MapPin className="h-3.5 w-3.5" />
                              {round.course}
                            </span>
                          )}
                        </div>

                        {hasResults && (
                          <span className="type-action-label text-accent flex items-center gap-1.5">
                            <BarChart3 className="h-3.5 w-3.5" />
                            Veure resultats
                          </span>
                        )}
                        {!hasResults && played && (
                          <span className="type-metadata italic">Pendent de resultats</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {!played && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              downloadIcs(buildIcsContent(round), `${round.name.replace(/\s+/g, '-').toLowerCase()}.ics`);
                            }}
                            className="p-1.5 hover:bg-muted/30 transition-colors"
                            title="Afegir al calendari"
                          >
                            <CalendarPlus className="h-4 w-4 text-secondary-foreground hover:text-accent transition-colors" />
                          </button>
                        )}
                        {hasResults && (
                          <ChevronDown className={`h-4 w-4 text-secondary-foreground transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                        )}
                      </div>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-border/30 px-5 py-4">
                      <div className="flex items-center gap-2 mb-3 type-metadata">
                        <Users className="h-3.5 w-3.5" />
                        <span>{roundResults?.length || 0} participants</span>
                      </div>

                      {roundResults && roundResults.length > 0 ? (
                        <>
                          {/* Mobile: dropdown selector */}
                          <div className="sm:hidden mb-4">
                            <Select value={activeResultTab} onValueChange={setActiveResultTab}>
                              <SelectTrigger className="w-full h-10 type-action-label uppercase tracking-[0.06em] border border-border/60 bg-card/30 text-secondary-foreground focus:ring-accent focus:ring-offset-0">
                                <SelectValue placeholder={t('common.select')} />
                              </SelectTrigger>
                              <SelectContent className="border border-border/60 bg-card">
                                {roundCategories.map((cat) => (
                                  <SelectItem key={cat.key} value={cat.key} className="type-action-label uppercase tracking-[0.05em]">
                                    {cat.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Desktop: tabs */}
                          <div className="hidden sm:flex flex-wrap gap-2 mb-4">
                            {roundCategories.map((cat) => (
                              <button
                                key={cat.key}
                                onClick={() => setActiveResultTab(cat.key)}
                                className={`px-4 min-h-[44px] type-action-label uppercase tracking-[0.06em] transition-all duration-300 border ${
                                  activeResultTab === cat.key
                                    ? 'border-accent/50 bg-accent/10 text-accent'
                                    : 'border-border/60 bg-card/30 text-secondary-foreground hover:border-accent/30 hover:text-foreground'
                                }`}
                              >
                                {cat.label}
                              </button>
                            ))}
                          </div>

                          {renderResultsTable((categorized as any)[activeResultTab], activeResultTab === 'scratch' ? 'scratch' : 'stableford')}
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
                      )}
                    </div>
                  )}
                </div>
              );

            })}
          </div>
        )}
      </section>

      <PlayerProfileDialog playerId={selectedPlayerId} open={!!selectedPlayerId} onOpenChange={(o) => !o && setSelectedPlayerId(null)} />
    </div>
  );
};

export default Rounds;

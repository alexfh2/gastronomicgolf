import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft } from 'lucide-react';
import { format } from 'date-fns';
import { ca, es } from 'date-fns/locale';
import ScorecardVisual from '@/components/ScorecardVisual';

const PlayerDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'ca' ? ca : es;

  const { data: player } = useQuery({
    queryKey: ['player-detail', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('players')
        .select('*')
        .eq('id', id!)
        .single();
      return data;
    },
    enabled: !!id,
  });

  const { data: results } = useQuery({
    queryKey: ['player-results', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('results')
        .select('*, rounds!inner(name, date, club, round_number, status, is_master, course_par, course_handicap)')
        .eq('player_id', id!)
        .eq('rounds.status', 'published')
        .order('rounds(round_number)');
      return data || [];
    },
    enabled: !!id,
  });

  if (!player) {
    return (
      <div className="container py-8">
        <p className="text-muted-foreground">{t('common.loading')}</p>
      </div>
    );
  }

  return (
    <div className="container py-8 lg:py-12 animate-fade-in">
      <Link to="/jugadors" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="h-4 w-4" />
        {t('players.title')}
      </Link>

      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold">
          {player.name}
          {player.gender === 'F' && <Badge variant="outline" className="ml-2 text-xs">F</Badge>}
          {player.is_senior && <Badge variant="outline" className="ml-2 text-xs">SR</Badge>}
        </h1>
        <div className="flex gap-4 mt-2 text-sm text-muted-foreground">
          {player.club && <span>{player.club}</span>}
          {player.license && <span>Llicència: {player.license}</span>}
          {player.current_handicap != null && <span>HCP: {player.current_handicap}</span>}
        </div>
      </div>

      {/* Summary table */}
      <Card className="border-border/60 mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Resum de jornades</CardTitle>
        </CardHeader>
        <CardContent>
          {results && results.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/40 text-muted-foreground">
                    <th className="text-left py-2.5">Jornada</th>
                    <th className="text-left py-2.5 px-2">Camp</th>
                    <th className="text-left py-2.5 px-2">Data</th>
                    <th className="text-right py-2.5 px-2">HCP</th>
                    <th className="text-right py-2.5">Stableford</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map(r => {
                    const round = r.rounds as any;
                    return (
                      <tr key={r.id} className="border-b border-border/20 last:border-0">
                        <td className="py-2 font-medium">
                          {round?.name}
                          {round?.is_master && <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0 bg-accent/20 text-accent border-0">M</Badge>}
                        </td>
                        <td className="py-2 px-2 text-muted-foreground">{round?.club || '—'}</td>
                        <td className="py-2 px-2 text-muted-foreground">
                          {round?.date ? format(new Date(round.date), 'dd MMM yy', { locale }) : '—'}
                        </td>
                        <td className="py-2 px-2 text-right font-mono text-muted-foreground">{r.handicap_at_round ?? '—'}</td>
                        <td className="py-2 text-right font-mono font-bold text-primary">{r.stableford_points ?? '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t('common.noData')}</p>
          )}
        </CardContent>
      </Card>

      {/* Individual scorecards */}
      <h2 className="font-display text-xl font-semibold mb-4">Targetes</h2>
      <div className="space-y-4">
        {results?.map(r => {
          const round = r.rounds as any;
          const rawScorecard = r.scorecard as any;
          const scorecard: number[] | null = Array.isArray(rawScorecard) ? rawScorecard : rawScorecard?.scores ?? null;

          return (
            <Card key={r.id} className="border-border/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  {round?.name}
                  {round?.is_master && <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-accent/20 text-accent border-0">MASTER</Badge>}
                  <span className="text-sm font-normal text-muted-foreground ml-auto">
                    {round?.date ? format(new Date(round.date), 'dd MMM yyyy', { locale }) : ''}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-6 mb-3 text-sm">
                  <span>Stableford: <strong className="text-primary">{r.stableford_points ?? '—'}</strong></span>
                  <span className="text-muted-foreground">HCP: {r.handicap_at_round ?? '—'}</span>
                </div>

                {scorecard && scorecard.length > 0 ? (
                  <div className="overflow-x-auto">
                    <ScorecardVisual
                      scores={scorecard}
                      par={Array.isArray(round?.course_par) ? round.course_par : undefined}
                      handicap={Array.isArray(round?.course_handicap) ? round.course_handicap : undefined}
                      playerHandicap={r.handicap_at_round}
                    />
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Sense targeta hoyo a hoyo</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default PlayerDetail;

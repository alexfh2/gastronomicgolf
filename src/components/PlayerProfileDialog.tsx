import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
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
    queryKey: ['player-profile-dialog', playerId],
    queryFn: async () => {
      const { data } = await supabase.from('players').select('*').eq('id', playerId!).single();
      return data;
    },
    enabled: !!playerId && open,
  });

  const { data: results } = useQuery({
    queryKey: ['player-profile-dialog-results', playerId],
    queryFn: async () => {
      const { data } = await supabase
        .from('results')
        .select('*, rounds!inner(name, date, club, round_number, status, is_master, course_par, course_handicap)')
        .eq('player_id', playerId!)
        .eq('rounds.status', 'published')
        .order('rounds(round_number)');
      return data || [];
    },
    enabled: !!playerId && open,
  });

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
  const stbScores = (results || []).filter(r => r.stableford_points != null).map(r => r.stableford_points!);
  const avgStb = stbScores.length ? (stbScores.reduce((a, b) => a + b, 0) / stbScores.length).toFixed(1) : '—';
  const bestStb = stbScores.length ? Math.max(...stbScores) : '—';

  const roundsWithScorecard = (results || []).filter(r => {
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <User className="h-5 w-5 text-primary" />
            Fitxa del Jugador
          </DialogTitle>
        </DialogHeader>

        {/* Player header */}
        <div className="bg-muted/40 rounded-lg p-4 flex items-center gap-3 border border-border/40">
          <Avatar className="h-14 w-14 border border-border/40">
            {player.photo_url && <AvatarImage src={player.photo_url} alt={player.name} />}
            <AvatarFallback className="bg-primary/10 text-primary font-semibold">
              {initials(player.name)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h3 className="font-display font-bold text-lg leading-tight truncate">{player.name}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {results?.length || 0} {(results?.length || 0) === 1 ? 'prova disputada' : 'proves disputades'}
              {player.current_handicap != null && <> · Hcp {player.current_handicap}</>}
            </p>
            <div className="flex gap-1 mt-1.5">
              {player.gender === 'F' && <Badge variant="outline" className="text-[10px] px-1.5 py-0">Femení</Badge>}
              {player.is_senior && <Badge variant="outline" className="text-[10px] px-1.5 py-0">Sènior</Badge>}
              {player.club && <span className="text-[10px] text-muted-foreground self-center">{player.club}</span>}
            </div>
          </div>
        </div>

        {/* Statistics */}
        {n > 0 && (
          <div>
            <h4 className="font-display font-semibold text-sm mb-3">Estadístiques</h4>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 bg-muted/30 rounded-lg p-3 border border-border/40">
              {stats.map(s => (
                <div key={s.label} className="text-center">
                  <s.icon className="h-4 w-4 mx-auto text-muted-foreground/60 mb-1" strokeWidth={1.5} />
                  <div className="font-display font-extrabold text-base text-primary tabular-nums">{s.value}</div>
                  <div className="text-[10px] text-muted-foreground leading-tight">{s.label}</div>
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
              {results.map(r => {
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
      </DialogContent>
    </Dialog>
  );
};

export default PlayerProfileDialog;

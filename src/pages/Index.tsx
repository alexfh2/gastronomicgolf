import heroBg from '@/assets/hero-editorial.png';
import sponsors from '@/assets/sponsors-row.png';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Trophy, BarChart3, Calendar, ChevronRight, Users, TrendingUp } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ca, es } from 'date-fns/locale';
import { fetchPublicCircuitData, publicCircuitDataQueryKey } from '@/lib/publicCircuitData';

const Index = () => {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'ca' ? ca : es;

  const { data: rounds } = useQuery({
    queryKey: ['public-rounds-home'],
    queryFn: async () => {
      const { data } = await supabase
        .from('rounds')
        .select('id, name, date, end_date, club, course, sponsor, status, is_master, round_number')
        .eq('status', 'published')
        .order('date', { ascending: true });
      return data || [];
    },
  });

  const { data: topResults } = useQuery({
    queryKey: [...publicCircuitDataQueryKey, 'home-top-results'],
    queryFn: fetchPublicCircuitData,
    select: (data) =>
      [...data.results]
        .filter((result) => result.stableford_points != null)
        .sort((a, b) => (b.stableford_points ?? 0) - (a.stableford_points ?? 0)),
  });

  // Aggregate rankings
  const generalRanking = (() => {
    if (!topResults?.length) return [];
    const agg = new Map<string, { name: string; totalPoints: number; rounds: number; handicap: number | null; playerId: string; lastRound: string | null }>();
    for (const r of topResults) {
      const p = (r as any).players_public;
      if (!p) continue;
      const hcp = r.handicap_at_round ?? p.current_handicap;
      const pts = r.stableford_points ?? 0;
      const roundName = (r as any).rounds?.name ?? null;
      const existing = agg.get(r.player_id);
      if (existing) {
        existing.totalPoints += pts;
        existing.rounds += 1;
        if (hcp != null) existing.handicap = hcp;
        existing.lastRound = roundName;
      } else {
        agg.set(r.player_id, { name: p.name, totalPoints: pts, rounds: 1, handicap: hcp, playerId: r.player_id, lastRound: roundName });
      }
    }
    return Array.from(agg.values()).sort((a, b) => b.totalPoints - a.totalPoints).slice(0, 5);
  })();

  // Stats
  const totalRounds = rounds?.length ?? 0;
  const uniquePlayers = topResults ? new Set(topResults.map(r => r.player_id)).size : 0;
  const totalPoints = topResults ? topResults.reduce((s, r) => s + (r.stableford_points ?? 0), 0) : 0;

  const quickLinks = [
    { icon: Trophy, label: t('home.viewRankings'), desc: 'Consulta la classificació general i per categories', path: '/ranquings' },
    { icon: BarChart3, label: t('home.viewStats'), desc: 'Descobreix dades, gràfics i comparatives del circuit', path: '/estadistiques' },
    { icon: Calendar, label: t('home.calendar', 'Calendari'), desc: 'Consulta les properes jornades i esdeveniments', path: '/jornades' },
  ];

  return (
    <div className="animate-fade-in">
      {/* ——— HERO with sponsors overlay ——— */}
      <section className="relative h-[22vh] overflow-hidden">
        <div className="absolute inset-0">
          <img src={heroBg} alt="" className="w-full h-full object-cover" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-r from-background/70 via-background/40 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent" />

        {/* Sponsors overlay inside hero */}
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center pb-2">
          <img src={sponsors} alt="Patrocinadors" className="max-w-2xl w-full opacity-25 brightness-150" />
        </div>
      </section>

      {/* ——— TEMPORADA + QUICK ACCESS ——— */}
      <section className="container pt-3 pb-4">
        <p className="text-center text-accent font-body font-medium tracking-[0.35em] uppercase mb-4 text-4xl">
          {t('common.season')} 2026
        </p>
        <div className="flex items-center gap-4 mb-4">
          <div className="h-px flex-1 bg-border/60" />
          <h2 className="font-body text-[10px] font-medium tracking-[0.3em] uppercase text-muted-foreground">
            {t('home.quickAccess')}
          </h2>
          <div className="h-px flex-1 bg-border/60" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-4xl mx-auto">
          {quickLinks.map((link) => (
            <Link key={link.path} to={link.path} className="group">
              <div className="border border-border/50 bg-card/30 px-4 py-3 hover:border-accent/30 hover:bg-card/60 transition-all duration-300 flex items-center gap-3">
                <link.icon className="h-4 w-4 text-accent/70 shrink-0" strokeWidth={1.5} />
                <div className="min-w-0">
                  <h3 className="font-body text-xs font-semibold text-foreground tracking-wide">
                    {link.label}
                  </h3>
                  <p className="text-[10px] text-muted-foreground leading-snug truncate">
                    {link.desc}
                  </p>
                </div>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/30 ml-auto shrink-0 group-hover:text-accent/60 transition-colors" />
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ——— RANKING + STATS ——— */}
      <section className="container pb-14">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* General Ranking */}
          <div className="lg:col-span-2 border border-border/50 bg-card/30">
            <div className="flex items-center justify-between px-7 py-5 border-b border-border/40">
              <h3 className="font-body text-[11px] font-medium tracking-[0.25em] uppercase text-foreground">
                Rànquing General
              </h3>
              <Link
                to="/ranquings"
                className="flex items-center gap-1 text-[11px] text-accent/80 font-body font-medium tracking-wider uppercase hover:text-accent transition-colors"
              >
                Veure rànquing complet <ChevronRight className="h-3 w-3" />
              </Link>
            </div>

            <div className="px-7 py-2">
              {/* Table header */}
              <div className="grid grid-cols-[2.5rem_1fr_4rem_5rem_5rem_5rem] gap-2 py-3 border-b border-border/30 text-[10px] text-muted-foreground/70 font-body font-medium tracking-[0.15em] uppercase">
                <span>Pos.</span>
                <span>Jugador</span>
                <span className="text-right">Torneigs</span>
                <span className="text-right">Punts</span>
                <span className="text-right">Mitjana</span>
                <span className="text-right">Últim</span>
              </div>

              {generalRanking.length > 0 ? (
                generalRanking.map((p, i) => (
                  <Link
                    key={p.playerId}
                    to={`/jugadors/${p.playerId}`}
                    className={`grid grid-cols-[2.5rem_1fr_4rem_5rem_5rem_5rem] gap-2 items-center py-3.5 border-b border-border/20 hover:bg-muted/20 transition-colors ${
                      i < 3 ? 'bg-accent/[0.04]' : ''
                    }`}
                  >
                    <span className={`text-sm font-body font-semibold ${i < 3 ? 'text-accent' : 'text-muted-foreground'}`}>
                      {i + 1}
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded-full bg-muted/40 flex items-center justify-center">
                        <Users className="h-3 w-3 text-muted-foreground/60" />
                      </div>
                      <span className="text-sm font-body font-medium text-foreground">{p.name}</span>
                    </div>
                    <span className="text-xs text-muted-foreground text-right font-mono">{p.rounds}</span>
                    <span className={`text-sm text-right font-mono font-bold ${i < 3 ? 'text-accent' : 'text-foreground'}`}>
                      {p.totalPoints.toLocaleString()}
                    </span>
                    <span className="text-xs text-muted-foreground text-right font-mono">
                      {p.rounds > 0 ? (p.totalPoints / p.rounds).toFixed(2) : '—'}
                    </span>
                    <span className="text-right">
                      <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded-sm font-mono ${
                        i < 3
                          ? 'bg-accent/15 text-accent'
                          : 'bg-muted/30 text-muted-foreground'
                      }`}>
                        {i + 1}r
                      </span>
                    </span>
                  </Link>
                ))
              ) : (
                <p className="text-muted-foreground text-sm py-8 text-center">{t('common.noData')}</p>
              )}
            </div>
          </div>

          {/* Stats cards */}
          <div className="flex flex-col gap-4">
            <StatCard
              label="Torneigs disputats"
              value={totalRounds}
              sub="de 10"
              icon={<Calendar className="h-5 w-5" />}
            />
            <StatCard
              label="Jugadors actius"
              value={uniquePlayers}
              icon={<Users className="h-5 w-5" />}
            />
            <StatCard
              label="Punts acumulats"
              value={totalPoints.toLocaleString()}
              icon={<TrendingUp className="h-5 w-5" />}
            />
          </div>
        </div>
      </section>
    </div>
  );
};

function StatCard({ label, value, sub, icon }: { label: string; value: string | number; sub?: string; icon: React.ReactNode }) {
  return (
    <div className="border border-border/50 bg-card/30 p-7 flex flex-col justify-between flex-1">
      <div className="flex items-center justify-between mb-6">
        <span className="font-body text-[10px] font-medium tracking-[0.2em] uppercase text-muted-foreground">
          {label}
        </span>
        <span className="text-accent/50">{icon}</span>
      </div>
      <div>
        <span className="font-display text-4xl font-semibold text-foreground">{value}</span>
        {sub && <span className="ml-2 text-sm text-muted-foreground font-body">{sub}</span>}
      </div>
    </div>
  );
}

export default Index;

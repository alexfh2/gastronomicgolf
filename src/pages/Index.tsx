import heroBg from '@/assets/hero-editorial.png';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Trophy, BarChart3, Calendar, ChevronRight, Users, TrendingUp } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchPublicCircuitData, publicCircuitDataQueryKey } from '@/lib/publicCircuitData';
import PlayerProfileDialog from '@/components/PlayerProfileDialog';

const Index = () => {
  const { t, i18n } = useTranslation();
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

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
      {/* ——— HERO ——— */}
      <section className="relative min-h-[42vh] lg:min-h-[46vh] overflow-hidden flex items-center">
        {/* Background image */}
        <div className="absolute inset-0">
          <img src={heroBg} alt="" className="w-full h-full object-cover object-right-top" />
        </div>
        {/* Gradients — keep top transparent so navbar blends */}
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/75 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-background to-transparent" />

        {/* Hero text — vertically centered, balanced spacing */}
        <div className="relative z-10 container py-10">
          <p className="font-body text-[11px] font-medium tracking-[0.35em] uppercase text-accent/80 mb-3">
            {t('common.season')} 2026
          </p>
          <h1 className="font-display text-5xl lg:text-7xl font-bold text-foreground leading-[0.95] mb-1">
            Gastronòmic Golf
          </h1>
          <p className="font-display text-2xl lg:text-3xl text-accent/70 italic font-light mb-3">
            circuit de golf
          </p>
          <p className="font-body text-sm text-muted-foreground/70 tracking-wide">
            Classificació i seguiment del circuit
          </p>
        </div>
      </section>

      {/* ——— QUICK ACCESS ——— */}
      <section className="container pt-6 pb-4">
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
              <div
                className="relative overflow-hidden border border-border/50 px-5 py-5 sm:px-6 sm:py-5 hover:border-accent/40 transition-all duration-500 flex items-center gap-4"
                style={{
                  background:
                    'linear-gradient(180deg, hsl(var(--card) / 0.55) 0%, hsl(var(--card) / 0.2) 100%)',
                  boxShadow: '0 12px 30px -20px hsl(0 0% 0% / 0.5), inset 0 1px 0 hsl(var(--foreground) / 0.03)',
                }}
              >
                <span aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <link.icon className="h-6 w-6 sm:h-6 sm:w-6 text-accent/80 shrink-0" strokeWidth={1.5} />
                <div className="min-w-0 flex-1">
                  <h3 className="font-body text-base sm:text-sm font-semibold text-foreground tracking-wide">{link.label}</h3>
                  <p className="hidden sm:block text-[11px] text-muted-foreground leading-snug truncate mt-0.5">{link.desc}</p>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground/40 ml-auto shrink-0 group-hover:text-accent/70 group-hover:translate-x-0.5 transition-all" />
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ——— RANKING + STATS ——— */}
      <section className="container pb-14">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* General Ranking */}
          <div
            className="lg:col-span-2 relative overflow-hidden border border-border/50"
            style={{
              background:
                'linear-gradient(180deg, hsl(var(--card) / 0.6) 0%, hsl(var(--card) / 0.25) 100%), radial-gradient(circle at 90% 0%, hsl(var(--accent) / 0.07), transparent 40%)',
              boxShadow: '0 20px 50px -25px hsl(0 0% 0% / 0.6), inset 0 1px 0 hsl(var(--foreground) / 0.04)',
            }}
          >
            <span aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-accent/70 via-accent/30 to-transparent" />
            <div className="flex items-center justify-between px-4 sm:px-7 py-5 border-b border-border/40">
              <h3 className="font-body text-[11px] font-medium tracking-[0.25em] uppercase text-foreground">
                Rànquing General
              </h3>
              <Link
                to="/ranquings"
                className="flex items-center gap-1 text-[11px] text-accent/80 font-body font-medium tracking-wider uppercase hover:text-accent transition-colors"
              >
                <span className="hidden sm:inline">Veure rànquing complet</span>
                <span className="sm:hidden">Veure tot</span>
                <ChevronRight className="h-3 w-3" />
              </Link>
            </div>

            <div className="px-4 sm:px-7 py-2">
              {/* Header row — different columns for mobile vs desktop */}
              <div className="hidden sm:grid grid-cols-[2.5rem_1fr_4rem_5rem_5rem_5rem] gap-2 py-3 border-b border-border/30 text-[10px] text-muted-foreground/70 font-body font-medium tracking-[0.15em] uppercase">
                <span>Pos.</span>
                <span>Jugador</span>
                <span className="text-right">Torneigs</span>
                <span className="text-right">Punts</span>
                <span className="text-right">Mitjana</span>
                <span className="text-right">Últim</span>
              </div>
              <div className="sm:hidden grid grid-cols-[2rem_1fr_4rem] gap-3 py-3 border-b border-border/30 text-[10px] text-muted-foreground/70 font-body font-medium tracking-[0.15em] uppercase">
                <span>Pos.</span>
                <span>Jugador</span>
                <span className="text-right">Punts</span>
              </div>

              {generalRanking.length > 0 ? (
                generalRanking.map((p, i) => (
                  <button
                    key={p.playerId}
                    type="button"
                    onClick={() => setSelectedPlayerId(p.playerId)}
                    className={`w-full text-left grid grid-cols-[2rem_1fr_4rem] sm:grid-cols-[2.5rem_1fr_4rem_5rem_5rem_5rem] gap-3 sm:gap-2 items-center py-4 sm:py-3.5 border-b border-border/20 hover:bg-muted/20 transition-colors ${
                      i < 3 ? 'bg-accent/[0.04]' : ''
                    }`}
                  >
                    <span className={`text-base sm:text-sm font-body font-semibold ${i < 3 ? 'text-accent' : 'text-muted-foreground'}`}>
                      {i + 1}
                    </span>
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="h-7 w-7 sm:h-6 sm:w-6 rounded-full bg-muted/40 flex items-center justify-center shrink-0">
                        <Users className="h-3.5 w-3.5 sm:h-3 sm:w-3 text-muted-foreground/60" />
                      </div>
                      <span className="text-sm font-body font-medium text-foreground truncate">
                        {p.name}
                        {p.handicap != null && (
                          <span className="ml-1.5 text-xs text-muted-foreground font-normal">
                            ({Number(p.handicap).toFixed(1)})
                          </span>
                        )}
                      </span>
                    </div>
                    <span className="hidden sm:inline text-xs text-muted-foreground text-right font-mono">{p.rounds}</span>
                    <span className={`text-base sm:text-sm text-right font-mono font-bold ${i < 3 ? 'text-accent' : 'text-foreground'}`}>
                      {p.totalPoints.toLocaleString()}
                    </span>
                    <span className="hidden sm:inline text-xs text-muted-foreground text-right font-mono">
                      {p.rounds > 0 ? (p.totalPoints / p.rounds).toFixed(2) : '—'}
                    </span>
                    <span className="hidden sm:inline text-right">
                      <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded-sm font-mono ${
                        i < 3 ? 'bg-accent/15 text-accent' : 'bg-muted/30 text-muted-foreground'
                      }`}>
                        {i + 1}r
                      </span>
                    </span>
                  </button>
                ))
              ) : (
                <p className="text-muted-foreground text-sm py-8 text-center">{t('common.noData')}</p>
              )}
            </div>
          </div>

          {/* Stats cards */}
          <div className="flex flex-col gap-4">
            <StatCard label="Torneigs disputats" value={totalRounds} sub="de 17" icon={<Calendar className="h-5 w-5" />} />
            <StatCard label="Jugadors actius" value={uniquePlayers} icon={<Users className="h-5 w-5" />} />
            <StatCard label="Punts acumulats" value={totalPoints.toLocaleString()} icon={<TrendingUp className="h-5 w-5" />} />
          </div>
        </div>
      </section>

      <PlayerProfileDialog
        playerId={selectedPlayerId}
        open={!!selectedPlayerId}
        onOpenChange={(open) => !open && setSelectedPlayerId(null)}
      />
    </div>
  );
};

function StatCard({ label, value, sub, icon }: { label: string; value: string | number; sub?: string; icon: React.ReactNode }) {
  return (
    <div className="group relative overflow-hidden border border-border/50 p-7 flex flex-col justify-between flex-1 transition-all duration-500 hover:border-accent/30"
      style={{
        background:
          'linear-gradient(180deg, hsl(var(--card) / 0.6) 0%, hsl(var(--card) / 0.25) 100%), radial-gradient(circle at 85% 15%, hsl(var(--accent) / 0.1), transparent 55%)',
        boxShadow: '0 20px 50px -25px hsl(0 0% 0% / 0.6), inset 0 1px 0 hsl(var(--foreground) / 0.04)',
      }}
    >
      {/* gold top accent */}
      <span aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-accent/70 via-accent/30 to-transparent" />
      {/* subtle radial highlight on hover */}
      <span aria-hidden className="pointer-events-none absolute -top-20 -right-20 h-48 w-48 rounded-full bg-accent/5 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-700" />

      <div className="relative flex items-center justify-between mb-6">
        <span className="font-body text-[10px] font-medium tracking-[0.2em] uppercase text-muted-foreground">{label}</span>
        <span className="text-accent/60 transition-colors group-hover:text-accent/90">{icon}</span>
      </div>
      <div className="relative">
        <span className="font-display text-4xl font-semibold text-foreground tracking-tight">{value}</span>
        {sub && <span className="ml-2 text-sm text-muted-foreground font-body">{sub}</span>}
      </div>
    </div>
  );
}

export default Index;

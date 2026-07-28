import heroBg from '@/assets/hero-editorial.png';
import sponsorsLine from '@/assets/sponsors/sponsors-line.png';
import sponsorsLineLight from '@/assets/sponsors/sponsors-line-light.png';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Trophy, BarChart3, Calendar, ChevronRight, Users, TrendingUp, Newspaper } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchPublicCircuitData, publicCircuitDataQueryKey } from '@/lib/publicCircuitData';
import { buildPlayerCategoryHandicapMap, buildPlayerLastHandicapMap, categorizeByHandicap } from '@/lib/playerCategoryHandicap';
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

  const { data: latestNews } = useQuery({
    queryKey: ['home-latest-news'],
    queryFn: async () => {
      const { data } = await supabase
        .from('news_drafts')
        .select('id, title, published_at, round_id, rounds(name)')
        .eq('status', 'published')
        .order('published_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const { data: latestNewsPhoto } = useQuery({
    queryKey: ['home-latest-news-photo', latestNews?.round_id],
    enabled: !!latestNews?.round_id,
    queryFn: async () => {
      const { data } = await supabase
        .from('photos')
        .select('url, caption')
        .eq('type', 'news')
        .eq('round_id', latestNews!.round_id!)
        .order('sort_order')
        .limit(1)
        .maybeSingle();
      return data;
    },
  });


  const { data: season } = useQuery({
    queryKey: ['home-season-rules'],
    queryFn: async () => {
      const { data } = await supabase.from('seasons').select('rules_config').eq('active', true).single();
      return data;
    },
  });
  const bestN = (season?.rules_config as any)?.best_n_scores || 8;

  // Last published round: rounds are already fetched & filtered by status = 'published', sorted ascending by date.
  const lastRound = rounds && rounds.length > 0 ? [...rounds].sort((a, b) => b.date.localeCompare(a.date))[0] : null;


  const { data: topResults } = useQuery({
    queryKey: [...publicCircuitDataQueryKey, 'home-top-results'],
    queryFn: fetchPublicCircuitData,
    select: (data) =>
      [...data.results]
        .filter((result) => result.stableford_points != null)
        .sort((a, b) => (b.stableford_points ?? 0) - (a.stableford_points ?? 0)),
  });

  const buildRanking = (cat: 'hcp_low' | 'hcp_high') => {
    if (!topResults?.length) return [];
    // Categoría fijada por el HCP de la primera ronda jugada (consistente con Rankings).
    const categoryHcpMap = buildPlayerCategoryHandicapMap(topResults as any);
    // Para mostrar al lado del nombre: último HCP jugado.
    const lastHcpMap = buildPlayerLastHandicapMap(topResults as any);
    const playerCat = new Map<string, 'hcp_low' | 'hcp_high'>();
    for (const r of topResults) {
      if (playerCat.has(r.player_id)) continue;
      const resolved = categorizeByHandicap(categoryHcpMap.get(r.player_id) ?? null);
      if (resolved) playerCat.set(r.player_id, resolved);
    }

    const agg2 = new Map<string, { name: string; scores: number[]; handicap: number | null; playerId: string; category: string | null }>();
    for (const r of topResults) {
      const p = (r as any).players_public;
      if (!p) continue;
      if (playerCat.get(r.player_id) !== cat) continue;
      const displayHcp = lastHcpMap.get(r.player_id) ?? r.handicap_at_round ?? p.current_handicap;
      const isMaster = (r as any).rounds?.is_master || false;
      const coef = (r as any).rounds?.master_coefficient || 1;
      const weighted = Math.round((r.stableford_points ?? 0) * (isMaster ? coef : 1));
      const existing = agg2.get(r.player_id);
      if (existing) existing.scores.push(weighted);
      else agg2.set(r.player_id, { name: p.name, scores: [weighted], handicap: displayHcp, playerId: r.player_id, category: cat });
    }
    return Array.from(agg2.values())
      .map(a => ({
        ...a,
        totalPoints: [...a.scores].sort((x, y) => y - x).slice(0, bestN).reduce((s, x) => s + x, 0),
        rounds: a.scores.length,
      }))
      .sort((a, b) => b.totalPoints - a.totalPoints)
      .slice(0, 5);
  };

  const rankingLow = buildRanking('hcp_low');
  const rankingHigh = buildRanking('hcp_high');

  const totalRounds = rounds?.length ?? 0;
  const uniquePlayers = topResults ? new Set(topResults.map(r => r.player_id)).size : 0;
  const totalPoints = topResults ? topResults.reduce((s, r) => s + (r.stableford_points ?? 0), 0) : 0;

  const quickLinks = [
    { icon: Calendar, label: t('home.calendar', 'Tornejos'), desc: t('home.tornejosDesc', 'Consulta els tornejos disputats'), path: '/resultats' },
    { icon: BarChart3, label: t('home.viewStats'), desc: t('home.statsDesc', 'Descobreix dades, gràfics i comparatives del circuit'), path: '/estadistiques' },
  ];



  return (
    <div className="animate-fade-in overflow-x-hidden">
      {/* ——— HERO ——— */}
      <section className="relative overflow-hidden flex items-center pt-[80px] pb-12 sm:pt-24 sm:pb-12 lg:min-h-0 lg:pt-20 lg:pb-6">
        {/* Background image — player kept readable on the right */}
        <div className="absolute inset-0">
          <img
            src={heroBg}
            alt=""
            className="w-full h-full object-cover object-[78%_bottom] sm:object-[74%_bottom] opacity-45 saturate-[0.65] sm:opacity-100 sm:saturate-[0.9] sm:contrast-[1.08] sm:brightness-[1.06] sm:scale-[0.88] sm:origin-bottom-right"
          />
        </div>

        {/* Layer 1 — horizontal scrim: dark on the left, clears over the player */}
        <div
          className="absolute inset-0 sm:hidden"
          style={{
            background:
              'linear-gradient(180deg, hsl(var(--background) / 0.92) 0%, hsl(var(--background) / 0.82) 45%, hsl(var(--background) / 0.6) 100%)',
          }}
        />
        <div
          className="absolute inset-0 hidden sm:block"
          style={{
            background:
              'linear-gradient(90deg, hsl(var(--background)) 0%, hsl(var(--background) / 0.94) 28%, hsl(var(--background) / 0.7) 46%, hsl(var(--background) / 0.32) 62%, hsl(var(--background) / 0.08) 76%, hsl(var(--background) / 0) 92%)',
          }}
        />

        {/* Layer 2 — bottom fade for continuity with the section below */}
        <div
          className="absolute inset-x-0 bottom-0 h-1/3 sm:h-2/5"
          style={{
            background:
              'linear-gradient(0deg, hsl(var(--background)) 0%, hsl(var(--background) / 0.75) 30%, hsl(var(--background) / 0.28) 65%, hsl(var(--background) / 0) 100%)',
          }}
        />

        {/* Layer 3 — subtle atmospheric vignette */}
        <div
          aria-hidden
          className="absolute inset-0 hidden sm:block pointer-events-none"
          style={{
            background:
              'radial-gradient(120% 90% at 72% 55%, hsl(var(--background) / 0) 38%, hsl(var(--background) / 0.22) 78%, hsl(var(--background) / 0.45) 100%)',
          }}
        />

        {/* Hero text */}
        <div className="relative z-10 container">
          {/* Bloc textual del hero — només desktop/tablet. Sense lockup de marca:
              el logo del header és l'única presència principal de marca. */}
          <div className="hidden sm:block">
            <p className="font-brand text-[2rem] lg:text-[2.6rem] leading-[1.05] text-foreground font-normal tracking-tight mt-2.5">
              {t('common.season')} <span className="text-accent">2026</span>
            </p>
          </div>

          {/* Títol de temporada visible només a mòbil */}
          <div className="sm:hidden mb-5">
            <p className="font-brand text-[1.85rem] leading-[1.1] text-foreground font-normal tracking-tight">
              {t('common.season')} <span className="text-accent">2026</span>
            </p>
          </div>


          <div className="mt-0 sm:mt-8 lg:mt-9 max-w-2xl space-y-4 sm:space-y-3.5">

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-3.5">
              {lastRound && (
                <HeroAccessCard
                  to={`/resultats?round=${lastRound.id}`}

                  icon={<Trophy className="h-4 w-4" strokeWidth={1.5} />}
                  eyebrow="Última jornada"
                  title={lastRound.name}
                  meta={[
                    lastRound.round_number ? `J${lastRound.round_number}` : null,
                    lastRound.date
                      ? new Date(lastRound.date).toLocaleDateString(i18n.language === 'ca' ? 'ca-ES' : 'es-ES', { day: 'numeric', month: 'short' })
                      : null,
                    (lastRound as any).course || lastRound.club,
                  ].filter(Boolean).join(' · ')}
                  action="Veure resultats"
                />
              )}
              <HeroAccessCard
                to="/ranquings"
                icon={<Trophy className="h-4 w-4" strokeWidth={1.5} />}
                eyebrow="Classificació general"
                title="Hàndicap baix i hàndicap alt"
                meta="Classificació acumulada del circuit"
                action="Veure classificació"
              />
            </div>

          {latestNews && (
            <Link to={`/noticies?article=${latestNews.id}`} className="group block h-full">
              <div className="surface-editorial relative overflow-hidden flex items-stretch h-full min-h-[112px] sm:min-h-[100px]">
                <span aria-hidden className="absolute inset-y-0 left-0 w-[2px] bg-accent opacity-0 group-hover:opacity-60 transition-opacity duration-200 z-10" />
                {latestNewsPhoto?.url ? (
                  <div className="w-[84px] sm:w-[104px] shrink-0 overflow-hidden">
                    <img
                      src={latestNewsPhoto.url}
                      alt={latestNewsPhoto.caption || latestNews.title}
                      loading="lazy"
                      className="h-full w-full object-cover object-center"
                    />
                  </div>
                ) : (
                  <div className="w-[84px] sm:w-[104px] shrink-0 flex items-center justify-center border-r border-border-subtle">
                    <Newspaper className="h-[18px] w-[18px] text-accent" strokeWidth={1.5} />
                  </div>
                )}
                <div className="min-w-0 flex-1 flex items-center gap-4 pl-5 pr-4 py-4 sm:pl-8 sm:pr-6 sm:py-[18px]">
                  <div className="min-w-0 flex-1">
                    <p className="font-body text-[11px] font-semibold tracking-[0.2em] uppercase text-text-secondary mb-1.5 leading-[1.4]">
                      Última notícia
                    </p>
                    <h3 className="font-body text-[16px] sm:text-[17px] font-medium text-foreground leading-[1.35] line-clamp-2 max-w-[42ch]">
                      {latestNews.title}
                    </h3>
                    <p className="text-[13px] text-text-secondary leading-[1.45] truncate mt-1.5 tnum">
                      {[
                        (latestNews.rounds as any)?.name,
                        latestNews.published_at
                          ? new Date(latestNews.published_at).toLocaleDateString(i18n.language === 'ca' ? 'ca-ES' : 'es-ES', { day: 'numeric', month: 'short' })
                          : null,
                      ].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 text-text-tertiary/70 shrink-0 self-center opacity-70 group-hover:opacity-100 group-hover:text-accent group-hover:translate-x-[2px] transition-all duration-200" strokeWidth={1.5} />
                </div>
              </div>
            </Link>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-0 sm:gap-x-5">
            {quickLinks.map((link) => (
              <Link key={link.path} to={link.path} className="group block h-full">
                <div className="surface-quiet relative px-1 py-4 sm:px-1.5 sm:py-[18px] flex items-center gap-3.5 h-full min-h-[72px] sm:min-h-[76px]">
                  <link.icon className="h-4 w-4 text-accent/80 shrink-0 group-hover:text-accent transition-colors duration-200" strokeWidth={1.5} />
                  <div className="min-w-0 flex-1">
                    <h3 className="font-body text-[15px] sm:text-[16px] font-medium text-foreground leading-[1.3]">{link.label}</h3>
                    <p className="text-[12.5px] text-text-secondary leading-[1.45] truncate mt-0.5">{link.desc}</p>
                  </div>
                  <ChevronRight className="h-3 w-3 text-text-tertiary/60 ml-auto shrink-0 group-hover:text-accent group-hover:translate-x-[2px] transition-all duration-200" strokeWidth={1.5} />
                </div>
              </Link>
            ))}
          </div>



          </div>
        </div>
      </section>

      {/* ——— SPONSORS ——— */}
      <section className="container pt-10 pb-10 sm:pt-0 sm:pb-5">
        <div className="max-w-4xl mx-auto">

          <div className="flex items-center gap-4 mb-4 sm:mb-2.5">
            <div className="h-px flex-1 bg-border" />
            <h2 className="font-body text-[12px] font-semibold tracking-[0.16em] uppercase text-text-secondary leading-[1.4]">
              Patrocinadors
            </h2>
            <div className="h-px flex-1 bg-border" />
          </div>
          <img
            src={sponsorsLineLight}
            alt="Patrocinadors: Escampa Hotels, bonÀrea, Santi Pàmies Joiers, Grup Optimotor, Pruna Car Go - Omoda Jaecoo, Tancat de Codorniu, Garmin"
            loading="lazy"
            className="block dark:hidden mx-auto w-full sm:w-[77%] h-auto object-contain opacity-95 hover:opacity-100 transition-opacity duration-200"
          />
          <img
            src={sponsorsLine}
            alt=""
            aria-hidden="true"
            loading="lazy"
            className="hidden dark:block mx-auto w-full sm:w-[77%] h-auto object-contain opacity-100 contrast-[1.06] transition-opacity duration-200"
          />


        </div>
      </section>



      {/* ——— RANKING + STATS ——— */}
      <section className="container pb-16 sm:pb-20 hidden sm:block">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">

          {/* General Ranking */}
          <div className="surface-panel lg:col-span-2 relative overflow-hidden">
            <Tabs defaultValue="low" className="w-full">
              <div className="flex items-center justify-between gap-3 px-4 sm:px-7 pt-2 border-b border-border flex-wrap">
                <TabsList className="bg-transparent border-0 p-0 h-auto gap-1 rounded-none">
                  <CategoryTab value="low">HCP Inferior</CategoryTab>
                  <CategoryTab value="high">HCP Superior</CategoryTab>
                </TabsList>
                <Link
                  to="/ranquings"
                  className="flex items-center gap-1 text-[13px] text-accent font-body font-semibold tracking-[0.06em] uppercase hover:text-border-active transition-colors duration-200 py-3"
                >
                  <span className="hidden sm:inline">Veure rànquing complet</span>
                  <span className="sm:hidden">Veure tot</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </div>


              {(['low', 'high'] as const).map((key) => {
                const list = key === 'low' ? rankingLow : rankingHigh;
                return (
                  <TabsContent key={key} value={key} className="mt-0">
                    <div className="px-3 sm:px-5 py-2">
                      {list.length > 0 ? (
                        list.map((p, i) => (
                          <RankingRow
                            key={p.playerId}
                            position={i + 1}
                            name={p.name}
                            handicap={p.handicap}
                            points={p.totalPoints}
                            rounds={p.rounds}
                            onClick={() => setSelectedPlayerId(p.playerId)}
                          />
                        ))
                      ) : (
                        <p className="text-muted-foreground text-sm py-8 text-center">{t('common.noData')}</p>
                      )}
                    </div>
                  </TabsContent>
                );
              })}
            </Tabs>
          </div>

          {/* Stats cards */}
          <div className="flex flex-col gap-4">
            <StatCard label="TORNEJOS DISPUTATS" value={totalRounds} sub="de 17" icon={<Calendar className="h-5 w-5" />} />
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

/**
 * Category tab — editorial underline marker instead of a generic pill button.
 * Active state combines: soft accent surface + heavier text + 2px bottom marker
 * (never colour alone). Focus ring is distinct from the active state.
 */
function CategoryTab({ value, children }: { value: string; children: React.ReactNode }) {
  return (
    <TabsTrigger
      value={value}
      className="relative rounded-none border-0 bg-transparent shadow-none min-h-[44px] px-3 sm:px-4 pt-2.5 pb-3
        font-body text-[14px] font-medium tracking-[0.08em] uppercase leading-[1.3]
        text-muted-foreground transition-colors duration-200
        hover:bg-surface-hover/60 hover:text-foreground
        data-[state=active]:bg-accent/10 data-[state=active]:text-foreground data-[state=active]:font-semibold data-[state=active]:shadow-none
        focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
    >
      {children}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] bg-accent opacity-0 transition-opacity duration-200 group-data-[state=active]:opacity-100 [[data-state=active]>&]:opacity-100"
      />
    </TabsTrigger>
  );
}

function StatCard({ label, value, sub, icon }: { label: string; value: string | number; sub?: string; icon: React.ReactNode }) {
  return (
    <div className="surface-card group relative overflow-hidden p-7 flex flex-col justify-between flex-1">
      {/* hairline accent rule */}
      <span aria-hidden className="absolute inset-x-0 top-0 h-px bg-accent/50" />

      <div className="relative flex items-center justify-between mb-6 gap-3">
        <span className="font-body text-[14px] font-semibold tracking-[0.1em] uppercase text-foreground leading-[1.3]">{label}</span>
        <span className="text-accent transition-colors duration-200 shrink-0">{icon}</span>
      </div>

      <div className="relative">
        <span className="font-display text-4xl font-semibold text-foreground tracking-tight">{value}</span>
        {sub && <span className="ml-2 text-sm text-muted-foreground font-body">{sub}</span>}
      </div>
    </div>
  );
}

function HeroAccessCard({
  to,
  icon,
  eyebrow,
  title,
  meta,
  action,
}: {
  to: string;
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  meta?: string;
  action: string;
}) {
  return (
    <Link to={to} className="group block h-full">
      <div className="surface-card relative overflow-hidden px-5 py-4 sm:px-6 sm:py-5 grid grid-cols-[auto_1fr_auto] items-start gap-x-3.5 h-full min-h-[92px] sm:min-h-[112px]">
        <span aria-hidden className="absolute inset-y-0 left-0 w-[2px] bg-accent opacity-0 group-hover:opacity-70 transition-opacity duration-200" />
        {/* icon optically aligned with the eyebrow baseline */}
        <span className="text-accent/85 shrink-0 self-start mt-[3px] group-hover:text-accent transition-colors duration-200">{icon}</span>
        <div className="min-w-0">
          <p className="font-body text-[11px] font-semibold tracking-[0.2em] uppercase text-accent mb-1.5 leading-[1.4]">{eyebrow}</p>
          <p className="font-body text-[16px] sm:text-[17px] font-semibold text-foreground truncate leading-[1.3]">{title}</p>
          {meta && <p className="text-[13px] text-text-secondary truncate mt-1 leading-[1.45] tnum">{meta}</p>}
          <p className="text-[12px] text-text-secondary font-body font-semibold tracking-[0.12em] uppercase mt-2.5 hidden sm:block leading-[1.4] group-hover:text-accent transition-colors duration-200">{action}</p>
        </div>
        <ChevronRight className="h-3.5 w-3.5 text-text-tertiary/70 shrink-0 self-start mt-[3px] opacity-70 group-hover:opacity-100 group-hover:text-accent group-hover:translate-x-[2px] transition-all duration-200" strokeWidth={1.5} />
      </div>

    </Link>
  );
}

function RankingRow({
  position,
  name,
  handicap,
  points,
  rounds,
  onClick,
}: {
  position: number;
  name: string;
  handicap: number | null;
  points: number;
  rounds: number;
  onClick: () => void;
}) {
  const isTop3 = position <= 3;
  // Accent tint intensity (works in both themes); rank is also marked by the left rule.
  const accentAlpha = position === 1 ? 0.14 : position === 2 ? 0.09 : position === 3 ? 0.05 : 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className="relative w-full text-left grid grid-cols-[2.25rem_1fr_auto] sm:grid-cols-[2.5rem_1fr_4rem_5rem_5rem] gap-3 items-center min-h-[44px] py-3.5 border-b border-border hover:bg-surface-hover/60 transition-colors duration-200 overflow-hidden group"
      style={isTop3 ? { backgroundColor: `hsl(var(--accent) / ${accentAlpha})` } : undefined}
    >
      {isTop3 && (
        <span aria-hidden className="absolute left-0 top-1.5 bottom-1.5 w-[2px] bg-accent" />
      )}

      <div className="flex items-center justify-center">
        <span
          className={`text-[14px] font-body font-bold w-7 text-center ${
            isTop3 ? 'text-accent' : 'text-muted-foreground'
          }`}
        >
          {position}
        </span>
      </div>

      <div className="flex items-center gap-2.5 min-w-0">
        <span className={`text-[15px] font-body truncate text-foreground ${isTop3 ? 'font-semibold' : 'font-medium'}`}>
          {name}
          {handicap != null && (
            <span className="ml-1.5 text-[13px] text-muted-foreground font-normal">
              ({Number(handicap).toFixed(1)})
            </span>
          )}
        </span>
      </div>

      <span className="hidden sm:inline text-[13px] text-muted-foreground text-right font-mono">{rounds}</span>
      <span
        className={`text-base sm:text-lg text-right font-mono font-bold ${isTop3 ? 'text-accent' : 'text-foreground'}`}
      >
        {points.toLocaleString()}
      </span>
      <span className="hidden sm:inline text-[13px] text-muted-foreground text-right font-mono">
        {rounds > 0 ? (points / rounds).toFixed(1) : '—'}
      </span>
    </button>

  );
}

export default Index;

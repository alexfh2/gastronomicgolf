import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchPublicCircuitData, publicCircuitDataQueryKey } from '@/lib/publicCircuitData';

const PARTNERS = ['Escampa', 'bonÀrea', 'Grup Optimotor', 'Pruna Car GC', 'Tancat de Codorniu'];

const Index = () => {
  const { t } = useTranslation();

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

  const { data: nextRound } = useQuery({
    queryKey: ['public-next-round-home'],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      const { data } = await supabase
        .from('rounds')
        .select('id, name, date, club, course, round_number')
        .gte('date', today)
        .order('date', { ascending: true })
        .limit(1)
        .maybeSingle();
      return data;
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
    const agg = new Map<string, { name: string; totalPoints: number; rounds: number; playerId: string; perRound: Map<number, number> }>();
    for (const r of topResults) {
      const p = (r as any).players_public;
      if (!p) continue;
      const pts = r.stableford_points ?? 0;
      const roundNum = (r as any).rounds?.round_number ?? 0;
      const existing = agg.get(r.player_id);
      if (existing) {
        existing.totalPoints += pts;
        existing.rounds += 1;
        existing.perRound.set(roundNum, pts);
      } else {
        const perRound = new Map<number, number>();
        perRound.set(roundNum, pts);
        agg.set(r.player_id, { name: p.name, totalPoints: pts, rounds: 1, playerId: r.player_id, perRound });
      }
    }
    return Array.from(agg.values()).sort((a, b) => b.totalPoints - a.totalPoints).slice(0, 5);
  })();

  const bestRound = topResults?.[0];
  const bestRoundPlayer = bestRound ? (bestRound as any).players_public?.name : null;
  const bestRoundCourse = bestRound ? (bestRound as any).rounds?.course || (bestRound as any).rounds?.name : null;

  const avgStableford = (() => {
    if (!topResults?.length) return null;
    const total = topResults.reduce((s, r) => s + (r.stableford_points ?? 0), 0);
    return (total / topResults.length).toFixed(1);
  })();

  const leader = generalRanking[0];

  return (
    <div className="grain animate-fade-in">
      {/* ─────────── HERO ─────────── */}
      <section className="relative overflow-hidden border-b border-white/[0.04]">
        <div
          className="absolute inset-0"
          style={{ background: 'var(--grad-hero)' }}
          aria-hidden
        />
        {/* Mountain silhouette layer */}
        <div
          className="absolute inset-x-0 bottom-0 h-[72%] opacity-90"
          style={{
            background:
              'radial-gradient(ellipse at 50% 10%, hsl(0 0% 100% / 0.08), transparent 40%), linear-gradient(180deg, transparent 0%, hsl(0 0% 0% / 0.22) 40%, hsl(0 0% 0% / 0.6) 100%)',
            clipPath:
              'polygon(0 36%, 10% 26%, 20% 30%, 35% 22%, 49% 28%, 60% 18%, 75% 28%, 90% 22%, 100% 30%, 100% 100%, 0 100%)',
          }}
          aria-hidden
        />
        {/* Foreground hills */}
        <div
          className="absolute inset-x-0 bottom-0 h-[54%] opacity-60"
          style={{
            background:
              'radial-gradient(circle at 20% 70%, hsl(0 0% 100% / 0.08), transparent 14%), radial-gradient(circle at 56% 72%, hsl(0 0% 100% / 0.06), transparent 12%), linear-gradient(180deg, hsl(152 36% 17% / 0.15), hsl(220 14% 4% / 0.32))',
            clipPath:
              'polygon(0 30%, 12% 18%, 22% 22%, 38% 13%, 49% 16%, 60% 12%, 74% 19%, 87% 10%, 100% 18%, 100% 100%, 0 100%)',
          }}
          aria-hidden
        />

        <div className="relative z-10 container flex flex-col items-center text-center pt-32 pb-24 min-h-[760px] justify-center">
          <p className="font-body text-[12px] font-medium uppercase text-cream/85 mb-6" style={{ letterSpacing: '0.42em' }}>
            {t('common.season')} 2026
          </p>

          <div className="crest w-[92px] h-[92px] mb-7" aria-hidden />

          <h1 className="font-display text-6xl md:text-7xl lg:text-[88px] font-semibold leading-[0.95] text-foreground" style={{ textShadow: '0 10px 40px hsl(0 0% 0% / 0.32)' }}>
            Gastronòmic Golf
          </h1>

          <p className="mt-5 max-w-[760px] text-xl md:text-2xl leading-snug text-cream-dark font-light">
            Classificació i seguiment del circuit amb una direcció editorial, selecta i premium.
          </p>

          <div className="mt-9 flex flex-wrap gap-3 justify-center">
            {['Circuit de 8 jornades', 'Rànquing general', 'Estadístiques premium'].map((p) => (
              <span
                key={p}
                className="border border-white/10 bg-white/5 text-cream/90 px-4 py-3 rounded-full text-[12px] uppercase"
                style={{ letterSpacing: '0.16em' }}
              >
                {p}
              </span>
            ))}
          </div>

          {/* Partners strip */}
          <div className="mt-16 w-full max-w-[1120px] border-y border-white/[0.07] bg-white/[0.02] px-6 py-7">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-6 items-center">
              {PARTNERS.map((p) => (
                <span
                  key={p}
                  className="font-display text-2xl md:text-3xl text-cream/70 text-center tracking-tight opacity-90"
                >
                  {p}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─────────── ACCÉS RÀPID ─────────── */}
      <section className="container py-24">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-5 mb-10">
          <div>
            <p className="eyebrow mb-3">Accés ràpid</p>
            <h2 className="font-display text-4xl md:text-5xl font-semibold leading-none">
              Una home més curada
            </h2>
          </div>
          <p className="text-muted-foreground max-w-[520px] leading-relaxed">
            Direcció <span className="italic">private club</span>: panells amplis, materials foscos, serif editorial i jerarquia ceremonial.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Featured: Pròxima jornada */}
          <Link
            to={nextRound ? `/jornades` : '/jornades'}
            className="panel-premium md:col-span-1 lg:col-span-1 p-7 min-h-[230px] block group hover:border-white/10 transition-colors"
            style={{
              background:
                'radial-gradient(circle at 85% 15%, hsl(36 32% 50% / 0.18), transparent 22%), linear-gradient(180deg, hsl(0 0% 100% / 0.02), hsl(0 0% 100% / 0.015)), linear-gradient(135deg, hsl(152 28% 16%), hsl(220 12% 5%) 70%)',
            }}
          >
            <p className="eyebrow mb-3">Pròxima jornada</p>
            <h3 className="font-display text-3xl md:text-4xl font-semibold leading-none mb-3">
              {nextRound?.club || nextRound?.course || nextRound?.name || 'Per anunciar'}
            </h3>
            <p className="text-cream/70 text-sm leading-relaxed max-w-[420px]">
              {nextRound
                ? 'Presentació de camp, data i accés al detall de la jornada amb una composició premium.'
                : 'Aviat es publicarà la pròxima jornada del circuit.'}
            </p>
            <span className="inline-flex items-center gap-2 mt-6 text-cream text-[13px] uppercase tracking-[0.16em]">
              Veure jornada <span className="text-gold-soft">→</span>
            </span>
            {nextRound && (
              <div className="absolute right-7 bottom-6 text-right text-cream-dark">
                <strong className="block font-display text-5xl leading-none">
                  {new Date(nextRound.date).getDate()}
                </strong>
                <span className="block mt-2 text-[11px] uppercase text-muted-foreground" style={{ letterSpacing: '0.14em' }}>
                  {new Date(nextRound.date).toLocaleDateString('ca-ES', { month: 'long', year: 'numeric' })}
                </span>
              </div>
            )}
          </Link>

          {/* Rànquings */}
          <Link to="/ranquings" className="panel-premium p-7 min-h-[230px] block group hover:border-white/10 transition-colors">
            <p className="eyebrow mb-3">Rànquings</p>
            <h3 className="font-display text-3xl md:text-4xl font-semibold leading-none mb-3">
              Classificació general
            </h3>
            <p className="text-cream/70 text-sm leading-relaxed max-w-[420px]">
              Entrada directa al rànquing principal amb una estètica institucional i sofisticada.
            </p>
            <span className="inline-flex items-center gap-2 mt-6 text-cream text-[13px] uppercase tracking-[0.16em]">
              Obrir rànquing <span className="text-gold-soft">→</span>
            </span>
          </Link>

          {/* Estadístiques */}
          <Link to="/estadistiques" className="panel-premium p-7 min-h-[230px] block group hover:border-white/10 transition-colors">
            <p className="eyebrow mb-3">Estadístiques</p>
            <h3 className="font-display text-3xl md:text-4xl font-semibold leading-none mb-3">
              Millor volta · Birdies
            </h3>
            <p className="text-cream/70 text-sm leading-relaxed max-w-[420px]">
              Stats tractades com plaques del circuit, no com widgets genèrics.
            </p>
            <span className="inline-flex items-center gap-2 mt-6 text-cream text-[13px] uppercase tracking-[0.16em]">
              Veure dades <span className="text-gold-soft">→</span>
            </span>
          </Link>
        </div>
      </section>

      {/* ─────────── EDITORIAL NOIR — RANKINGS + STATS ─────────── */}
      <section className="border-y border-white/[0.05] py-24" style={{ background: 'radial-gradient(circle at 20% 0%, hsl(36 32% 50% / 0.05), transparent 25%), linear-gradient(180deg, hsl(220 14% 4%) 0%, hsl(220 14% 6%) 100%)' }}>
        <div className="container">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-5 mb-8">
            <div>
              <p className="eyebrow mb-3">Editorial noir</p>
              <h2 className="font-display text-4xl md:text-5xl font-semibold leading-none">
                Rànquings i stats amb autoritat
              </h2>
            </div>
            <p className="text-muted-foreground max-w-[520px] leading-relaxed">
              Negre profund, línies daurades i taules amb cerimònia.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_0.9fr] gap-6 items-start">
            {/* Ranking table */}
            <div className="panel-noir p-7">
              <div className="flex justify-between items-end gap-5 mb-5">
                <div>
                  <p className="text-muted-foreground text-[12px] uppercase mb-2" style={{ letterSpacing: '0.22em' }}>
                    Classificació general — Temporada 2026
                  </p>
                  <h3 className="font-display text-3xl md:text-4xl font-semibold leading-none">
                    Rànquings
                  </h3>
                </div>
                <Link to="/ranquings" className="text-cream/80 hover:text-gold-soft text-[12px] uppercase tracking-[0.16em] transition-colors">
                  Veure tot →
                </Link>
              </div>

              <table className="w-full text-sm text-cream">
                <thead>
                  <tr>
                    <th className="text-left font-semibold text-[11px] uppercase text-muted-foreground py-3 px-2 border-b border-white/[0.06]" style={{ letterSpacing: '0.22em' }}>Pos.</th>
                    <th className="text-left font-semibold text-[11px] uppercase text-muted-foreground py-3 px-2 border-b border-white/[0.06]" style={{ letterSpacing: '0.22em' }}>Jugador</th>
                    <th className="text-right font-semibold text-[11px] uppercase text-muted-foreground py-3 px-2 border-b border-white/[0.06]" style={{ letterSpacing: '0.22em' }}>Jornades</th>
                    <th className="text-right font-semibold text-[11px] uppercase text-muted-foreground py-3 px-2 border-b border-white/[0.06]" style={{ letterSpacing: '0.22em' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {generalRanking.length > 0 ? generalRanking.map((p, i) => (
                    <tr
                      key={p.playerId}
                      className={i < 3 ? 'bg-gradient-to-r from-[hsl(36_32%_50%/0.14)] to-[hsl(36_32%_50%/0.04)]' : ''}
                    >
                      <td className="py-4 px-2 border-b border-white/[0.05] w-14">
                        <span className="font-display text-3xl font-bold text-gold-soft" style={{ letterSpacing: '-0.04em' }}>
                          {i + 1}
                        </span>
                      </td>
                      <td className="py-4 px-2 border-b border-white/[0.05]">
                        <Link to={`/jugadors/${p.playerId}`} className="block hover:text-gold-soft transition-colors">
                          <strong className="block text-[15px] font-semibold">{p.name}</strong>
                          <span className="block mt-1 text-muted-foreground text-xs">{p.rounds} jornades</span>
                        </Link>
                      </td>
                      <td className="py-4 px-2 border-b border-white/[0.05] text-right text-cream-dark font-mono">
                        {p.rounds}
                      </td>
                      <td className="py-4 px-2 border-b border-white/[0.05] text-right">
                        <span className="font-display text-3xl font-bold" style={{ letterSpacing: '-0.05em' }}>
                          {p.totalPoints}
                        </span>
                      </td>
                    </tr>
                  )) : (
                    <tr><td colSpan={4} className="py-12 text-center text-muted-foreground">{t('common.noData')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Stats side */}
            <div className="grid gap-4">
              <h3 className="font-display text-3xl md:text-4xl font-semibold leading-none mb-1">
                Estadístiques
              </h3>

              <div className="panel-premium p-6">
                <p className="eyebrow">Líder per categoria</p>
                <p className="font-display text-5xl font-bold mt-4" style={{ letterSpacing: '-0.05em' }}>
                  {leader?.totalPoints ?? '—'} <span className="text-2xl text-muted-foreground font-body font-medium">pts</span>
                </p>
                <p className="mt-2 text-muted-foreground text-sm">{leader?.name || '—'} · General</p>
              </div>

              <div className="panel-premium p-6">
                <p className="eyebrow">Millor volta</p>
                <p className="font-display text-5xl font-bold mt-4" style={{ letterSpacing: '-0.05em' }}>
                  {bestRound?.stableford_points ?? '—'} <span className="text-2xl text-muted-foreground font-body font-medium">pts</span>
                </p>
                <p className="mt-2 text-muted-foreground text-sm">
                  {bestRoundPlayer || '—'}{bestRoundCourse ? ` · ${bestRoundCourse}` : ''}
                </p>
              </div>

              <div className="panel-premium p-6">
                <p className="eyebrow">Mitjana stableford</p>
                <p className="font-display text-5xl font-bold mt-4" style={{ letterSpacing: '-0.05em' }}>
                  {avgStableford ?? '—'}
                </p>
                <p className="mt-2 text-muted-foreground text-sm">Circuit 2026 · {topResults?.length ?? 0} resultats</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────── NARRATIVA ─────────── */}
      <section className="container py-24">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-5 mb-10">
          <div>
            <p className="eyebrow mb-3">Narrativa</p>
            <h2 className="font-display text-4xl md:text-5xl font-semibold leading-none">
              Menys corporatiu, més circuit
            </h2>
          </div>
          <p className="text-muted-foreground max-w-[520px] leading-relaxed">
            Capa editorial: paisatge, jornada destacada i un to visual exclusiu.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_0.85fr] gap-5">
          <div className="panel-noir overflow-hidden">
            <div
              className="h-[280px] relative"
              style={{
                background:
                  'linear-gradient(180deg, hsl(220 14% 4% / 0.18), hsl(220 14% 4% / 0.72)), radial-gradient(circle at 70% 25%, hsl(36 32% 50% / 0.16), transparent 22%), linear-gradient(180deg, hsl(152 22% 24%) 0%, hsl(152 22% 12%) 62%, hsl(220 14% 4%) 100%)',
              }}
            />
            <div className="p-7">
              <p className="eyebrow mb-3">Notícia destacada</p>
              <h3 className="font-display text-3xl md:text-4xl font-semibold leading-none mb-3">
                El circuit es viu com una invitació exclusiva
              </h3>
              <p className="text-cream/70 leading-relaxed">
                La clau no és enfosquir-ho tot. És combinar paisatge i emoció a la home, i reservar el noir premium per a rànquings, jugadors i estadístiques.
              </p>
            </div>
          </div>

          <div className="panel-noir p-5">
            {[
              { k: 'Jornades', t: 'Calendari 2026 amb presentació editorial', d: 'Més foto, millor jerarquia, menys caixes convencionals.' },
              { k: 'Jugadors', t: 'Fitxes amb presència i to de club', d: 'Tipografia refinada i numerals ben tractats.' },
              { k: 'Partners', t: 'Patrocinadors integrats, no superposats', d: 'Curació visual, menys sensació de bloc afegit.' },
            ].map((b, i, arr) => (
              <div key={b.k} className={`py-5 px-1 ${i < arr.length - 1 ? 'border-b border-white/[0.06]' : ''}`}>
                <p className="text-gold-soft text-[11px] uppercase" style={{ letterSpacing: '0.2em' }}>{b.k}</p>
                <strong className="block mt-2 text-[18px] text-cream tracking-tight">{b.t}</strong>
                <span className="block mt-2 text-muted-foreground leading-relaxed text-sm">{b.d}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

export default Index;

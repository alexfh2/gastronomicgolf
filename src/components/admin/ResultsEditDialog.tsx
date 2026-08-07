import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Search, Save } from 'lucide-react';
import type { Tables } from '@/integrations/supabase/types';

type Round = Tables<'rounds'>;

interface ResultRow {
  id: string;
  player_id: string;
  handicap_at_round: number | null;
  stableford_points: number | null;
  scratch_score: number | null;
  scorecard: unknown;
  players: { id: string; name: string; license: string; gender: string | null } | null;
}

const toArray = (v: unknown): number[] | null => {
  if (Array.isArray(v)) return v.map((x) => (x == null ? 0 : Number(x)));
  if (v && typeof v === 'object' && Array.isArray((v as { scores?: unknown[] }).scores)) {
    return ((v as { scores: unknown[] }).scores).map((x) => (x == null ? 0 : Number(x)));
  }
  return null;
};

const calcExtraStrokes = (strokeIndex: number, playerHcp: number): number => {
  const playingHcp = Math.round(playerHcp);
  const full = Math.floor(playingHcp / 18);
  const remainder = playingHcp % 18;
  return full + (strokeIndex <= remainder ? 1 : 0);
};

const holeStableford = (gross: number, par: number, strokeIndex: number, hcp: number): number => {
  if (!gross) return 0;
  const diff = gross - calcExtraStrokes(strokeIndex, hcp) - par;
  if (diff <= -3) return 5;
  if (diff === -2) return 4;
  if (diff === -1) return 3;
  if (diff === 0) return 2;
  if (diff === 1) return 1;
  return 0;
};

const ResultsEditDialog = ({ round }: { round: Round }) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [strokes, setStrokes] = useState<string[]>(Array(18).fill(''));
  const [hcp, setHcp] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: results, isLoading } = useQuery({
    queryKey: ['admin-round-results-edit', round.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('results')
        .select('id, player_id, handicap_at_round, stableford_points, scratch_score, scorecard, players(id, name, license, gender)')
        .eq('round_id', round.id);
      if (error) throw error;
      return (data as unknown as ResultRow[]).sort((a, b) =>
        (a.players?.name ?? '').localeCompare(b.players?.name ?? '')
      );
    },
  });

  const par = toArray(round.course_par);
  const strokeIdx = toArray(round.course_handicap);
  const strokeIdxWomen = toArray(round.course_handicap_women);

  const selected = results?.find((r) => r.id === selectedId) ?? null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!results) return [];
    if (!q) return results.slice(0, 40);
    return results.filter(
      (r) =>
        r.players?.name?.toLowerCase().includes(q) ||
        r.players?.license?.toLowerCase().includes(q)
    );
  }, [results, search]);

  const selectPlayer = (r: ResultRow) => {
    setSelectedId(r.id);
    const arr = toArray(r.scorecard) ?? Array(18).fill(0);
    while (arr.length < 18) arr.push(0);
    setStrokes(arr.slice(0, 18).map((v) => (v ? String(v) : '')));
    setHcp(r.handicap_at_round != null ? String(r.handicap_at_round) : '');
  };

  const numericStrokes = strokes.map((s) => (s.trim() === '' ? 0 : Number(s)));
  const playerHcp = hcp.trim() === '' ? null : Number(hcp);

  const effectiveIdx =
    selected?.players?.gender === 'F' && strokeIdxWomen?.length === 18 ? strokeIdxWomen : strokeIdx;

  const computed = useMemo(() => {
    if (!par || par.length !== 18) return { stb: null as number | null, scratch: null as number | null };
    const scratch = numericStrokes.reduce(
      (acc, s, i) => (s ? acc + Math.max(0, 2 - (s - par[i])) : acc),
      0
    );
    const stb =
      playerHcp != null && effectiveIdx?.length === 18
        ? numericStrokes.reduce((acc, s, i) => acc + holeStableford(s, par[i], effectiveIdx[i], playerHcp), 0)
        : null;
    return { stb, scratch };
  }, [numericStrokes.join(','), playerHcp, par?.join(','), effectiveIdx?.join(',')]);

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    const totalStrokes = numericStrokes.reduce((a, b) => a + b, 0);
    const payload: Partial<Tables<'results'>> = {
      handicap_at_round: playerHcp,
      scorecard: totalStrokes > 0 ? numericStrokes : null,
    };
    if (computed.stb != null) payload.stableford_points = computed.stb;
    if (par && par.length === 18 && totalStrokes > 0) payload.scratch_score = computed.scratch;

    const { error } = await supabase.from('results').update(payload).eq('id', selected.id);
    setSaving(false);
    if (error) {
      toast({ title: 'Error en guardar', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Resultat actualitzat', description: selected.players?.name ?? '' });
    queryClient.invalidateQueries({ queryKey: ['admin-round-results-edit', round.id] });
    queryClient.invalidateQueries({ queryKey: ['admin-rounds'] });
  };

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label className="text-xs">Cercar jugador (nom o llicència)</Label>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" placeholder="Ex: Joan Pérez" />
        </div>
      </div>

      {isLoading ? (
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregant resultats...
        </div>
      ) : !results?.length ? (
        <p className="text-xs text-muted-foreground">Aquesta jornada encara no té resultats importats.</p>
      ) : (
        <div className="max-h-48 overflow-y-auto rounded-md border border-border divide-y divide-border/60">
          {filtered.map((r) => (
            <button
              key={r.id}
              onClick={() => selectPlayer(r)}
              className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2 hover:bg-primary/5 ${
                r.id === selectedId ? 'bg-primary/10' : ''
              }`}
            >
              <span className="truncate">{r.players?.name}</span>
              <span className="text-xs text-muted-foreground shrink-0">
                {r.handicap_at_round ?? '—'} · {r.stableford_points ?? '—'} pts
              </span>
            </button>
          ))}
          {!filtered.length && <div className="px-3 py-2 text-xs text-muted-foreground">Cap jugador trobat</div>}
        </div>
      )}

      {selected && (
        <div className="space-y-4 rounded-md border border-border p-3">
          <div className="flex flex-wrap items-end gap-3 justify-between">
            <div>
              <div className="font-semibold text-sm">{selected.players?.name}</div>
              <div className="text-xs text-muted-foreground">Llicència {selected.players?.license}</div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Handicap de la jornada</Label>
              <Input
                type="number"
                step="0.1"
                value={hcp}
                onChange={(e) => setHcp(e.target.value)}
                className="h-8 w-28 text-sm"
              />
            </div>
          </div>

          {(!par || par.length !== 18) && (
            <p className="text-xs text-destructive">
              Aquesta jornada no té el par del camp definit: no es podran recalcular els punts automàticament.
            </p>
          )}

          {[0, 9].map((offset) => (
            <div key={offset} className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="border border-border px-1 py-1 text-left font-semibold w-14">Forat</th>
                    {Array.from({ length: 9 }, (_, i) => (
                      <th key={i} className="border border-border px-1 py-1 text-center font-semibold w-9">
                        {offset + i + 1}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-border px-1 py-1 font-semibold bg-muted/30">Par</td>
                    {Array.from({ length: 9 }, (_, i) => (
                      <td key={i} className="border border-border px-1 py-1 text-center text-muted-foreground">
                        {par?.[offset + i] ?? '–'}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="border border-border px-1 py-1 font-semibold bg-muted/30">Cops</td>
                    {Array.from({ length: 9 }, (_, i) => (
                      <td key={i} className="border border-border p-0">
                        <input
                          type="number"
                          min="1"
                          max="15"
                          className="w-full h-8 text-center text-xs bg-transparent focus:outline-none focus:bg-accent/20"
                          value={strokes[offset + i]}
                          onChange={(e) => {
                            const next = [...strokes];
                            next[offset + i] = e.target.value;
                            setStrokes(next);
                          }}
                          placeholder="–"
                        />
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="border border-border px-1 py-1 font-semibold bg-muted/30">Pts</td>
                    {Array.from({ length: 9 }, (_, i) => (
                      <td key={i} className="border border-border px-1 py-1 text-center">
                        {par && par.length === 18 && playerHcp != null && effectiveIdx?.length === 18
                          ? holeStableford(numericStrokes[offset + i], par[offset + i], effectiveIdx[offset + i], playerHcp)
                          : '–'}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          ))}

          <p className="text-xs text-muted-foreground">
            Deixa la casella buida per marcar una bola aixecada (es mostrarà com “—”).
          </p>

          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span>
              Stableford: <strong>{computed.stb ?? selected.stableford_points ?? '—'}</strong>
            </span>
            <span>
              Scratch: <strong>{computed.scratch ?? selected.scratch_score ?? '—'}</strong>
            </span>
            <span className="text-xs text-muted-foreground">
              Cops totals: {numericStrokes.reduce((a, b) => a + b, 0) || '—'}
            </span>
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Guardar canvis
          </Button>
        </div>
      )}
    </div>
  );
};

export default ResultsEditDialog;

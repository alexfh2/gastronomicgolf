import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Check, X, AlertTriangle, Search, Plus, Trash2 } from 'lucide-react';
import { DialogDescription } from '@/components/ui/dialog';
import type { Tables } from '@/integrations/supabase/types';

type Round = Tables<'rounds'>;

interface ParsedResult {
  position: number;
  name: string;
  license: string;
  gender: string;
  handicap: number | null;
  stableford_points: number | null;
  scratch_score: number | null;
  scores: number[];
  source_url: string;
  _selected: boolean;
  _matched_player_id?: string;
  _url_index?: number;
}

interface Props {
  round: Round;
  onClose: () => void;
}

const RoundResultsImport = ({ round, onClose }: Props) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [urls, setUrls] = useState<string[]>(['']);
  const [format, setFormat] = useState('stableford');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ParsedResult[]>([]);
  const [source, setSource] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);

  const addUrl = () => setUrls(prev => [...prev, '']);
  const removeUrl = (idx: number) => setUrls(prev => prev.filter((_, i) => i !== idx));
  const updateUrl = (idx: number, value: string) =>
    setUrls(prev => prev.map((u, i) => i === idx ? value : u));

  const handleFetch = async () => {
    const validUrls = urls.filter(u => u.trim());
    if (validUrls.length === 0) return;
    setLoading(true);
    setWarnings([]);
    setResults([]);

    try {
      // Fetch all URLs in parallel
      const responses = await Promise.all(
        validUrls.map(async (url, urlIdx) => {
          const { data, error } = await supabase.functions.invoke('parse-results', {
            body: { url: url.trim(), format },
          });
          if (error) throw new Error(`Error URL ${urlIdx + 1}: ${error.message}`);
          if (!data?.success) throw new Error(data?.error || `Error parsing URL ${urlIdx + 1}`);
          return { ...data, urlIdx };
        })
      );

      // Merge results from all URLs, avoiding duplicates by name+license
      const seen = new Map<string, ParsedResult>();
      let detectedSource = '';

      for (const resp of responses) {
        detectedSource = detectedSource || resp.source;
        for (const r of resp.results as ParsedResult[]) {
          const key = (r.license || r.name).toLowerCase();
          const existing = seen.get(key);
          if (existing) {
            // Keep the better result (higher stableford or lower scratch)
            if (r.stableford_points != null && existing.stableford_points != null) {
              if (r.stableford_points > existing.stableford_points) seen.set(key, { ...r, _selected: true, _url_index: resp.urlIdx });
            } else if (r.scratch_score != null && existing.scratch_score != null) {
              if (r.scratch_score < existing.scratch_score) seen.set(key, { ...r, _selected: true, _url_index: resp.urlIdx });
            }
          } else {
            seen.set(key, { ...r, _selected: true, _url_index: resp.urlIdx });
          }
        }
      }

      const parsed = Array.from(seen.values()).sort((a, b) => a.position - b.position);
      setSource(detectedSource);

      // Match players
      const { data: players } = await supabase.from('players').select('id, name, license');
      const w: string[] = [];

      const matched = parsed.map(r => {
        const match = players?.find(
          p => (r.license && p.license === r.license) ||
            p.name.toLowerCase() === r.name.toLowerCase()
        );
        if (!match) w.push(`"${r.name}" no trobat a la base de dades`);
        return { ...r, _matched_player_id: match?.id };
      });

      setResults(matched);
      if (w.length > 0) setWarnings(w);

      const totalResults = responses.reduce((sum, r) => sum + (r.count || 0), 0);
      toast({
        title: `${matched.length} resultats únics (${totalResults} total de ${validUrls.length} URL${validUrls.length > 1 ? 's' : ''})`,
        description: `Font: ${detectedSource}. Revisa abans de guardar.`,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconegut';
      toast({ title: "Error d'importació", description: message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const toggleResult = (idx: number) => {
    setResults(prev => prev.map((r, i) =>
      i === idx ? { ...r, _selected: !r._selected } : r
    ));
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const selected = results.filter(r => r._selected);
      const newPlayers: string[] = [];

      for (const r of selected) {
        if (r._matched_player_id) continue;

        const { data: newPlayer, error } = await supabase
          .from('players')
          .insert({
            name: r.name,
            license: r.license || `AUTO-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            current_handicap: r.handicap,
            initial_handicap: r.handicap,
            gender: r.gender === 'F' ? 'female' : r.gender === 'M' ? 'male' : null,
            is_senior: false,
          })
          .select('id')
          .single();

        if (error) throw new Error(`Error creant jugador "${r.name}": ${error.message}`);
        r._matched_player_id = newPlayer.id;
        newPlayers.push(r.name);
      }

      const payloads = selected.map(r => ({
        round_id: round.id,
        player_id: r._matched_player_id!,
        stableford_points: r.stableford_points,
        scratch_score: r.scratch_score,
        handicap_at_round: r.handicap,
        source_url: r.source_url,
        scorecard: r.scores.length > 0 ? { scores: r.scores } : null,
      }));

      const { error } = await supabase.from('results').insert(payloads);
      if (error) throw error;

      await supabase.from('import_logs').insert({
        round_id: round.id,
        source: source || 'url',
        source_url: urls.filter(u => u.trim()).join(' | '),
        records_imported: selected.length,
        records_skipped: results.length - selected.length,
        skipped_records: results.filter(r => !r._selected).map(r => ({ name: r.name, reason: 'deselected' })),
        status: 'completed',
      });

      return { imported: selected.length, newPlayers };
    },
    onSuccess: ({ imported, newPlayers }) => {
      queryClient.invalidateQueries({ queryKey: ['admin-rounds'] });
      const msg = newPlayers.length > 0
        ? `${imported} resultats importats. ${newPlayers.length} jugadors nous creats.`
        : `${imported} resultats importats.`;
      toast({ title: 'Importació completada', description: msg });
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  return (
    <div className="space-y-4">
      <DialogDescription className="text-sm text-muted-foreground">
        Importa resultats des d'una o més URLs (una per dia de joc). Suporta GolfDirecto i Teeone.
      </DialogDescription>

      {/* URL inputs */}
      <div className="space-y-2">
        <Label className="text-sm font-semibold">URLs dels resultats</Label>
        <p className="text-xs text-muted-foreground">
          Afegeix una URL per cada dia de joc. Els resultats es fusionaran automàticament (millor resultat per jugador).
        </p>
        {urls.map((url, idx) => (
          <div key={idx} className="flex gap-2">
            <Input
              value={url}
              onChange={(e) => updateUrl(idx, e.target.value)}
              placeholder={`URL dia ${idx + 1} — https://www.golfdirecto.com/micro/game/...`}
              className="flex-1"
            />
            {urls.length > 1 && (
              <Button variant="ghost" size="icon" onClick={() => removeUrl(idx)}>
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </Button>
            )}
          </div>
        ))}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={addUrl}>
            <Plus className="h-3 w-3 mr-1" /> Afegir URL
          </Button>
          <Select value={format} onValueChange={setFormat}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="stableford">Stableford</SelectItem>
              <SelectItem value="medal">Medal</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={handleFetch} disabled={loading || urls.every(u => !u.trim())} className="ml-auto">
            <Search className="h-4 w-4 mr-2" />
            {loading ? 'Llegint...' : 'Llegir resultats'}
          </Button>
        </div>
      </div>

      {/* Warnings */}
      {warnings.length > 0 && (
        <Card className="border-yellow-300 bg-yellow-50">
          <CardContent className="py-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-yellow-800 mb-1">
                  {warnings.length} avisos — jugadors nous es crearan automàticament
                </p>
                <ul className="text-xs text-yellow-700 space-y-0.5 max-h-24 overflow-y-auto">
                  {warnings.map((w, i) => (
                    <li key={i}>• {w}</li>
                  ))}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results preview */}
      {results.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">
              {results.filter(r => r._selected).length} / {results.length} resultats seleccionats
              {source && <Badge variant="outline" className="ml-2 text-xs">{source}</Badge>}
            </p>
            <Button
              size="sm"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || results.filter(r => r._selected).length === 0}
            >
              <Check className="h-4 w-4 mr-2" />
              {saveMutation.isPending ? 'Guardant...' : 'Guardar resultats'}
            </Button>
          </div>

          <div className="border rounded-md overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/50 border-b">
                  <th className="p-2 text-left w-8"></th>
                  <th className="p-2 text-left">Pos</th>
                  <th className="p-2 text-left">Jugador</th>
                  <th className="p-2 text-left">Llicència</th>
                  <th className="p-2 text-right">Hcp</th>
                  <th className="p-2 text-right">Pts</th>
                  <th className="p-2 text-center">Estat</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, idx) => (
                  <tr
                    key={idx}
                    className={`border-b last:border-0 ${!r._selected ? 'opacity-40' : ''} ${r._matched_player_id ? '' : 'bg-yellow-50/50'}`}
                  >
                    <td className="p-2">
                      <button
                        onClick={() => toggleResult(idx)}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        {r._selected ? <Check className="h-3 w-3 text-emerald-600" /> : <X className="h-3 w-3" />}
                      </button>
                    </td>
                    <td className="p-2 font-mono">{r.position}</td>
                    <td className="p-2 font-medium">
                      {r.name}
                      {r.gender && <span className="text-muted-foreground ml-1">({r.gender})</span>}
                    </td>
                    <td className="p-2 font-mono text-muted-foreground">{r.license || '—'}</td>
                    <td className="p-2 text-right font-mono">{r.handicap ?? '—'}</td>
                    <td className="p-2 text-right font-mono font-bold">
                      {r.stableford_points ?? r.scratch_score ?? '—'}
                    </td>
                    <td className="p-2 text-center">
                      {r._matched_player_id ? (
                        <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700">Trobat</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-700">Nou</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default RoundResultsImport;

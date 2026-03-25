import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Plus, Pencil, Star, Download, Check, Link2, FileSpreadsheet, Trash2, Globe, Loader2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import RoundResultsImport from '@/components/admin/RoundResultsImport';
import type { Tables, TablesInsert } from '@/integrations/supabase/types';
import type { Database } from '@/integrations/supabase/types';

type Round = Tables<'rounds'>;
type Season = Tables<'seasons'>;
type RoundStatus = Database['public']['Enums']['round_status'];

interface ParsedRound {
  round_number: number;
  name: string;
  club: string;
  sponsor: string;
  dates: string[];
  detail_url: string;
  image_url: string;
}

const statusColors: Record<RoundStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  imported: 'bg-blue-100 text-blue-800',
  review: 'bg-yellow-100 text-yellow-800',
  validated: 'bg-emerald-100 text-emerald-800',
  published: 'bg-accent text-accent-foreground',
};

const statusLabels: Record<RoundStatus, string> = {
  draft: 'Esborrany',
  imported: 'Importada',
  review: 'Revisió',
  validated: 'Validada',
  published: 'Publicada',
};

const AdminRounds = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedSeason, setSelectedSeason] = useState<string>('');

  // Import state
  const [importUrl, setImportUrl] = useState('https://gastronomicgolf.com');
  const [importedRounds, setImportedRounds] = useState<ParsedRound[]>([]);
  const [showImport, setShowImport] = useState(false);
  const [importLoading, setImportLoading] = useState(false);

  // Edit dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRound, setEditingRound] = useState<Round | null>(null);
  const [resultsRound, setResultsRound] = useState<Round | null>(null);
  const [deletingRound, setDeletingRound] = useState<Round | null>(null);
  const [courseUrl, setCourseUrl] = useState('');
  const [extractingPar, setExtractingPar] = useState(false);
  const [form, setForm] = useState({
    name: '', round_number: '', date: '', end_date: '',
    club: '', course: '', sponsor: '', is_master: false,
    status: 'draft' as RoundStatus, season_id: '',
    course_par: '' as string,
  });

  const { data: seasons } = useQuery({
    queryKey: ['admin-seasons-list'],
    queryFn: async () => {
      const { data, error } = await supabase.from('seasons').select('*').order('year', { ascending: false });
      if (error) throw error;
      return data as Season[];
    },
  });

  const activeSeasonId = selectedSeason || seasons?.[0]?.id || '';

  const { data: rounds, isLoading } = useQuery({
    queryKey: ['admin-rounds', activeSeasonId],
    enabled: !!activeSeasonId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rounds')
        .select('*')
        .eq('season_id', activeSeasonId)
        .order('round_number', { ascending: true });
      if (error) throw error;
      return data as Round[];
    },
  });

  // ─── IMPORT FROM URL ───
  const handleImport = async () => {
    if (!importUrl.trim()) return;
    setImportLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('parse-calendar', {
        body: { url: importUrl.trim() },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Error parsing');

      setImportedRounds(data.rounds as ParsedRound[]);
      toast({ title: `${data.rounds.length} jornades detectades`, description: 'Revisa i edita les dades abans de guardar.' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconegut';
      toast({ title: 'Error d\'importació', description: message, variant: 'destructive' });
    } finally {
      setImportLoading(false);
    }
  };

  const updateImportedRound = (index: number, field: string, value: string) => {
    setImportedRounds((prev) =>
      prev.map((r, i) => (i === index ? { ...r, [field]: value } : r))
    );
  };

  const saveImportedRounds = useMutation({
    mutationFn: async () => {
      const payloads: TablesInsert<'rounds'>[] = importedRounds.map((r) => ({
        name: r.name,
        round_number: r.round_number,
        date: r.dates[0] || new Date().toISOString().split('T')[0],
        end_date: r.dates.length > 1 ? r.dates[r.dates.length - 1] : null,
        club: r.club || null,
        course: null,
        sponsor: r.sponsor || null,
        is_master: false,
        master_coefficient: 1.0,
        status: 'draft' as RoundStatus,
        season_id: activeSeasonId,
        external_links: r.detail_url ? [{ url: r.detail_url, label: 'Web' }] : [],
      }));

      const { error } = await supabase.from('rounds').insert(payloads);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-rounds'] });
      toast({ title: `${importedRounds.length} jornades importades!` });
      setImportedRounds([]);
      setShowImport(false);
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  // ─── MANUAL EDIT ───
  const saveMutation = useMutation({
    mutationFn: async () => {
      // Parse course_par from comma-separated string
      let coursePar: number[] | null = null;
      if (form.course_par.trim()) {
        coursePar = form.course_par.split(',').map(v => parseInt(v.trim())).filter(v => !isNaN(v));
        if (coursePar.length !== 18) {
          throw new Error('El par del camp ha de tenir exactament 18 valors');
        }
      }

      const payload: TablesInsert<'rounds'> = {
        name: form.name,
        round_number: parseInt(form.round_number),
        date: form.date,
        end_date: form.end_date || null,
        club: form.club || null,
        course: form.course || null,
        sponsor: form.sponsor || null,
        is_master: form.is_master,
        master_coefficient: form.is_master ? 1.25 : 1.0,
        status: form.status,
        season_id: form.season_id || activeSeasonId,
        course_par: coursePar,
      } as any;
      if (editingRound) {
        const { error } = await supabase.from('rounds').update(payload).eq('id', editingRound.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('rounds').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-rounds'] });
      toast({ title: editingRound ? 'Jornada actualitzada' : 'Jornada creada' });
      setDialogOpen(false);
      setEditingRound(null);
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const openEdit = (round: Round) => {
    setEditingRound(round);
    const parData = (round as any).course_par;
    const parStr = Array.isArray(parData) ? parData.join(', ') : '';
    setForm({
      name: round.name, round_number: String(round.round_number),
      date: round.date, end_date: round.end_date || '',
      club: round.club || '', course: round.course || '',
      sponsor: round.sponsor || '', is_master: round.is_master,
      status: round.status, season_id: round.season_id,
      course_par: parStr,
    });
    setDialogOpen(true);
  };

  const openCreate = () => {
    setEditingRound(null);
    const n = (rounds?.length ?? 0) + 1;
    setForm({
      name: `Jornada ${n}`, round_number: String(n),
      date: '', end_date: '', club: '', course: '', sponsor: '',
      is_master: false, status: 'draft', season_id: activeSeasonId,
      course_par: '',
    });
    setDialogOpen(true);
  };

  const updateField = (key: string, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // ─── DELETE ROUND ───
  const deleteMutation = useMutation({
    mutationFn: async (roundId: string) => {
      // First delete related results
      const { error: resError } = await supabase.from('results').delete().eq('round_id', roundId);
      if (resError) throw resError;
      // Delete import logs
      const { error: logError } = await supabase.from('import_logs').delete().eq('round_id', roundId);
      if (logError) throw logError;
      // Delete photos
      const { error: photoError } = await supabase.from('photos').delete().eq('round_id', roundId);
      if (photoError) throw photoError;
      // Delete news drafts
      const { error: newsError } = await supabase.from('news_drafts').delete().eq('round_id', roundId);
      if (newsError) throw newsError;
      // Finally delete the round
      const { error } = await supabase.from('rounds').delete().eq('id', roundId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-rounds'] });
      toast({ title: 'Jornada eliminada' });
      setDeletingRound(null);
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  // ─── EXTRACT PAR FROM URL ───
  const handleExtractPar = async () => {
    if (!courseUrl.trim()) return;
    setExtractingPar(true);
    try {
      const { data, error } = await supabase.functions.invoke('extract-course-par', {
        body: { url: courseUrl.trim() },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'No s\'ha pogut extreure el par');
      
      const parArray: number[] = data.par;
      updateField('course_par', parArray.join(', '));
      toast({ title: 'Par extret correctament', description: `Par ${parArray.reduce((a: number, b: number) => a + b, 0)} (${parArray.length} forats)` });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconegut';
      toast({ title: 'Error extraient par', description: message, variant: 'destructive' });
    } finally {
      setExtractingPar(false);
    }
  };

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <h1 className="font-display text-2xl font-bold">Jornades</h1>
        <div className="flex items-center gap-2 flex-wrap">
          {seasons && seasons.length > 0 && (
            <Select value={activeSeasonId} onValueChange={setSelectedSeason}>
              <SelectTrigger className="w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {seasons.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.year}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            variant="outline"
            onClick={() => setShowImport(!showImport)}
            disabled={!activeSeasonId}
          >
            <Link2 className="h-4 w-4 mr-2" />
            Importar des d'URL
          </Button>
          <Button onClick={openCreate} disabled={!activeSeasonId}>
            <Plus className="h-4 w-4 mr-2" />
            Manual
          </Button>
        </div>
      </div>

      {/* Import panel */}
      {showImport && (
        <Card className="border-accent/40 bg-accent/5 mb-6">
          <CardContent className="pt-6 space-y-4">
            <div>
              <Label className="text-sm font-semibold">URL del calendari publicat</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Enganxa l'URL de la pàgina amb el calendari de jornades (p. ex. gastronomicgolf.com)
              </p>
              <div className="flex gap-2">
                <Input
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                  placeholder="https://gastronomicgolf.com"
                />
                <Button onClick={handleImport} disabled={importLoading}>
                  <Download className="h-4 w-4 mr-2" />
                  {importLoading ? 'Llegint...' : 'Llegir'}
                </Button>
              </div>
            </div>

            {/* Preview imported rounds */}
            {importedRounds.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">{importedRounds.length} jornades detectades — revisa i edita:</p>
                  <Button
                    size="sm"
                    onClick={() => saveImportedRounds.mutate()}
                    disabled={saveImportedRounds.isPending}
                  >
                    <Check className="h-4 w-4 mr-2" />
                    {saveImportedRounds.isPending ? 'Guardant...' : 'Guardar totes'}
                  </Button>
                </div>

                {importedRounds.map((r, idx) => (
                  <Card key={idx} className="border-border/60">
                    <CardContent className="py-4 space-y-3">
                      <div className="flex items-start gap-3">
                        {r.image_url && (
                          <img
                            src={r.image_url}
                            alt=""
                            className="w-16 h-20 object-cover rounded"
                          />
                        )}
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">J{r.round_number}</Badge>
                            <span className="text-xs text-muted-foreground">
                              {r.dates.join(' · ') || 'Sense dates'}
                            </span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <div>
                              <Label className="text-xs">Nom / Club</Label>
                              <Input
                                value={r.name}
                                onChange={(e) => updateImportedRound(idx, 'name', e.target.value)}
                                className="h-8 text-sm"
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Club</Label>
                              <Input
                                value={r.club}
                                onChange={(e) => updateImportedRound(idx, 'club', e.target.value)}
                                className="h-8 text-sm"
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Patrocinador</Label>
                              <Input
                                value={r.sponsor}
                                onChange={(e) => updateImportedRound(idx, 'sponsor', e.target.value)}
                                className="h-8 text-sm"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* No season message */}
      {!activeSeasonId ? (
        <Card className="border-border/60">
          <CardContent className="p-8 text-center text-muted-foreground">
            Crea primer una temporada per poder afegir jornades.
          </CardContent>
        </Card>
      ) : isLoading ? (
        <p className="text-muted-foreground">Carregant...</p>
      ) : !rounds?.length ? (
        <Card className="border-border/60">
          <CardContent className="p-8 text-center text-muted-foreground">
            No hi ha jornades en aquesta temporada. Importa des d'una URL o crea-les manualment.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rounds.map((round) => (
            <Card key={round.id} className="border-border/60">
              <CardHeader className="flex flex-row items-center justify-between py-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    {round.is_master && <Star className="h-4 w-4 text-accent fill-accent" />}
                    <Badge variant="outline" className="text-xs">J{round.round_number}</Badge>
                    {round.name}
                  </CardTitle>
                  <Badge className={statusColors[round.status]}>
                    {statusLabels[round.status]}
                  </Badge>
                  {round.club && (
                    <span className="text-xs text-muted-foreground">{round.club}</span>
                  )}
                  <span className="text-xs text-muted-foreground">{round.date}</span>
                  {round.end_date && round.end_date !== round.date && (
                    <span className="text-xs text-muted-foreground">→ {round.end_date}</span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" onClick={() => setResultsRound(round)} title="Importar resultats">
                    <FileSpreadsheet className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => openEdit(round)} title="Editar">
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      {/* Edit/Create dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">
              {editingRound ? 'Editar jornada' : 'Nova jornada'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Nom</Label>
                <Input value={form.name} onChange={(e) => updateField('name', e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Número</Label>
                <Input type="number" min="1" value={form.round_number} onChange={(e) => updateField('round_number', e.target.value)} required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Data inici</Label>
                <Input type="date" value={form.date} onChange={(e) => updateField('date', e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Data fi (opcional)</Label>
                <Input type="date" value={form.end_date} onChange={(e) => updateField('end_date', e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Club</Label>
                <Input value={form.club} onChange={(e) => updateField('club', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Camp</Label>
                <Input value={form.course} onChange={(e) => updateField('course', e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Patrocinador</Label>
              <Input value={form.sponsor} onChange={(e) => updateField('sponsor', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Par del camp (18 forats, separats per comes)</Label>
              <Input
                value={form.course_par}
                onChange={(e) => updateField('course_par', e.target.value)}
                placeholder="4, 4, 5, 3, 5, 3, 4, 4, 4, 4, 5, 3, 4, 5, 4, 4, 3, 5"
              />
              <p className="text-xs text-muted-foreground">
                Introdueix el par de cada forat separat per comes (p. ex. 4,4,5,3,...). Necessari per mostrar birdie/par/bogey a les targetes.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Estat</Label>
              <Select value={form.status} onValueChange={(v) => updateField('status', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(statusLabels) as RoundStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>{statusLabels[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.is_master} onCheckedChange={(v) => updateField('is_master', v)} />
              <Label>Prova MASTER (coef. ×1.25)</Label>
            </div>
            <Button type="submit" className="w-full" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Guardant...' : 'Guardar'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Results import dialog */}
      <Dialog open={!!resultsRound} onOpenChange={(open) => !open && setResultsRound(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">
              Importar resultats — {resultsRound?.name}
            </DialogTitle>
          </DialogHeader>
          {resultsRound && (
            <RoundResultsImport
              round={resultsRound}
              onClose={() => setResultsRound(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminRounds;

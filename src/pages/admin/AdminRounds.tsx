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
  DialogTrigger,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Plus, Pencil, Star } from 'lucide-react';
import type { Tables, TablesInsert } from '@/integrations/supabase/types';
import type { Database } from '@/integrations/supabase/types';

type Round = Tables<'rounds'>;
type Season = Tables<'seasons'>;
type RoundStatus = Database['public']['Enums']['round_status'];

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
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRound, setEditingRound] = useState<Round | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<string>('');

  // Form state
  const [form, setForm] = useState({
    name: '',
    round_number: '',
    date: '',
    end_date: '',
    club: '',
    course: '',
    sponsor: '',
    is_master: false,
    status: 'draft' as RoundStatus,
    season_id: '',
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

  const saveMutation = useMutation({
    mutationFn: async () => {
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
      };

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
      closeDialog();
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const openCreate = () => {
    setEditingRound(null);
    const nextNumber = (rounds?.length ?? 0) + 1;
    setForm({
      name: `Jornada ${nextNumber}`,
      round_number: String(nextNumber),
      date: '',
      end_date: '',
      club: '',
      course: '',
      sponsor: '',
      is_master: false,
      status: 'draft',
      season_id: activeSeasonId,
    });
    setDialogOpen(true);
  };

  const openEdit = (round: Round) => {
    setEditingRound(round);
    setForm({
      name: round.name,
      round_number: String(round.round_number),
      date: round.date,
      end_date: round.end_date || '',
      club: round.club || '',
      course: round.course || '',
      sponsor: round.sponsor || '',
      is_master: round.is_master,
      status: round.status,
      season_id: round.season_id,
    });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingRound(null);
  };

  const updateField = (key: string, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <h1 className="font-display text-2xl font-bold">Jornades</h1>
        <div className="flex items-center gap-2">
          {seasons && seasons.length > 0 && (
            <Select value={activeSeasonId} onValueChange={setSelectedSeason}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {seasons.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreate} disabled={!activeSeasonId}>
                <Plus className="h-4 w-4 mr-2" />
                Nova jornada
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="font-display">
                  {editingRound ? 'Editar jornada' : 'Nova jornada'}
                </DialogTitle>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  saveMutation.mutate();
                }}
                className="space-y-4"
              >
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
                  <Label>Estat</Label>
                  <Select value={form.status} onValueChange={(v) => updateField('status', v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
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
        </div>
      </div>

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
            No hi ha jornades en aquesta temporada.
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
                    {round.name}
                  </CardTitle>
                  <Badge className={statusColors[round.status]}>
                    {statusLabels[round.status]}
                  </Badge>
                  {round.club && (
                    <span className="text-xs text-muted-foreground">{round.club}</span>
                  )}
                  <span className="text-xs text-muted-foreground">{round.date}</span>
                </div>
                <Button variant="ghost" size="icon" onClick={() => openEdit(round)}>
                  <Pencil className="h-4 w-4" />
                </Button>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminRounds;

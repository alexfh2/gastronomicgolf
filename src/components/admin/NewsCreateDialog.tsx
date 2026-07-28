import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import type { Tables } from '@/integrations/supabase/types';

interface NewsCreateDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (article: Tables<'news_drafts'>) => void;
}

const NewsCreateDialog = ({ open, onClose, onCreated }: NewsCreateDialogProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [roundId, setRoundId] = useState('');
  const [language, setLanguage] = useState('ca');
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [body, setBody] = useState('');
  const [seoExcerpt, setSeoExcerpt] = useState('');
  const [specialMention, setSpecialMention] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [publish, setPublish] = useState('draft');

  const { data: rounds } = useQuery({
    queryKey: ['admin-rounds-for-news'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rounds')
        .select('id, name, round_number, date')
        .order('round_number', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: open,
  });

  const reset = () => {
    setRoundId('');
    setLanguage('ca');
    setTitle('');
    setSubtitle('');
    setBody('');
    setSeoExcerpt('');
    setSpecialMention('');
    setDate(new Date().toISOString().slice(0, 10));
    setPublish('draft');
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!roundId) throw new Error('Selecciona una jornada');
      if (!title.trim()) throw new Error('El títol és obligatori');
      if (!body.trim()) throw new Error('El cos de la notícia és obligatori');

      const publishedAt =
        publish === 'published'
          ? new Date(`${date}T12:00:00`).toISOString()
          : null;

      const { data, error } = await supabase
        .from('news_drafts')
        .insert({
          round_id: roundId,
          language,
          tone: 'manual',
          title: title.trim(),
          subtitle: subtitle.trim() || null,
          body,
          seo_excerpt: seoExcerpt.trim() || null,
          special_mention: specialMention.trim() || null,
          status: publish,
          published_at: publishedAt,
        })
        .select('*')
        .single();
      if (error) throw error;
      return data as Tables<'news_drafts'>;
    },
    onSuccess: (article) => {
      queryClient.invalidateQueries({ queryKey: ['admin-news'] });
      queryClient.invalidateQueries({ queryKey: ['public-news'] });
      queryClient.invalidateQueries({ queryKey: ['home-latest-news'] });
      toast({ title: 'Notícia creada' });
      reset();
      onClose();
      onCreated?.(article);
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !createMutation.isPending) onClose();
      }}
    >
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova notícia manual</DialogTitle>
          <DialogDescription>
            Crea una notícia sense generació automàtica. Després podràs afegir
            fotografies des de l'edició.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2 sm:col-span-2">
              <Label>Jornada</Label>
              <Select value={roundId} onValueChange={setRoundId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona jornada" />
                </SelectTrigger>
                <SelectContent>
                  {rounds?.map((r: any) => (
                    <SelectItem key={r.id} value={r.id}>
                      J{r.round_number} · {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Idioma</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ca">Català</SelectItem>
                  <SelectItem value="es">Castellà</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-title">Títol</Label>
            <Input
              id="new-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder="Títol de la notícia"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-subtitle">Subtítol</Label>
            <Input
              id="new-subtitle"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              maxLength={250}
              placeholder="Subtítol"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-body">Cos de la notícia</Label>
            <Textarea
              id="new-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={14}
              className="font-body leading-relaxed"
              placeholder="Escriu el contingut de la notícia..."
            />
            <p className="text-xs text-muted-foreground">
              Es respecten els salts de línia i els paràgrafs.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-excerpt">Extracte SEO</Label>
            <Textarea
              id="new-excerpt"
              value={seoExcerpt}
              onChange={(e) => setSeoExcerpt(e.target.value)}
              rows={2}
              maxLength={300}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-mention">Menció especial</Label>
            <Textarea
              id="new-mention"
              value={specialMention}
              onChange={(e) => setSpecialMention(e.target.value)}
              rows={2}
              maxLength={500}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="new-date">Data de publicació</Label>
              <Input
                id="new-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Estat</Label>
              <Select value={publish} onValueChange={setPublish}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Borrador</SelectItem>
                  <SelectItem value="published">Publicada</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose} disabled={createMutation.isPending}>
            Cancel·lar
          </Button>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
          >
            {createMutation.isPending && (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            )}
            Crear i afegir fotos
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default NewsCreateDialog;

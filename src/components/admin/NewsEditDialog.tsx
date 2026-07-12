import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import type { Tables } from '@/integrations/supabase/types';

type NewsDraft = Tables<'news_drafts'>;

interface NewsEditDialogProps {
  article: NewsDraft;
  open: boolean;
  onClose: () => void;
}

const NewsEditDialog = ({ article, open, onClose }: NewsEditDialogProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState(article.title ?? '');
  const [subtitle, setSubtitle] = useState(article.subtitle ?? '');
  const [body, setBody] = useState(article.body ?? '');
  const [seoExcerpt, setSeoExcerpt] = useState(article.seo_excerpt ?? '');
  const [specialMention, setSpecialMention] = useState(article.special_mention ?? '');
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);

  // Reset state when article changes / dialog reopens
  useEffect(() => {
    if (open) {
      setTitle(article.title ?? '');
      setSubtitle(article.subtitle ?? '');
      setBody(article.body ?? '');
      setSeoExcerpt(article.seo_excerpt ?? '');
      setSpecialMention(article.special_mention ?? '');
    }
  }, [open, article]);

  const isDirty =
    (title ?? '') !== (article.title ?? '') ||
    (subtitle ?? '') !== (article.subtitle ?? '') ||
    (body ?? '') !== (article.body ?? '') ||
    (seoExcerpt ?? '') !== (article.seo_excerpt ?? '') ||
    (specialMention ?? '') !== (article.special_mention ?? '');

  const saveMutation = useMutation({
    mutationFn: async () => {
      const trimmedTitle = title.trim();
      const trimmedBody = body.trim();
      if (!trimmedTitle) throw new Error('El títol no pot quedar buit');
      if (!trimmedBody) throw new Error('El cos de la notícia no pot quedar buit');

      const { error } = await supabase
        .from('news_drafts')
        .update({
          title: trimmedTitle,
          subtitle: subtitle.trim() || null,
          body: body,
          seo_excerpt: seoExcerpt.trim() || null,
          special_mention: specialMention.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', article.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-news'] });
      queryClient.invalidateQueries({ queryKey: ['public-news'] });
      queryClient.invalidateQueries({ queryKey: ['home-latest-news'] });
      toast({ title: 'Notícia actualitzada' });
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const handleClose = () => {
    if (isDirty && !saveMutation.isPending) {
      setConfirmDiscardOpen(true);
      return;
    }
    onClose();
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) handleClose();
        }}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar notícia</DialogTitle>
            <DialogDescription>
              Modifica el text de la notícia. L'estat de publicació no canviarà.
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="edit" className="mt-2">
            <TabsList>
              <TabsTrigger value="edit">Editar</TabsTrigger>
              <TabsTrigger value="preview">Vista prèvia</TabsTrigger>
            </TabsList>

            <TabsContent value="edit" className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="news-title">Títol</Label>
                <Input
                  id="news-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Títol de la notícia"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="news-subtitle">Subtítol</Label>
                <Input
                  id="news-subtitle"
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                  placeholder="Subtítol"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="news-body">Cos de la notícia</Label>
                <Textarea
                  id="news-body"
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
                <Label htmlFor="news-excerpt">Extracte SEO</Label>
                <Textarea
                  id="news-excerpt"
                  value={seoExcerpt}
                  onChange={(e) => setSeoExcerpt(e.target.value)}
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="news-mention">Menció especial</Label>
                <Textarea
                  id="news-mention"
                  value={specialMention}
                  onChange={(e) => setSpecialMention(e.target.value)}
                  rows={2}
                />
              </div>
            </TabsContent>

            <TabsContent value="preview" className="pt-4">
              <article className="prose prose-sm max-w-none">
                <h2 className="font-display text-2xl font-semibold text-foreground mb-1">
                  {title || <span className="text-muted-foreground">Sense títol</span>}
                </h2>
                {subtitle && (
                  <p className="text-base text-muted-foreground mb-4">{subtitle}</p>
                )}
                <div className="text-foreground/90 font-body whitespace-pre-wrap leading-relaxed">
                  {body || (
                    <span className="text-muted-foreground">Sense contingut</span>
                  )}
                </div>
                {specialMention && (
                  <div className="mt-4 p-3 rounded border border-accent/30 bg-accent/5">
                    <div className="text-xs uppercase tracking-wide text-accent/80 mb-1">
                      Menció especial
                    </div>
                    <div className="text-sm whitespace-pre-wrap">{specialMention}</div>
                  </div>
                )}
                {seoExcerpt && (
                  <p className="mt-4 text-xs text-muted-foreground italic">
                    SEO: {seoExcerpt}
                  </p>
                )}
              </article>
            </TabsContent>
          </Tabs>

          <DialogFooter className="mt-4">
            <Button variant="ghost" onClick={handleClose} disabled={saveMutation.isPending}>
              Cancel·lar
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !title.trim() || !body.trim()}
            >
              {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Guardar canvis
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDiscardOpen} onOpenChange={setConfirmDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar canvis?</AlertDialogTitle>
            <AlertDialogDescription>
              Tens canvis sense guardar. Si tanques ara, es perdran.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar editant</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmDiscardOpen(false);
                onClose();
              }}
            >
              Descartar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default NewsEditDialog;

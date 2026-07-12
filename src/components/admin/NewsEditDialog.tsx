import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { Loader2, ImagePlus, Trash2, ArrowLeft, ArrowRight, Check } from 'lucide-react';
import type { Tables } from '@/integrations/supabase/types';

type NewsDraft = Tables<'news_drafts'>;
type Photo = Tables<'photos'>;

const ACCEPTED_MIME = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const ACCEPTED_EXT = ['jpg', 'jpeg', 'png', 'webp'];
const MAX_FILE_SIZE_MB = 10;



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

  // ---------- Photos management ----------
  const roundId = article.round_id;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [deletePhotoId, setDeletePhotoId] = useState<string | null>(null);
  const [captions, setCaptions] = useState<Record<string, string>>({});

  const { data: photos } = useQuery({
    queryKey: ['news-photos-admin', roundId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('photos')
        .select('*')
        .eq('round_id', roundId)
        .eq('type', 'news')
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Photo[];
    },
    enabled: open,
  });

  useEffect(() => {
    if (photos) {
      setCaptions((prev) => {
        const next: Record<string, string> = {};
        photos.forEach((p) => {
          next[p.id] = prev[p.id] ?? p.caption ?? '';
        });
        return next;
      });
    }
  }, [photos]);

  const invalidatePhotos = () => {
    queryClient.invalidateQueries({ queryKey: ['news-photos-admin', roundId] });
    queryClient.invalidateQueries({ queryKey: ['news-photos'] });
    queryClient.invalidateQueries({ queryKey: ['public-news'] });
  };

  // Extract storage path from a public URL like
  // {SUPABASE}/storage/v1/object/public/photos/news/{round}/{uuid}.ext
  const getStoragePath = (url: string): string | null => {
    const marker = '/storage/v1/object/public/photos/';
    const i = url.indexOf(marker);
    if (i < 0) return null;
    const path = url.substring(i + marker.length);
    return path || null;
  };

  const normalizeOrder = async (list: Photo[]) => {
    // Update rows whose sort_order changed
    const updates = list
      .map((p, idx) => ({ id: p.id, next: idx, prev: p.sort_order ?? 0 }))
      .filter((u) => u.next !== u.prev);
    for (const u of updates) {
      const { error } = await supabase
        .from('photos')
        .update({ sort_order: u.next })
        .eq('id', u.id);
      if (error) throw error;
    }
  };

  const uploadMutation = useMutation({
    mutationFn: async (files: File[]) => {
      const currentCount = photos?.length ?? 0;
      let sortIdx = currentCount;
      for (const file of files) {
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
        if (!ACCEPTED_EXT.includes(ext) || !ACCEPTED_MIME.includes(file.type)) {
          throw new Error(`Format no acceptat: ${file.name}`);
        }
        if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
          throw new Error(`${file.name} supera ${MAX_FILE_SIZE_MB}MB`);
        }
        const path = `news/${roundId}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage.from('photos').upload(path, file);
        if (upErr) throw upErr;
        const { data: urlData } = supabase.storage.from('photos').getPublicUrl(path);
        const { error: insErr } = await supabase.from('photos').insert({
          round_id: roundId,
          type: 'news',
          category: 'news',
          url: urlData.publicUrl,
          sort_order: sortIdx,
        });
        if (insErr) throw insErr;
        sortIdx += 1;
      }
    },
    onSuccess: () => {
      invalidatePhotos();
      toast({ title: 'Fotografies afegides' });
    },
    onError: (err: Error) => {
      toast({ title: 'Error pujant', description: err.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (photo: Photo) => {
      const { error } = await supabase.from('photos').delete().eq('id', photo.id);
      if (error) throw error;
      const path = getStoragePath(photo.url);
      if (path) {
        // Best-effort: only remove exact object
        await supabase.storage.from('photos').remove([path]);
      }
      // Re-normalize order
      const remaining = (photos ?? []).filter((p) => p.id !== photo.id);
      await normalizeOrder(remaining);
    },
    onSuccess: () => {
      invalidatePhotos();
      setDeletePhotoId(null);
      toast({ title: 'Fotografia eliminada' });
    },
    onError: (err: Error) => {
      toast({ title: 'Error eliminant', description: err.message, variant: 'destructive' });
    },
  });

  const moveMutation = useMutation({
    mutationFn: async ({ index, dir }: { index: number; dir: -1 | 1 }) => {
      if (!photos) return;
      const target = index + dir;
      if (target < 0 || target >= photos.length) return;
      const reordered = [...photos];
      const [item] = reordered.splice(index, 1);
      reordered.splice(target, 0, item);
      await normalizeOrder(reordered);
    },
    onSuccess: () => invalidatePhotos(),
    onError: (err: Error) => {
      toast({ title: 'Error reordenant', description: err.message, variant: 'destructive' });
    },
  });

  const captionMutation = useMutation({
    mutationFn: async (photo: Photo) => {
      const value = (captions[photo.id] ?? '').trim();
      const { error } = await supabase
        .from('photos')
        .update({ caption: value || null })
        .eq('id', photo.id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidatePhotos();
      toast({ title: 'Peu de foto guardat' });
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (files.length > 0) uploadMutation.mutate(files);
  };



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
              <TabsTrigger value="photos">Fotografies</TabsTrigger>
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

            <TabsContent value="photos" className="space-y-4 pt-4">
              <p className="text-xs text-muted-foreground italic">
                Les fotografies són compartides per totes les versions de la notícia
                d'aquesta jornada.
              </p>

              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_MIME.join(',')}
                  multiple
                  className="hidden"
                  onChange={handleFileSelect}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadMutation.isPending}
                >
                  {uploadMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <ImagePlus className="h-4 w-4 mr-2" />
                  )}
                  Afegir imatges
                </Button>
                <span className="text-xs text-muted-foreground">
                  JPG, PNG o WEBP · màx {MAX_FILE_SIZE_MB}MB
                </span>
              </div>

              {(!photos || photos.length === 0) && (
                <p className="text-sm text-muted-foreground py-6 text-center border border-dashed border-border/60 rounded">
                  No hi ha fotografies per aquesta jornada.
                </p>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {photos?.map((photo, idx) => {
                  const captionValue = captions[photo.id] ?? '';
                  const captionDirty = captionValue !== (photo.caption ?? '');
                  const isDeleting =
                    deleteMutation.isPending && deletePhotoId === photo.id;
                  return (
                    <div
                      key={photo.id}
                      className="border border-border/60 rounded overflow-hidden bg-card"
                    >
                      <a
                        href={photo.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block bg-muted aspect-video overflow-hidden"
                      >
                        <img
                          src={photo.url}
                          alt={photo.caption ?? ''}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </a>
                      <div className="p-2 space-y-2">
                        <div className="flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            disabled={idx === 0 || moveMutation.isPending}
                            onClick={() => moveMutation.mutate({ index: idx, dir: -1 })}
                            title="Moure enrere"
                          >
                            <ArrowLeft className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            disabled={
                              idx === (photos?.length ?? 0) - 1 || moveMutation.isPending
                            }
                            onClick={() => moveMutation.mutate({ index: idx, dir: 1 })}
                            title="Moure endavant"
                          >
                            <ArrowRight className="h-3.5 w-3.5" />
                          </Button>
                          <span className="text-[11px] text-muted-foreground ml-1">
                            #{idx + 1}
                          </span>
                          <div className="ml-auto flex items-center gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => setDeletePhotoId(photo.id)}
                              disabled={isDeleting}
                              title="Eliminar"
                            >
                              {isDeleting ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Input
                            value={captionValue}
                            onChange={(e) =>
                              setCaptions((prev) => ({
                                ...prev,
                                [photo.id]: e.target.value,
                              }))
                            }
                            placeholder="Peu de foto"
                            className="h-8 text-xs"
                          />
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 shrink-0"
                            disabled={!captionDirty || captionMutation.isPending}
                            onClick={() => captionMutation.mutate(photo)}
                            title="Guardar peu de foto"
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
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

      <AlertDialog
        open={!!deletePhotoId}
        onOpenChange={(o) => !o && setDeletePhotoId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar fotografia?</AlertDialogTitle>
            <AlertDialogDescription>
              Aquesta acció eliminarà només aquesta imatge de la jornada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel·lar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const p = photos?.find((x) => x.id === deletePhotoId);
                if (p) deleteMutation.mutate(p);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default NewsEditDialog;

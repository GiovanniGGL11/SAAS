'use client';

import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import { StarIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { unwrapResult } from '@/lib/action-result';
import { cn } from '@/lib/utils';
import { submitReviewAction } from '@/server/actions/relationship-actions';

const LABELS = ['', 'Ruim', 'Regular', 'Bom', 'Muito bom', 'Excelente'];

export function ReviewForm({
  token,
  existing,
  googleReviewUrl,
  companyName,
}: {
  token: string;
  existing: { rating: number; comment: string | null } | null;
  googleReviewUrl: string | null;
  companyName: string;
}) {
  const [rating, setRating] = React.useState(existing?.rating ?? 0);
  const [hover, setHover] = React.useState(0);
  const [comment, setComment] = React.useState('');
  const [consent, setConsent] = React.useState(false);
  const submit = useMutation({
    mutationFn: () =>
      submitReviewAction({
        token,
        rating,
        comment: comment || undefined,
        publicConsent: consent,
      }).then(unwrapResult),
  });
  const done = !!existing || submit.isSuccess;
  const shown = hover || rating;

  if (done) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-[17px] font-semibold">Obrigado pela avaliação!</p>
        {/* O convite para o Google é o mesmo para qualquer nota (nunca filtrado pela avaliação). */}
        {googleReviewUrl && (
          <>
            <p className="text-label-secondary text-[15px]">
              Se quiser, conte também no Google. Sua opinião ajuda outras pessoas a conhecer a{' '}
              {companyName}.
            </p>
            <Button asChild className="h-11">
              <a href={googleReviewUrl} target="_blank" rel="noreferrer">
                Avaliar no Google
              </a>
            </Button>
          </>
        )}
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit.mutate();
      }}
    >
      <div className="flex flex-col items-center gap-2">
        <div
          className="flex gap-1"
          role="radiogroup"
          aria-label="Nota"
          onMouseLeave={() => setHover(0)}
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={`${n} ${n === 1 ? 'estrela' : 'estrelas'}`}
              onMouseEnter={() => setHover(n)}
              onClick={() => setRating(n)}
              className="p-1 transition-transform active:scale-90"
            >
              <StarIcon
                className={cn(
                  'size-9',
                  n <= shown ? 'fill-[#ffcc00] text-[#ffcc00]' : 'text-foreground/20',
                )}
              />
            </button>
          ))}
        </div>
        <span className="text-label-secondary h-5 text-[14px]">{LABELS[shown]}</span>
      </div>
      <Textarea
        rows={3}
        placeholder="Quer contar mais? (opcional)"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        maxLength={1000}
      />
      {comment.trim() && (
        <label className="text-label-secondary flex items-start gap-2 text-[13px]">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          Pode mostrar meu comentário publicamente.
        </label>
      )}
      {submit.error && (
        <p className="text-destructive text-sm">{(submit.error as Error).message}</p>
      )}
      <Button type="submit" className="h-11" disabled={rating === 0 || submit.isPending}>
        Enviar avaliação
      </Button>
    </form>
  );
}

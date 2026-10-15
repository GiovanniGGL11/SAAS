'use client';

import * as React from 'react';
import Link from 'next/link';
import { MapPinIcon } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

/**
 * Cabeçalho do link público: logo, nome, localização resumida (o endereço completo fica em
 * "Ver localização") e o Instagram como detalhe. Só aparece o que a empresa cadastrou.
 */
export function BookingHeader({
  name,
  slug,
  logoUrl,
  locationShort,
  address,
  mapUrl,
  instagram,
}: {
  name: string;
  slug: string;
  logoUrl: string | null;
  locationShort: string | null;
  address: string | null;
  mapUrl: string | null;
  instagram: string | null;
}) {
  const [open, setOpen] = React.useState(false);
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');

  return (
    <header className="flex items-center gap-3">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- logo hospedada pelo Clerk
        <img
          src={logoUrl}
          alt=""
          className="ring-foreground/[0.08] size-12 shrink-0 rounded-xl object-cover ring-1"
        />
      ) : (
        <span
          aria-hidden
          className="bg-system-blue flex size-12 shrink-0 items-center justify-center rounded-xl text-[17px] font-bold text-white"
        >
          {initials}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="line-clamp-2 text-[19px] leading-tight font-semibold tracking-[-0.01em] break-words sm:text-[21px]">
          {name}
        </h1>
        {(locationShort || instagram) && (
          <p className="text-label-secondary flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px]">
            {locationShort && (
              <span className="flex min-w-0 flex-wrap items-center gap-x-1">
                <MapPinIcon className="size-3.5 shrink-0" aria-hidden />
                {/* Quebra de linha em vez de cortar: "Centro · Ca…" não diz onde é. */}
                <span className="break-words">{locationShort}</span>
                {address && (
                  <button
                    type="button"
                    onClick={() => setOpen(true)}
                    className="text-system-blue shrink-0 font-medium hover:underline"
                  >
                    Ver localização
                  </button>
                )}
              </span>
            )}
            {instagram && (
              <a
                href={`https://instagram.com/${instagram}`}
                target="_blank"
                rel="noreferrer"
                className="hover:text-foreground hover:underline"
              >
                @{instagram}
              </a>
            )}
          </p>
        )}
      </div>
      <Link
        href={`/cliente/entrar/${slug}`}
        className="text-system-blue hover:bg-system-blue/[0.08] shrink-0 self-start rounded-lg px-2 py-1 text-[13px] font-medium"
      >
        Meus horários
      </Link>

      {address && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Localização</DialogTitle>
              <DialogDescription>{name}</DialogDescription>
            </DialogHeader>
            <p className="flex items-start gap-2 text-[15px]">
              <MapPinIcon className="text-label-secondary mt-0.5 size-4 shrink-0" />
              {address}
            </p>
            {mapUrl && (
              <Button asChild className="h-11 rounded-lg shadow-none">
                <a href={mapUrl} target="_blank" rel="noreferrer">
                  Abrir no mapa
                </a>
              </Button>
            )}
          </DialogContent>
        </Dialog>
      )}
    </header>
  );
}

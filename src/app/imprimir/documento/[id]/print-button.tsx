'use client';

import { PrinterIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';

/** "Imprimir ou salvar em PDF": abre a impressão do navegador (lá dá para escolher PDF). */
export function PrintButton() {
  return (
    <Button onClick={() => window.print()}>
      <PrinterIcon /> Imprimir ou salvar em PDF
    </Button>
  );
}

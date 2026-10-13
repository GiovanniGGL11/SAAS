'use client';

import { CopyIcon, MessageCircleIcon } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export type ConfirmationToSend = {
  message: string;
  whatsappUrl: string | null;
  clientName: string;
};

/**
 * Logo depois de agendar: a mensagem pronta para o cliente confirmar a presença. Um toque abre o
 * WhatsApp dele com o texto escrito; a equipe só aperta enviar.
 */
export function SendConfirmationDialog({
  confirmation,
  onClose,
}: {
  confirmation: ConfirmationToSend | null;
  onClose: () => void;
}) {
  const firstName = confirmation?.clientName.trim().split(/\s+/)[0];

  return (
    <Dialog open={confirmation !== null} onOpenChange={(open: boolean) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Horário marcado!</DialogTitle>
          <DialogDescription>
            Peça para {firstName} confirmar a presença. É só enviar esta mensagem pelo WhatsApp.
          </DialogDescription>
        </DialogHeader>

        {confirmation && (
          <div className="bg-system-green/10 ring-system-green/20 rounded-2xl p-4 text-[14px] leading-relaxed break-words whitespace-pre-wrap ring-1">
            {confirmation.message}
          </div>
        )}

        <DialogFooter className="gap-2 sm:flex-col-reverse">
          <Button variant="ghost" onClick={onClose}>
            Agora não
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              if (!confirmation) return;
              void navigator.clipboard
                .writeText(confirmation.message)
                .then(() => toast.success('Mensagem copiada.'));
            }}
          >
            <CopyIcon className="size-4" /> Copiar mensagem
          </Button>
          {confirmation?.whatsappUrl ? (
            <Button asChild size="lg" onClick={onClose}>
              <a href={confirmation.whatsappUrl} target="_blank" rel="noreferrer">
                <MessageCircleIcon className="size-5" />
                Enviar pelo WhatsApp
              </a>
            </Button>
          ) : (
            <p className="text-label-secondary text-center text-[13px]">
              Este cliente está sem celular cadastrado. Copie a mensagem e envie por onde preferir.
            </p>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

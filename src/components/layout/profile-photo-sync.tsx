'use client';

import * as React from 'react';
import { useUser } from '@clerk/nextjs';
import { useQueryClient } from '@tanstack/react-query';

import { syncMyProfilePhotoAction } from '@/server/actions/profile-photo-actions';

/**
 * Para o profissional logado: quando a foto da conta muda (inclusive na hora, pelo menu da foto),
 * ela passa a ser a foto do cadastro dele. Só chama o servidor quando a foto é nova.
 */
export function ProfilePhotoSync() {
  const { user } = useUser();
  const queryClient = useQueryClient();
  const imageUrl = user?.hasImage ? user.imageUrl : null;
  const userId = user?.id;

  React.useEffect(() => {
    if (!imageUrl || !userId) return;
    const key = `atendafy:photo-sync:${userId}`;
    try {
      if (localStorage.getItem(key) === imageUrl) return;
    } catch {
      // Sem acesso ao armazenamento do navegador: sincroniza assim mesmo (o servidor ignora repetida).
    }
    let cancelled = false;
    void syncMyProfilePhotoAction()
      .then(({ updated }) => {
        if (cancelled) return;
        try {
          localStorage.setItem(key, imageUrl);
        } catch {
          // ignora
        }
        if (updated) void queryClient.invalidateQueries({ queryKey: ['professionals'] });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [imageUrl, userId, queryClient]);

  return null;
}

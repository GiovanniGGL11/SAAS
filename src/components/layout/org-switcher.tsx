'use client';

import * as React from 'react';
import { OrganizationSwitcher } from '@clerk/nextjs';

const emptySubscribe = () => () => {};

/**
 * Seletor de empresa do Clerk só depois de montar no navegador: no servidor ele não desenha nada
 * e no navegador desenha na hora, e essa diferença quebrava a hidratação (no Início, derrubava
 * parte da tela). Até montar, um espaço do mesmo tamanho segura o layout.
 */
export function OrgSwitcher() {
  const mounted = React.useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
  if (!mounted) return <div className="h-8 w-36 max-w-full" aria-hidden />;
  return (
    <OrganizationSwitcher
      hidePersonal
      afterSelectOrganizationUrl="/dashboard"
      afterCreateOrganizationUrl="/dashboard"
      appearance={{
        elements: {
          // Logo do negócio em destaque na barra (o padrão do Clerk é bem pequeno).
          organizationPreviewAvatarBox__organizationSwitcherTrigger: 'size-8 rounded-lg',
          organizationPreviewMainIdentifier__organizationSwitcherTrigger:
            'text-[15px] font-semibold',
        },
      }}
    />
  );
}

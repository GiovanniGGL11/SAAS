'use client';

import * as React from 'react';

/**
 * Quem está usando o app: `professionalId` preenchido = o próprio profissional logado, que vê só
 * a agenda, os clientes e os ganhos dele. O servidor confere tudo de novo; isto só limpa o menu.
 */
type Viewer = { professionalId: string | null };

const ViewerContext = React.createContext<Viewer>({ professionalId: null });

export function ViewerProvider({
  professionalId,
  children,
}: {
  professionalId: string | null;
  children: React.ReactNode;
}) {
  const value = React.useMemo(() => ({ professionalId }), [professionalId]);
  return <ViewerContext.Provider value={value}>{children}</ViewerContext.Provider>;
}

export function useViewer(): Viewer {
  return React.useContext(ViewerContext);
}

/** Telas que o profissional logado usa (o resto some do menu dele). */
export const PROFESSIONAL_PATHS = [
  '/dashboard',
  '/agenda',
  '/clientes',
  '/metas',
  '/meus-ganhos',
  '/atividades',
];

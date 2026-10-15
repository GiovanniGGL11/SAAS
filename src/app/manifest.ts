import type { MetadataRoute } from 'next';

/**
 * App instalável (PWA): no celular, "Adicionar à tela de início" abre o Atendafy em tela cheia,
 * com ícone próprio, direto na agenda.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Atendafy',
    short_name: 'Atendafy',
    description: 'Agenda, agendamento online, caixa e financeiro do seu negócio.',
    start_url: '/agenda',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#007aff',
    lang: 'pt-BR',
    categories: ['business', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Agenda', url: '/agenda' },
      { name: 'Caixa', url: '/caixa' },
      { name: 'Clientes', url: '/clientes' },
    ],
  };
}

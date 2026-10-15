import type { MetadataRoute } from 'next';

import { siteUrl } from '@/lib/site-url';

/** Buscadores indexam só as páginas públicas; o sistema e os links de clientes ficam de fora. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/termos', '/privacidade', '/agendar/'],
      disallow: [
        '/dashboard',
        '/agenda',
        '/clientes',
        '/profissionais',
        '/servicos',
        '/estoque',
        '/caixa',
        '/financeiro',
        '/campanhas',
        '/fidelidade',
        '/relatorios',
        '/configuracoes',
        '/unidades',
        '/fichas',
        '/confirmar/',
        '/avaliar/',
        '/ficha/',
        '/c/',
        '/cliente/',
        '/exportar/',
        '/api/',
      ],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}

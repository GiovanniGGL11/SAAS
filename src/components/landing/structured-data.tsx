import { PLANS, planPrice } from '@/lib/billing/plans';
import { siteUrl } from '@/lib/site-url';
import { QUESTIONS } from '@/components/landing/faq';

/**
 * Dados estruturados (schema.org) da página inicial: o Google entende que é um software, com
 * preços e perguntas frequentes, e pode mostrar isso direto no resultado da busca.
 */
export function StructuredData() {
  const base = siteUrl();
  const prices = PLANS.filter((p) => p.offered).map(planPrice);
  const data = [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'Atendafy',
      url: base,
      logo: `${base}/icons/icon-512.png`,
      email: 'contato@atendafy.com',
    },
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'Atendafy',
      url: base,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web, Android, iOS',
      inLanguage: 'pt-BR',
      description:
        'Sistema de agendamento online com agenda, confirmação pelo WhatsApp, caixa e financeiro para negócios que atendem com hora marcada.',
      offers: {
        '@type': 'AggregateOffer',
        priceCurrency: 'BRL',
        lowPrice: Math.min(...prices).toFixed(2),
        highPrice: Math.max(...prices).toFixed(2),
        offerCount: prices.length,
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: QUESTIONS.map((item) => ({
        '@type': 'Question',
        name: item.q,
        acceptedAnswer: { '@type': 'Answer', text: item.a },
      })),
    },
  ];
  return (
    <script
      type="application/ld+json"
      // JSON gerado aqui mesmo (sem dado de usuário); o "<" escapado impede fechar a tag <script>.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  );
}

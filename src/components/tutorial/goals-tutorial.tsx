import {
  Bullets,
  Faq,
  Fields,
  Section,
  Steps,
  Tip,
  TutorialPage,
} from '@/components/tutorial/tutorial-kit';

const SECTIONS = [
  { id: 'empresa', label: 'Metas da empresa' },
  { id: 'equipe', label: 'Metas de cada profissional' },
  { id: 'ler', label: 'Como ler o andamento' },
  { id: 'exemplo', label: 'Exemplo' },
  { id: 'equipe-ve', label: 'O que a equipe vê' },
  { id: 'duvidas', label: 'Dúvidas comuns' },
] as const;

export function GoalsTutorial() {
  return (
    <TutorialPage
      title="Como usar as Metas"
      description="Metas do mês para a empresa e para cada profissional, com o ritmo do dia, quanto falta por dia e a projeção do mês."
      backHref="/metas"
      backLabel="Voltar às Metas"
      sections={SECTIONS}
    >
      <Section id="empresa" eyebrow="Para o dono" title="Metas da empresa">
        <p>Em Metas da empresa, clique em Definir meta em cada uma que quiser acompanhar:</p>
        <Fields
          rows={[
            ['Recebido', 'O dinheiro que entrou no mês, em R$.'],
            ['Atendimentos concluídos', 'Quantos atendimentos foram concluídos no mês.'],
            ['Clientes novos', 'Quantos clientes novos vieram no mês.'],
            ['Orçamentos aprovados', 'Quantos orçamentos os clientes aprovaram no mês.'],
          ]}
        />
        <Tip>
          A meta vale a partir do mês em que você define e continua nos meses seguintes até você
          mudar. Não precisa digitar de novo todo mês.
        </Tip>
      </Section>

      <Section id="equipe" eyebrow="Para o dono" title="Metas de cada profissional">
        <p>Em Metas da equipe, clique em Definir no cartão de cada profissional:</p>
        <Fields
          rows={[
            [
              'Produção no mês (R$)',
              'O que foi cobrado pelos serviços que ela fez (sem gorjeta e sem produto).',
            ],
            ['Atendimentos concluídos no mês', 'Quantos atendimentos ela concluiu.'],
          ]}
        />
        <p>
          Deixe em branco para ficar sem meta. A meta da profissional também segue valendo todo mês
          até você mudar.
        </p>
      </Section>

      <Section id="ler" title="Como ler o andamento">
        <p>
          No topo aparece o dia do mês (Ex.: Dia 18 de 30) e quantos dias faltam. Cada meta mostra:
        </p>
        <Bullets
          items={[
            <>
              A situação: <strong>Meta batida</strong>, <strong>À frente do ritmo</strong>,{' '}
              <strong>No ritmo</strong> ou <strong>Abaixo do ritmo</strong>. Até 5% abaixo do
              esperado para o dia ainda conta como No ritmo.
            </>,
            <>
              <strong>Falta</strong>: quanto ainda falta e quanto isso dá <strong>por dia</strong>,
              contando hoje.
            </>,
            <>
              <strong>Projeção</strong>: onde o mês termina se continuar no ritmo de hoje.
            </>,
          ]}
        />
      </Section>

      <Section id="exemplo" title="Exemplo">
        <p>Meta de R$ 30.000 recebidos. Hoje é dia 15 de 30 e já entraram R$ 12.000.</p>
        <Steps
          items={[
            'O esperado para o dia 15 seria R$ 15.000 (metade do mês). R$ 12.000 está mais de 5% abaixo: Abaixo do ritmo.',
            'Faltam R$ 18.000 em 16 dias (contando hoje): R$ 1.125 por dia.',
            'Projeção: R$ 12.000 em 15 dias dá R$ 800 por dia, ou cerca de R$ 24.000 no mês.',
          ]}
        />
      </Section>

      <Section id="equipe-ve" title="O que a equipe vê">
        <Bullets
          items={[
            'Cada profissional sempre vê a própria meta, em Minha meta.',
            <>
              As metas da empresa ficam só com o dono, a não ser que você ligue{' '}
              <strong>Equipe vê a meta da empresa</strong> no topo da página.
            </>,
            'Ninguém da equipe vê a meta ou a produção dos colegas.',
          ]}
        />
      </Section>

      <Section id="duvidas" title="Dúvidas comuns">
        <Faq
          items={[
            [
              'Defini a meta no Início. É a mesma?',
              'Sim. A meta de recebido do mês definida no Início é a mesma de Recebido aqui.',
            ],
            [
              'A produção da profissional conta o pacote?',
              'Sim. A sessão de pacote usada no atendimento conta na produção de quem atendeu, pelo valor da sessão.',
            ],
            [
              'Posso tirar uma meta?',
              'Sim. Abra a meta e deixe o campo em branco. Ela some deste mês em diante.',
            ],
          ]}
        />
      </Section>
    </TutorialPage>
  );
}

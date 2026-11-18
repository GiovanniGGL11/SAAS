import {
  Bullets,
  Faq,
  Fields,
  Path,
  Section,
  Steps,
  Tip,
  TutorialPage,
} from '@/components/tutorial/tutorial-kit';

const SECTIONS = [
  { id: 'servico', label: 'Cadastrar um serviço' },
  { id: 'equipe', label: 'Quem faz e por quanto' },
  { id: 'materiais', label: 'Materiais do serviço' },
  { id: 'checklist', label: 'Checklist do atendimento' },
  { id: 'pacotes', label: 'Pacotes' },
  { id: 'assinaturas', label: 'Assinaturas' },
  { id: 'usar', label: 'Vender e usar uma sessão' },
  { id: 'duvidas', label: 'Dúvidas comuns' },
] as const;

export function ServicesTutorial() {
  return (
    <TutorialPage
      title="Como usar os Serviços"
      description="O catálogo do que você atende: preço, duração, quem faz, materiais, pacotes de sessões e assinaturas mensais."
      backHref="/servicos"
      backLabel="Voltar aos Serviços"
      sections={SECTIONS}
    >
      <Section id="servico" title="Cadastrar um serviço">
        <Path items={['Serviços', 'Novo serviço']} />
        <Fields
          rows={[
            ['Nome e categoria', 'A categoria agrupa no link de agendamento (Ex.: Cabelo, Unhas).'],
            [
              'Duração e preço',
              'A duração ocupa a agenda; o preço é o que vem na comanda (dá para dar desconto na hora).',
            ],
            [
              'Intervalo de preparo depois',
              'Minutos de limpeza ou preparo depois do atendimento. A agenda não encaixa ninguém nesse tempo.',
            ],
            [
              'Sugerir retorno após',
              'Em quantos dias o cliente costuma voltar (Ex.: 21). Na ficha do cliente aparece a data sugerida de retorno, com a mensagem pronta. Vazio = sem sugestão.',
            ],
            [
              'Comissão deste serviço',
              '% própria deste serviço. Vazio = vale a regra de cada profissional.',
            ],
            [
              'Como mostrar o preço',
              'Preço fixo, "A partir de" ou "Sob consulta" no link de agendamento.',
            ],
            [
              'Aparece no agendamento online',
              'Desligado, só a equipe agenda este serviço (bom para avaliações e retoques).',
            ],
            ['Cor', 'A cor do serviço na agenda.'],
          ]}
        />
      </Section>

      <Section id="equipe" title="Quem faz e por quanto">
        <p>
          Em <strong>Quem faz este serviço</strong>, escolha entre duas opções:
        </p>
        <Bullets
          items={[
            <>
              <strong>Todos, mesmo preço</strong>: qualquer profissional faz, pelo preço do serviço.
            </>,
            <>
              <strong>Escolher profissionais e preços</strong>: só quem você marcar aparece para
              este serviço (na agenda e no link), e cada um pode ter o próprio preço. Ex.: corte com
              a dona por R$ 90 e com a assistente por R$ 60.
            </>,
          ]}
        />
      </Section>

      <Section id="materiais" title="Materiais do serviço">
        <p>
          Ligue <strong>Este serviço consome algo do estoque?</strong> e diga o que cada atendimento
          gasta, na unidade de cada material (1 par de luvas, 20 ml de sérum). Ao concluir o
          atendimento, tudo sai do estoque sozinho.
        </p>
        <p>
          Ao lado de cada material aparece quanto há em estoque e para quantos atendimentos ele dá;
          embaixo, o custo de material por atendimento. O material ainda não está no estoque? Use{' '}
          <strong>+ Cadastrar material novo</strong> sem sair do serviço.
        </p>
        <Tip>
          O tutorial do Estoque explica as unidades (un, par, ml, g...) com um exemplo completo.
        </Tip>
      </Section>

      <Section id="checklist" title="Checklist do atendimento">
        <p>
          Escreva um item por linha (Ex.: &quot;Conferir alergias&quot;, &quot;Higienizar
          equipamento&quot;). A lista aparece na Visão do atendimento para a equipe ir marcando.
        </p>
      </Section>

      <Section id="pacotes" title="Pacotes">
        <Path items={['Serviços', 'Pacotes']} />
        <p>
          Várias sessões de um serviço, pagas de uma vez, para usar quando o cliente quiser. Ex.: 4
          limpezas de pele por R$ 320.
        </p>
        <Steps
          items={[
            <>
              Em <strong>Novo pacote</strong>, dê um nome e escolha o serviço:{' '}
              <strong>Escolher um</strong> do catálogo, <strong>Juntar serviços</strong> (ex.: corte
              + barba num serviço só) ou <strong>Criar novo</strong> ali mesmo.
            </>,
            'Informe quantas sessões e o preço do pacote. A tela mostra quanto sai cada sessão e quanto seria avulso.',
            'Se quiser, coloque a validade em dias. Sem validade, as sessões não vencem.',
          ]}
        />
      </Section>

      <Section id="assinaturas" title="Assinaturas">
        <Path items={['Serviços', 'Assinaturas']} />
        <p>
          Sessões por mês com mensalidade. Ex.: 4 escovas por mês por R$ 180. A assinatura renova
          sozinha todo mês, até ser cancelada: as sessões zeram no novo mês e a mensalidade entra
          como valor a receber do cliente.
        </p>
        <Tip tone="warn">
          O Atendafy não cobra o cartão do cliente sozinho: a mensalidade fica &quot;a receber&quot;
          e você recebe do jeito de sempre (PIX, cartão, dinheiro).
        </Tip>
      </Section>

      <Section id="usar" title="Vender e usar uma sessão">
        <Bullets
          items={[
            <>
              <strong>Vender:</strong> em <strong>Caixa › Nova venda</strong>, aba Pacote, ou na
              ficha do cliente, em Pacotes e assinaturas. Dá para receber na hora ou deixar no
              fiado.
            </>,
            <>
              <strong>Usar:</strong> na comanda do atendimento, toque em{' '}
              <strong>Usar [pacote] · sessão 2 de 4</strong>. O botão vira{' '}
              <strong>Concluir sessão</strong> e o cliente não paga de novo.
            </>,
            <>
              <strong>Desfez a conclusão?</strong> A sessão volta para o pacote do cliente.
            </>,
          ]}
        />
        <p>
          No Financeiro, a receita do pacote entra uma vez, no dia da venda. As sessões usadas
          depois não contam de novo.
        </p>
      </Section>

      <Section id="duvidas" title="Dúvidas comuns">
        <Faq
          items={[
            [
              'Mudei o preço do serviço. Os horários marcados mudam?',
              'Não. Cada agendamento guarda o preço do dia em que foi marcado.',
            ],
            [
              'Como paro de oferecer um serviço sem perder o histórico?',
              'Desative o serviço. Ele sai da agenda e do link, e os atendimentos antigos continuam no histórico.',
            ],
            [
              'Não vejo a aba Pacotes funcionando.',
              'Pacotes e assinaturas estão no plano Profissional. No Básico, dá para testar grátis por 3 dias pelo botão do cartão.',
            ],
            [
              'Quem pode criar ou mudar serviços e pacotes?',
              'O dono e os administradores. A equipe usa o catálogo na agenda e na comanda.',
            ],
          ]}
        />
      </Section>
    </TutorialPage>
  );
}

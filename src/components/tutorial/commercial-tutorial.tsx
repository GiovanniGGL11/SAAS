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
  { id: 'oportunidades', label: 'Oportunidades (funil)' },
  { id: 'etapas', label: 'Etapas do funil' },
  { id: 'interacoes', label: 'Interações e próxima ação' },
  { id: 'orcamento', label: 'Criar um orçamento' },
  { id: 'enviar', label: 'Enviar e aprovar' },
  { id: 'converter', label: 'Converter o aprovado' },
  { id: 'duvidas', label: 'Dúvidas comuns' },
] as const;

export function CommercialTutorial() {
  return (
    <TutorialPage
      title="Como usar o Comercial"
      description="Acompanhe quem demonstrou interesse até fechar, e mande orçamentos que o cliente aprova pelo link."
      backHref="/comercial"
      backLabel="Voltar ao Comercial"
      sections={SECTIONS}
    >
      <Section id="oportunidades" eyebrow="Funil de vendas" title="Oportunidades">
        <Path items={['Comercial', 'Oportunidades']} />
        <p>
          Oportunidade é alguém que pediu informação, orçamento ou mostrou interesse e ainda não
          fechou. Registre para não esquecer de ninguém.
        </p>
        <Steps
          items={[
            <>
              Em <strong>Nova oportunidade</strong>, escolha <strong>Cliente cadastrado</strong> ou{' '}
              <strong>Contato novo</strong> (nome e telefone).
            </>,
            <>
              Preencha o título (Ex.: Plano anual de depilação), o serviço de interesse, a origem
              (Instagram, indicação...), o responsável, o valor estimado e a previsão de fechamento.
            </>,
            'Ela começa na primeira etapa do funil.',
          ]}
        />
        <Bullets
          items={[
            <>
              Veja em <strong>Quadro</strong> (colunas por etapa) ou em <strong>Lista</strong>.
              Filtre por Em andamento, Ganhas, Perdidas ou só as <strong>Minhas</strong>.
            </>,
            'Para avançar, arraste o cartão para a próxima coluna, ou use "Mover para…" dentro da oportunidade.',
            <>
              Marcou como perdida? O sistema pergunta <strong>Por que foi perdida?</strong> (preço,
              escolheu outro, sem retorno). Isso ajuda a entender onde você perde vendas.
            </>,
          ]}
        />
        <Tip>
          O valor estimado não entra no Financeiro: é só para você ter ideia do que está em
          negociação.
        </Tip>
      </Section>

      <Section id="etapas" title="Etapas do funil">
        <p>
          Em <strong>Etapas do funil</strong>, dê nome às etapas do seu jeito (Ex.: Contato,
          Avaliação marcada, Orçamento enviado, Fechado), mude a ordem com as setas e salve.
        </p>
      </Section>

      <Section id="interacoes" title="Interações e próxima ação">
        <p>
          Dentro da oportunidade, use <strong>Registrar interação</strong> para anotar cada contato
          (mensagem, ligação, reunião, e-mail ou anotação) e o que foi conversado.
        </p>
        <p>
          Em <strong>Próxima ação</strong>, escreva o que fazer e quando (Ex.: &quot;ligar para
          fechar&quot;, sexta). A lista de oportunidades fica ordenada pela próxima ação, então quem
          precisa de contato primeiro aparece em cima.
        </p>
      </Section>

      <Section id="orcamento" eyebrow="Orçamentos" title="Criar um orçamento">
        <Path items={['Comercial', 'Orçamentos', 'Novo orçamento']} />
        <Steps
          items={[
            'Escolha o cliente e dê um nome (Ex.: Tratamento facial — 8 sessões).',
            <>
              Adicione os itens: <strong>Serviço</strong> (com quantas sessões),{' '}
              <strong>Produto</strong> ou <strong>Item livre</strong>. Para cada um, quantidade,
              valor e desconto.
            </>,
            'Se quiser, um desconto geral, as condições de pagamento (Ex.: 3x no cartão ou PIX à vista), observações e a validade.',
          ]}
        />
      </Section>

      <Section id="enviar" title="Enviar e aprovar">
        <Fields
          rows={[
            [
              'Enviar (gerar link)',
              'Cria um link protegido. O cliente abre no celular, vê o orçamento e aprova ou recusa.',
            ],
            [
              'Registrar aprovação',
              'O cliente aprovou por outro meio (WhatsApp, pessoalmente)? Registre, dizendo como foi.',
            ],
            [
              'Alterar depois de enviado',
              'Mudar o orçamento cria uma versão nova, e o cliente precisa aprovar de novo. As versões anteriores ficam no histórico.',
            ],
            ['Gerar novo link', 'Os links anteriores deixam de funcionar.'],
            [
              'Duplicar',
              'Copia o orçamento como um rascunho novo, para fazer outra proposta (a validade vencida não é copiada).',
            ],
          ]}
        />
        <p>
          As abas mostram Rascunhos, Enviados, Aprovados, Recusados e Vencidos (passou da validade
          sem resposta). Orçamento enviado há alguns dias sem resposta aparece no sininho.
        </p>
      </Section>

      <Section id="converter" title="Converter o orçamento aprovado">
        <p>Só a versão aprovada pode ser convertida, e cada conversão acontece uma vez só.</p>
        <Fields
          rows={[
            [
              'Converter em pacote',
              'Cria o pacote no cliente com o valor aprovado, sem lançar cobrança. O pagamento é registrado no pacote quando acontecer.',
            ],
            [
              'Converter em venda',
              'Lança o valor como conta a receber do cliente (não como pago) e baixa do estoque os produtos do orçamento.',
            ],
            [
              'Criar serviço em andamento',
              'Para trabalhos em etapas: cria o acompanhamento com os itens como checklist, sem cobrança.',
            ],
          ]}
        />
      </Section>

      <Section id="duvidas" title="Dúvidas comuns">
        <Faq
          items={[
            [
              'Qual a diferença entre oportunidade e orçamento?',
              'A oportunidade é o acompanhamento da conversa (quem, quanto, em que etapa). O orçamento é o documento com itens e preço que o cliente aprova. Dá para usar os dois juntos ou só um.',
            ],
            [
              'O cliente aprovou. Entra dinheiro no caixa?',
              'Não sozinho. A aprovação registra o combinado; o dinheiro entra quando você converte e recebe (no pacote, na venda ou na comanda).',
            ],
            [
              'A profissional vê o Comercial?',
              'Não. Quem entra com o login de profissional vê só a agenda, os clientes e os ganhos dela.',
            ],
            [
              'Não vejo Oportunidades ou Orçamentos.',
              'Os dois estão no plano Profissional. No Básico, dá para testar cada um grátis por 3 dias em Assinatura.',
            ],
          ]}
        />
      </Section>
    </TutorialPage>
  );
}

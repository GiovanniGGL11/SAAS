import {
  Bullets,
  Faq,
  Fields,
  Section,
  Steps,
  Sub,
  Tip,
  TutorialPage,
} from '@/components/tutorial/tutorial-kit';

const SECTIONS = [
  { id: 'ver', label: 'Ver a agenda' },
  { id: 'marcar', label: 'Marcar um horário' },
  { id: 'mover', label: 'Mover e mudar a duração' },
  { id: 'status', label: 'As cores (status)' },
  { id: 'atendimento', label: 'Dentro do agendamento' },
  { id: 'cobrar', label: 'Concluir e cobrar' },
  { id: 'fechar', label: 'Atendimentos para fechar' },
  { id: 'bloquear', label: 'Bloquear horário' },
  { id: 'espera', label: 'Lista de espera' },
  { id: 'atalhos', label: 'Atalhos de teclado' },
  { id: 'duvidas', label: 'Dúvidas comuns' },
] as const;

export function AgendaTutorial() {
  return (
    <TutorialPage
      title="Como usar a Agenda"
      description="Marcar, mover, confirmar, atender e cobrar: o dia a dia do atendimento num lugar só."
      backHref="/agenda"
      backLabel="Voltar à Agenda"
      sections={SECTIONS}
    >
      <Section id="ver" title="Ver a agenda">
        <Bullets
          items={[
            <>
              Escolha <strong>Dia</strong>, <strong>Semana</strong> ou <strong>Mês</strong> no topo.
              As setas trocam o período e <strong>Hoje</strong> volta para o dia atual.
            </>,
            <>
              Com mais de um profissional, cada um tem a sua coluna. Toque no nome para ver{' '}
              <strong>só este profissional</strong>.
            </>,
            <>
              Em <strong>Calendário e filtros</strong>, filtre por profissional, serviço e status.
            </>,
          ]}
        />
      </Section>

      <Section id="marcar" eyebrow="O mais usado" title="Marcar um horário">
        <Steps
          items={[
            <>
              Clique num horário vazio da agenda (ou arraste sobre vários, com o mouse). Abre a
              criação rápida já com o horário escolhido. Também dá para usar o botão{' '}
              <strong>Criar</strong> ou a tecla <strong>C</strong>.
            </>,
            <>
              Escolha o cliente. Ainda não é cliente? Digite o nome e o telefone ali mesmo, sem sair
              da agenda.
            </>,
            'Escolha o serviço e o profissional. Dá para somar mais serviços no mesmo horário (corte + barba).',
            <>
              Para quem vem sempre no mesmo dia, use <strong>Repetir</strong>: toda semana, a cada 2
              ou a cada 4 semanas, de 2 a 12 vezes.
            </>,
            <>
              Salve. Aparece <strong>Horário marcado!</strong> com a mensagem de confirmação pronta
              para mandar pelo WhatsApp (ou sai sozinha, se o WhatsApp automático estiver ligado).
            </>,
          ]}
        />
        <Tip>
          O sistema não deixa marcar dois clientes no mesmo horário com o mesmo profissional, e
          respeita o intervalo de preparo de cada serviço.
        </Tip>
      </Section>

      <Section id="mover" title="Mover e mudar a duração">
        <Bullets
          items={[
            'Arraste o cartão para outro horário ou outro profissional para remarcar.',
            'Puxe a borda de baixo do cartão para aumentar ou diminuir a duração.',
            'No celular, segure o cartão um instante antes de arrastar (assim a agenda rola normalmente).',
          ]}
        />
      </Section>

      <Section id="status" title="As cores (status)">
        <Fields
          rows={[
            ['A confirmar', 'Marcado, o cliente ainda não confirmou (laranja).'],
            ['Confirmado', 'O cliente confirmou (azul).'],
            ['Em atendimento', 'O atendimento começou.'],
            ['Concluído', 'Atendido e cobrado.'],
            ['Faltou', 'O cliente não veio.'],
            ['Cancelado', 'Desmarcado (com o motivo, se você informar).'],
          ]}
        />
      </Section>

      <Section id="atendimento" title="Dentro do agendamento">
        <p>Toque no cartão para abrir. Lá estão:</p>
        <Bullets
          items={[
            <>
              <strong>Confirmar</strong>, <strong>Iniciar atendimento</strong>,{' '}
              <strong>Faltou</strong> (e Desfazer falta) e cancelar com o motivo.
            </>,
            'O WhatsApp do cliente e o histórico do agendamento (quem marcou, moveu ou mudou).',
            <>
              <strong>Fichas e registro</strong>: a anamnese com o botão{' '}
              <strong>Enviar pelo WhatsApp</strong>, as fichas exigidas pelo serviço e o registro da
              sessão. Nos ramos de saúde e estética, o atalho <strong>Abrir prontuário</strong>.
            </>,
            'Produtos vendidos: adicione o que o cliente levou (sai do estoque e entra no caixa).',
            'O checklist do serviço, para a equipe ir marcando.',
          ]}
        />
      </Section>

      <Section id="cobrar" title="Concluir e cobrar (a comanda)">
        <p>
          No agendamento, toque em <strong>Concluir e cobrar</strong>. Na comanda:
        </p>
        <Fields
          rows={[
            [
              'Forma de pagamento',
              'PIX, dinheiro, crédito, débito ou outra. A taxa da maquininha é descontada sozinha no Financeiro.',
            ],
            ['Dividir o pagamento', 'Parte no PIX e parte no cartão, por exemplo.'],
            ['Desconto e cupom', 'Em reais, ou um cupom cadastrado.'],
            ['Gorjeta', 'Lançada à parte (não entra na comissão).'],
            [
              'Pacote ou assinatura',
              'Usa uma sessão do pacote do cliente: o botão vira Concluir sessão e ele não paga de novo.',
            ],
            ['Vale-presente', 'Paga com o saldo do vale.'],
            ['Fiado', 'Fica a receber na ficha do cliente.'],
          ]}
        />
        <p>
          Ao concluir: a receita vai para o Financeiro, a comissão é calculada, a fidelidade é
          creditada e os materiais do serviço saem do estoque. Desfazer a conclusão desfaz tudo
          isso.
        </p>
      </Section>

      <Section id="fechar" title="Atendimentos para fechar">
        <p>
          Quando há horários que já passaram e continuam em aberto, o <strong>Início</strong> avisa.
          Toque no aviso para abrir a lista e, em cada um, use <strong>Fechar</strong> (aconteceu:
          registra a visita e o pagamento) ou <strong>Faltou</strong>. Assim o Financeiro e as metas
          ficam certos.
        </p>
      </Section>

      <Section id="bloquear" title="Bloquear horário">
        <p>
          No horário vazio, troque <strong>Agendamento</strong> por{' '}
          <strong>Bloquear horário</strong>: almoço, folga, compromisso. O horário some do link de
          agendamento online. Para liberar, abra o bloqueio e use <strong>Remover bloqueio</strong>.
        </p>
      </Section>

      <Section id="espera" title="Lista de espera">
        <p>
          Cliente quer um horário que está cheio? Abra <strong>Calendário e filtros</strong> e
          coloque na <strong>Lista de espera</strong>, com o serviço, o profissional (ou qualquer
          um) e o dia ou as preferências dele.
        </p>
        <Bullets
          items={[
            'Quando abre uma vaga que combina, ela aparece ao lado do nome.',
            <>
              Use <strong>Convidar</strong> para guardar o horário por um prazo (30 minutos a 24
              horas) e mandar o convite pelo WhatsApp.
            </>,
            <>
              Ele aceitou? <strong>Aceitou — agendar</strong> marca o horário.
            </>,
          ]}
        />
      </Section>

      <Section id="atalhos" title="Atalhos de teclado (computador)">
        <Fields
          rows={[
            ['T', 'Ir para hoje'],
            ['D · W · M', 'Visão dia, semana ou mês'],
            ['← → (ou K J)', 'Período anterior / próximo'],
            ['C', 'Criar agendamento'],
            ['Esc', 'Fechar cartão'],
            ['?', 'Mostrar a lista de atalhos'],
          ]}
        />
      </Section>

      <Section id="duvidas" title="Dúvidas comuns">
        <Sub>Agenda e cliente</Sub>
        <Faq
          items={[
            [
              'O cliente marcou pelo link. Onde vejo?',
              'Na agenda, como qualquer horário, e no sininho ("cliente marcou"). Remarcações e cancelamentos feitos pelo cliente também aparecem no sino.',
            ],
            [
              'Mudei o preço do serviço. O horário marcado muda?',
              'Não. Cada agendamento guarda o preço do dia em que foi marcado.',
            ],
            [
              'A profissional vê a agenda de todos?',
              'Quem entra com o login de profissional vê só os próprios horários e clientes.',
            ],
            [
              'Concluí sem querer. E agora?',
              'Abra o agendamento e mude o status de volta. A receita, a comissão e o estoque são desfeitos.',
            ],
          ]}
        />
      </Section>
    </TutorialPage>
  );
}

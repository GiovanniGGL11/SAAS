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
  { id: 'whatsapp', label: 'WhatsApp automático' },
  { id: 'ia', label: 'Assistente de IA' },
  { id: 'preferencias', label: 'Preferências do negócio' },
  { id: 'prontuario', label: 'Ramo e prontuário' },
  { id: 'campos', label: 'Campos personalizados' },
  { id: 'outros', label: 'Lembretes, fuso e equipe' },
  { id: 'duvidas', label: 'Dúvidas comuns' },
] as const;

export function SettingsTutorial() {
  return (
    <TutorialPage
      title="Como usar as Configurações"
      description="WhatsApp automático, assistente de IA, preferências, ramo e prontuário, campos próprios, lembretes, fuso horário e equipe."
      backHref="/configuracoes"
      backLabel="Voltar às Configurações"
      sections={SECTIONS}
    >
      <Section id="whatsapp" eyebrow="O que mais economiza tempo" title="WhatsApp automático">
        <p>
          Mensagens que saem sozinhas do WhatsApp do salão, pela Z-API (um serviço que conecta o
          WhatsApp ao sistema).
        </p>
        <Steps
          items={[
            'Crie uma instância em z-api.io e conecte o celular do salão pelo QR code.',
            'Cole aqui o ID da instância, o Token da instância e o Client-Token (em Segurança da conta, na Z-API).',
            'Ligue as mensagens que quiser:',
          ]}
        />
        <Fields
          rows={[
            [
              'Confirmação ao marcar',
              'Assim que o horário é marcado, com o link para confirmar ou cancelar.',
            ],
            ['Lembrete na véspera', 'Todo dia às 8h, para os horários do dia seguinte.'],
            ['Pedido de avaliação', 'Logo depois de cobrar o atendimento.'],
            ['Parabéns no aniversário', 'Às 8h do dia do aniversário, uma vez por ano.'],
            [
              'Retorno do paciente',
              'Às 8h do dia do retorno sugerido do serviço. Desligado, o sistema avisa na tela para você enviar.',
            ],
          ]}
        />
        <Tip>
          A Z-API cobra direto de você, conforme o plano dela; o Atendafy não cobra nada pelo envio.
          Sem a Z-API, a mensagem continua pronta no botão do WhatsApp de cada atendimento. Em{' '}
          <strong>Últimos envios</strong> você confere o que saiu e o que falhou.
        </Tip>
      </Section>

      <Section id="ia" title="Assistente de IA">
        <p>
          O assistente (botão no topo da tela) responde perguntas sobre o seu negócio e, se você
          permitir, prepara alterações. Escolha a <strong>Autonomia</strong>:
        </p>
        <Fields
          rows={[
            ['Sugerir', 'Só consulta e sugere. Não prepara nenhuma alteração.'],
            [
              'Pedir aprovação',
              'Prepara a alteração (Ex.: marcar um horário) e só faz depois que você confirmar.',
            ],
            [
              'Executar regras autorizadas',
              'Faz sozinho o que você autorizou antes, nas Rotinas autorizadas (plano Pro).',
            ],
          ]}
        />
        <p>
          Cada resposta usa créditos de IA do plano; o medidor fica no próprio assistente. No plano
          sem IA, dá para fazer 3 perguntas de demonstração.
        </p>
      </Section>

      <Section id="preferencias" title="Preferências do negócio">
        <Bullets
          items={[
            <>
              <strong>Linguagem da IA</strong>: o tom das mensagens (cordial, formal ou
              descontraído) e observações (Ex.: &quot;chamar de você, sem gírias&quot;).
            </>,
            <>
              <strong>Horário para contato automático</strong>: de que horas a que horas as rotinas
              automáticas (como o convite da lista de espera) podem mandar mensagem aos clientes.
            </>,
            <>
              <strong>Quando chamar uma pessoa</strong>: assunto de saúde ou reação e reclamação
              fazem a IA sugerir que alguém da equipe assuma, em vez de responder.
            </>,
            <>
              <strong>Desconto máximo em orçamentos</strong> e quais <strong>avisos no sino</strong>{' '}
              aparecem (tarefas vencendo, orçamentos aguardando, propostas da IA).
            </>,
            'Resumo do dia: o horário em que ele fica pronto sozinho (plano Pro).',
          ]}
        />
      </Section>

      <Section id="prontuario" title="Ramo e prontuário">
        <p>
          Escolha o <strong>Ramo do negócio</strong>. Nos ramos de saúde, estética e odontologia, o{' '}
          <strong>Prontuário do paciente</strong> liga sozinho (opção &quot;Pelo ramo&quot;). Dá
          também para deixar sempre ligado ou desligado.
        </p>
        <p>
          O ramo também escolhe os modelos de texto da evolução no prontuário (estética, odonto,
          psicologia, nutrição, fisioterapia, veterinária).
        </p>
      </Section>

      <Section id="campos" title="Campos personalizados">
        <p>
          Informações que só o seu negócio usa, em clientes, serviços, oportunidades e serviços em
          andamento. Ex.: &quot;Tipo de pele&quot;, &quot;Placa do carro&quot;, &quot;Raça do
          pet&quot;.
        </p>
        <Fields
          rows={[
            [
              'Nome e tipo',
              'Texto curto ou longo, número, data, sim ou não, seleção única ou múltipla.',
            ],
            ['Obrigatório', 'Não deixa salvar sem preencher.'],
            ['Quem vê e edita', 'Toda a equipe ou só administradores.'],
          ]}
        />
      </Section>

      <Section id="outros" title="Lembretes, fuso horário e equipe">
        <Bullets
          items={[
            <>
              <strong>Lembretes de horário por e-mail</strong>: na véspera, para o cliente que tem
              e-mail no cadastro.
            </>,
            <>
              <strong>Fuso horário</strong>: o da sua cidade. A agenda, o link e os lembretes usam
              esse fuso. O tema (claro ou escuro) também fica aqui.
            </>,
            <>
              <strong>Organização e membros</strong>: convide quem trabalha na recepção ou
              administra o sistema. O login de cada profissional é feito em Profissionais.
            </>,
            <>
              O que o cliente vê (agendamento online, pagamento adiantado por PIX, área do cliente e
              avaliação no Google) fica em <strong>Link do cliente</strong>.
            </>,
          ]}
        />
      </Section>

      <Section id="duvidas" title="Dúvidas comuns">
        <Faq
          items={[
            [
              'Liguei o lembrete, mas não saiu nada.',
              'Confira em Últimos envios: a falha aparece com o motivo. O mais comum é o celular do salão desconectado da Z-API ou cliente sem telefone.',
            ],
            ['Quem pode mexer nas Configurações?', 'Só o dono e os administradores.'],
            [
              'Desligar o prontuário apaga as evoluções?',
              'Não. Elas ficam guardadas e voltam a aparecer quando o prontuário for ligado de novo.',
            ],
          ]}
        />
      </Section>
    </TutorialPage>
  );
}

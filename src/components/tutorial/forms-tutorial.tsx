import {
  Bullets,
  Faq,
  Fields,
  Path,
  Section,
  Steps,
  Sub,
  Tip,
  TutorialPage,
} from '@/components/tutorial/tutorial-kit';
import { SendFormDemo } from '@/components/tutorial/demo/forms-demos';

const SECTIONS = [
  { id: 'modelo', label: 'Criar um modelo' },
  { id: 'pdf', label: 'Importar a ficha em PDF' },
  { id: 'regras', label: 'Quando a ficha é pedida' },
  { id: 'enviar', label: 'Enviar para o cliente' },
  { id: 'acompanhar', label: 'Respostas e revisão' },
  { id: 'acesso', label: 'Quem vê as respostas' },
  { id: 'duvidas', label: 'Dúvidas comuns' },
] as const;

export function FormsTutorial() {
  return (
    <TutorialPage
      title="Como usar as Fichas"
      description="Anamnese, termos, questionários e checklists: o cliente preenche e assina pelo celular, e tudo fica no histórico dele."
      backHref="/fichas"
      backLabel="Voltar às Fichas"
      sections={SECTIONS}
    >
      <Section id="modelo" eyebrow="Comece por aqui" title="Criar um modelo">
        <Path items={['Fichas', 'Modelos', 'Novo modelo']} />
        <p>
          O modelo é a ficha em branco. Você monta uma vez e usa com todos os clientes. Para começar
          rápido, use <strong>Começar de um modelo pronto</strong> (por exemplo, Anamnese de saúde e
          estética) e adapte.
        </p>
        <Steps
          items={[
            'Dê um nome e organize as perguntas em seções (Ex.: Dados de saúde, Termo de consentimento).',
            <>
              Em cada pergunta, escolha o tipo: texto curto ou longo, sim ou não, escolha única ou
              várias, data, número, <strong>CEP</strong> ou <strong>assinatura</strong>. Marque se é
              obrigatória. No tipo CEP, o sistema confere se o CEP existe e preenche o endereço.
            </>,
            <>
              Em <strong>Quem responde</strong>, por seção: Todos, Cliente ou{' '}
              <strong>Só a equipe</strong> (anotações internas que o cliente não vê).
            </>,
            <>
              Use <strong>Mostrar esta pergunta</strong> para perguntas que só aparecem dependendo
              de outra resposta (Ex.: &quot;Qual alergia?&quot; só se respondeu &quot;Sim&quot;).
            </>,
            <>
              Ligue <strong>Alerta no prontuário</strong> nas perguntas importantes (alergia,
              medicamento, gestação). A resposta aparece em vermelho no topo do prontuário do
              paciente. Em &quot;sim ou não&quot;, só quando a resposta é Sim.
            </>,
            <>
              Confira na <strong>Prévia</strong> (celular ou computador, visão do cliente ou da
              equipe) e clique em <strong>Salvar modelo</strong>.
            </>,
          ]}
        />
        <Tip>
          Mudar as perguntas de um modelo cria uma versão nova. As fichas que já foram preenchidas
          continuam com a versão que o cliente respondeu.
        </Tip>
      </Section>

      <Section id="pdf" title="Importar a ficha que você já usa (PDF)">
        <Path items={['Fichas', 'Modelos', 'Importar ficha em PDF']} />
        <p>
          Envie o PDF da ficha que você já usa (até 4 MB). A IA lê o arquivo e monta o modelo com as
          perguntas. Depois é só conferir, ajustar e salvar.
        </p>
        <Tip tone="warn">
          A importação usa créditos de IA do seu plano. Revise sempre as perguntas antes de usar o
          modelo com clientes.
        </Tip>
      </Section>

      <Section id="regras" title="Quando a ficha é pedida">
        <p>Nas configurações do modelo:</p>
        <Fields
          rows={[
            ['Quem preenche', 'Só a equipe, o cliente pelo link, ou os dois.'],
            [
              'Pedir de novo',
              'A cada atendimento, uma única vez, ou depois de um prazo (Ex.: anamnese a cada 180 dias).',
            ],
            [
              'Para iniciar o atendimento',
              'Não exigir, exigir a ficha enviada ou exigir a ficha revisada antes de começar.',
            ],
            [
              'Serviços que pedem esta ficha',
              'Ao marcar um desses serviços, a ficha aparece no atendimento para ser pedida.',
            ],
          ]}
        />
      </Section>

      <Section id="enviar" title="Enviar para o cliente preencher">
        <p>
          O cliente abre no celular, responde, assina com o dedo e envia. O link vale 7 dias. Nada é
          enviado sozinho: o WhatsApp abre com a mensagem pronta e você aperta enviar.
        </p>
        <SendFormDemo />
        <Sub>Pela agenda (o jeito mais rápido)</Sub>
        <p>
          Abra o agendamento e, em <strong>Fichas e registro</strong>, toque em{' '}
          <strong>Enviar pelo WhatsApp</strong> na anamnese. A mensagem já cita o serviço, o dia e o
          horário. Se o cliente já respondeu e a ficha ainda vale, o sistema avisa em vez de mandar
          de novo.
        </p>
        <Sub>Pelo número do telefone</Sub>
        <Path items={['Fichas', 'Enviar ficha pelo WhatsApp']} />
        <Steps
          items={[
            'Escolha a ficha e digite o WhatsApp do cliente. Toque em Consultar número.',
            'Já é cliente: o nome aparece. Toque em Enviar pelo WhatsApp.',
            <>
              Não é cliente: responda <strong>Sim, cliente novo</strong>. Depois escolha:{' '}
              <strong>Enviar cadastro + ficha</strong> (a pessoa faz o próprio cadastro e segue
              direto para a ficha, num link só, e já entra como cliente) ou{' '}
              <strong>Só a ficha</strong> (você digita o nome e ela entra só com nome e telefone).
            </>,
          ]}
        />
        <Sub>Pela ficha do cliente</Sub>
        <p>
          Na aba Fichas do cliente, clique em <strong>Nova ficha</strong>, escolha o modelo e use{' '}
          <strong>Gerar link</strong> e <strong>Copiar link</strong>. Prefere preencher junto com o
          cliente, na hora? Abra a ficha e preencha você mesmo; o rascunho fica salvo enquanto você
          digita.
        </p>
      </Section>

      <Section id="acompanhar" title="Respostas e revisão">
        <Path items={['Fichas', 'Preenchimentos']} />
        <Bullets
          items={[
            <>
              Cada ficha mostra a situação: pedida, em rascunho, enviada ou revisada. Avisos como{' '}
              <strong>Atualização necessária</strong> (passou do prazo) e{' '}
              <strong>Link ativo</strong> aparecem ao lado.
            </>,
            <>
              Abra a ficha, confira e clique em <strong>Revisar</strong> e depois em{' '}
              <strong>Marcar como revisada</strong>.
            </>,
            <>
              <strong>Exportar PDF</strong> gera a ficha preenchida e assinada, para guardar ou
              imprimir.
            </>,
          ]}
        />
      </Section>

      <Section id="acesso" title="Quem vê as respostas">
        <Path items={['Fichas', 'Acesso e privacidade']} />
        <p>
          Fichas guardam dados de saúde. O dono e os administradores leem, revisam e exportam por
          padrão. Para cada pessoa da equipe, você escolhe o que ela pode fazer:
        </p>
        <Fields
          rows={[
            ['Pedir fichas e gerar link', 'Não dá acesso às respostas.'],
            ['Ler respostas', 'Inclui os registros das sessões e as assinaturas.'],
            ['Preencher em nome do cliente', 'Requer ler respostas.'],
            ['Revisar', 'Requer ler respostas.'],
            ['Exportar PDF', 'Requer ler respostas.'],
            ['Gerenciar modelos', 'Criar e editar modelos (administradores já podem).'],
            [
              'Ver histórico de acesso',
              'Quem abriu cada ficha e quando (administradores já podem).',
            ],
          ]}
        />
        <p>
          Dá também para limitar uma pessoa a{' '}
          <strong>só as fichas dos próprios atendimentos</strong>.
        </p>
      </Section>

      <Section id="duvidas" title="Dúvidas comuns">
        <Faq
          items={[
            [
              'O cliente não recebeu a ficha.',
              'O sistema não envia sozinho: gere o link, copie e mande pelo WhatsApp. O link vale 7 dias; se venceu, gere um novo.',
            ],
            [
              'Posso mudar uma ficha que o cliente já respondeu?',
              'A resposta enviada fica guardada como foi. Se precisar corrigir, peça uma nova ficha ao cliente.',
            ],
            [
              'A assinatura tem valor?',
              'A assinatura feita na tela fica guardada na ficha enviada e entra no PDF exportado. Para documentos com exigência legal específica, confirme com o seu advogado.',
            ],
            [
              'Não consigo abrir Fichas no plano Básico.',
              'Fichas estão no plano Profissional. No Básico, dá para testar grátis por 3 dias pelo botão do cartão.',
            ],
          ]}
        />
      </Section>
    </TutorialPage>
  );
}

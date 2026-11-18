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
  { id: 'lista', label: 'A lista de clientes' },
  { id: 'ficha', label: 'A ficha do cliente' },
  { id: 'registros', label: 'Registros de evolução' },
  { id: 'area', label: 'Área do cliente' },
  { id: 'retorno', label: 'Retorno do paciente' },
  { id: 'prontuario', label: 'Prontuário' },
  { id: 'importar', label: 'Importar clientes' },
  { id: 'duvidas', label: 'Dúvidas comuns' },
] as const;

export function ClientsTutorial() {
  return (
    <TutorialPage
      title="Como usar os Clientes"
      description="A ficha completa de cada cliente: histórico, fichas, pacotes, registros com fotos e a área onde o próprio cliente acompanha tudo."
      backHref="/clientes"
      backLabel="Voltar aos Clientes"
      sections={SECTIONS}
    >
      <Section id="lista" title="A lista de clientes">
        <p>Os filtros no topo separam quem precisa de atenção:</p>
        <Fields
          rows={[
            ['VIP', 'Clientes que você marcou como VIP na ficha.'],
            ['Sumidos', 'Sem visita há mais de 60 dias. Bom para chamar de volta.'],
            ['Aniversariantes', 'Fazem aniversário neste mês.'],
            ['Novos', 'Cadastrados nos últimos 30 dias.'],
            ['Arquivados', 'Saem das listas e da agenda, mas o histórico fica guardado.'],
          ]}
        />
      </Section>

      <Section id="ficha" title="A ficha do cliente">
        <p>Clique no nome para abrir. No topo ficam os atalhos:</p>
        <Bullets
          items={[
            <>
              <strong>Agendar</strong> abre a agenda com o cliente já escolhido.
            </>,
            <>
              <strong>WhatsApp</strong> abre a conversa com o número do cadastro.
            </>,
            <>
              <strong>Área do cliente</strong> gera o link pessoal dele (veja abaixo).
            </>,
            <>
              <strong>Recebe promoções</strong>: desligado, o cliente fica fora das campanhas e do
              parabéns de aniversário. Confirmações e lembretes continuam.
            </>,
          ]}
        />
        <p>As abas organizam o resto:</p>
        <Fields
          rows={[
            ['Resumo', 'Dados, observações, retorno sugerido e o histórico de agendamentos.'],
            ['Fichas e formulários', 'Anamneses e termos pedidos e respondidos.'],
            ['Pacotes e tratamentos', 'Pacotes e assinaturas do cliente, com as sessões usadas.'],
            ['Histórico das sessões', 'O que foi feito em cada sessão.'],
            ['Orçamentos', 'Orçamentos enviados e aprovados.'],
            ['Linha do tempo', 'Tudo o que aconteceu com o cliente, em ordem.'],
            ['Registros', 'Evolução de tratamentos, com fotos de cada dia.'],
          ]}
        />
      </Section>

      <Section id="registros" title="Registros de evolução (com fotos)">
        <Path items={['Clientes', 'Cliente', 'Registros']} />
        <p>
          Para acompanhar tratamentos com várias sessões (depilação, limpeza de pele, tratamento
          capilar) e mostrar a evolução ao cliente.
        </p>
        <Steps
          items={[
            <>
              Clique em <strong>Novo registro</strong> e dê o nome do tratamento (Ex.: Limpeza de
              pele).
            </>,
            <>
              Em cada sessão, <strong>Adicionar dia</strong>: escreva as anotações e adicione as
              fotos do dia.
            </>,
            <>
              O que for só para a equipe vai em <strong>Anotação interna</strong>: o cliente não vê.
            </>,
          ]}
        />
        <p>
          O bloco mais recente fica aberto e os outros recolhidos; cada um mostra os 3 dias mais
          recentes, com &quot;Ver todos&quot; para o resto.
        </p>
        <Tip>
          As fotos ficam guardadas de forma privada. Elas abrem numa janela dentro do sistema e o
          cliente só vê as dele, pela área do cliente.
        </Tip>
      </Section>

      <Section id="area" title="Área do cliente">
        <Path items={['Clientes', 'Cliente', 'Área do cliente']} />
        <p>
          Um link pessoal que o cliente abre no celular, sem senha. Ao abrir, o acesso fica salvo no
          aparelho dele.
        </p>
        <Bullets
          items={[
            'Ver os próximos horários, confirmar, remarcar e cancelar (até 2 horas antes).',
            'Acompanhar a fidelidade, os pacotes e as sessões.',
            'Preencher as fichas pedidas e ver os registros de evolução, menos o que for interno.',
          ]}
        />
        <p>
          Envie com <strong>Enviar pelo WhatsApp</strong> ou <strong>Copiar mensagem</strong>. Gerar
          um link novo desativa todos os anteriores, por exemplo se o cliente trocou de celular.
        </p>
      </Section>

      <Section id="retorno" title="Retorno do paciente">
        <p>
          Se o serviço tem <strong>Sugerir retorno após</strong> (em Serviços), o sistema calcula
          quando cada cliente deveria voltar, contando do último atendimento concluído. Quem já tem
          horário marcado não entra.
        </p>
        <Bullets
          items={[
            <>
              <strong>3 dias antes:</strong> o sininho avisa &quot;retornos chegando&quot;.
            </>,
            <>
              <strong>No dia:</strong> aparece uma janela na tela com a mensagem pronta. Aperte{' '}
              <strong>Enter</strong> para abrir o WhatsApp do cliente e envie. Ou escolha{' '}
              <strong>Lembrar amanhã</strong> (volta em 24 horas) ou <strong>Não chamar</strong>.
            </>,
            <>
              <strong>Automático:</strong> ligue <strong>Retorno do paciente</strong> em
              Configurações › WhatsApp automático e a mensagem sai sozinha às 8h, pelo número do
              salão. Quem pediu para não receber promoções fica de fora.
            </>,
          ]}
        />
        <p>
          A janela e o aviso aparecem para o dono e a recepção. Quem entra com login de profissional
          não recebe.
        </p>
      </Section>

      <Section id="prontuario" title="Prontuário (saúde, estética e odonto)">
        <p>
          Nesses ramos, a ficha do cliente ganha o botão <strong>Prontuário</strong> (ligue ou
          desligue em Configurações › Ramo e prontuário). Lá ficam:
        </p>
        <Bullets
          items={[
            'Idade, contato, convênio e, em vermelho, os alertas da anamnese (alergia, medicamentos...).',
            'A próxima consulta e o retorno previsto.',
            <>
              A <strong>Evolução</strong> de cada atendimento, com modelos de texto do seu ramo. Ela
              nunca é apagada: para corrigir, use <strong>Retificar</strong> e a anterior fica
              visível como retificada.
            </>,
            <>
              O <strong>Plano de tratamento</strong>: os procedimentos dos orçamentos aprovados, com
              as sessões feitas e as que faltam. Marque com <strong>Sessão feita</strong> ou nas
              caixinhas da Nova evolução. Orçamento que virou pacote anda sozinho pela comanda.
            </>,
            <>
              Os <strong>Documentos</strong>: receituário, atestado, laudo, declaração de
              comparecimento e orientações, com modelo pronto. <strong>Emitir e imprimir</strong>{' '}
              abre a versão para imprimir ou salvar em PDF, com o nome e o registro do profissional
              (cadastre o registro em Profissionais). Errou? Anule com o motivo e emita outro.
            </>,
            <>
              Os <strong>Anexos</strong>: exames e documentos em PDF ou imagem, até 4 MB, guardados
              de forma privada.
            </>,
            'As fichas e termos, os registros com fotos e as sessões.',
          ]}
        />
      </Section>

      <Section id="importar" title="Importar clientes de outro sistema">
        <Path items={['Clientes', 'Importar']} />
        <p>
          Envie uma planilha <strong>CSV</strong> (o Excel e o Google Planilhas salvam nesse
          formato). A primeira linha precisa ter os títulos das colunas: nome e, se tiver, telefone,
          e-mail, CPF, nascimento e endereço.
        </p>
        <p>
          Quem já está cadastrado com o mesmo telefone é pulado, então dá para importar de novo sem
          duplicar. Só o dono e os administradores importam.
        </p>
      </Section>

      <Section id="duvidas" title="Dúvidas comuns">
        <Faq
          items={[
            [
              'Posso apagar um cliente?',
              'Arquive. Ele sai das listas e da agenda, e o histórico continua guardado.',
            ],
            [
              'A profissional vê todos os clientes?',
              'Quem entra com login de profissional vê só os clientes que ela atende.',
            ],
            [
              'O cliente perdeu o link da área.',
              'Gere um link novo na ficha dele. O antigo para de funcionar.',
            ],
            [
              'O cliente pediu para não receber promoções.',
              'Desligue "Recebe promoções" na ficha. Confirmações e lembretes continuam chegando.',
            ],
          ]}
        />
      </Section>
    </TutorialPage>
  );
}

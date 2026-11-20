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
import { CouponDemo } from '@/components/tutorial/demo/business-demos';

const SECTIONS = [
  { id: 'cupons', label: 'Cupons de desconto' },
  { id: 'vales', label: 'Vales-presente' },
  { id: 'mensagens', label: 'Mensagens para grupos' },
  { id: 'indicacoes', label: 'Indicações' },
  { id: 'avaliacoes', label: 'Avaliações' },
  { id: 'duvidas', label: 'Dúvidas comuns' },
] as const;

export function CampaignsTutorial() {
  return (
    <TutorialPage
      title="Como usar Cupons e campanhas"
      description="Cupons, vales-presente, mensagens para grupos de clientes, indicações e avaliações: tudo para trazer clientes e fazer voltar."
      backHref="/campanhas"
      backLabel="Voltar aos Cupons"
      sections={SECTIONS}
    >
      <Section id="cupons" title="Cupons de desconto">
        <Path items={['Cupons', 'Criar cupom']} />
        <CouponDemo />
        <Fields
          rows={[
            ['Código', 'O que o cliente fala ou digita (Ex.: BEMVINDO10).'],
            ['Tipo de desconto', 'Percentual (%) ou valor fixo (R$).'],
            ['Limite de usos', 'Quantas vezes pode ser usado no total. Em branco = ilimitado.'],
            ['Validade', 'Depois dessa data, o cupom não vale mais.'],
            ['Ativo', 'Desligue para pausar sem apagar.'],
          ]}
        />
        <p>
          Para usar: na comanda (Concluir e cobrar), digite o código. O sistema confere se está
          ativo, na validade e dentro do limite, e o desconto entra sozinho.
        </p>
      </Section>

      <Section id="vales" title="Vales-presente">
        <p>
          Ótimo para Dia das Mães, Natal e aniversários. Venda em{' '}
          <strong>Vales-presente › Vender vale-presente</strong> (ou no Caixa, em Nova venda): o
          dinheiro entra no caixa na hora e o sistema gera um código.
        </p>
        <p>
          Quem ganhou usa o código na comanda. Se o atendimento custar menos que o vale, o saldo
          fica guardado para a próxima vez. Cancelar o vale faz o código deixar de valer; o valor
          recebido continua no Financeiro (devolva por fora, se for o caso).
        </p>
      </Section>

      <Section id="mensagens" title="Mensagens para grupos de clientes">
        <Path items={['Cupons', 'Mensagens', 'Nova campanha']} />
        <Steps
          items={[
            <>
              Escolha <strong>Para quem</strong>: sumidos há mais de 60 dias, aniversariantes do
              mês, clientes VIP, novos (últimos 30 dias) ou todos os ativos.
            </>,
            <>
              Escreva a mensagem (ou use um modelo pronto). Use <strong>{'{nome}'}</strong> para o
              primeiro nome do cliente e <strong>{'{cupom}'}</strong> para o código do cupom.
            </>,
            <>
              Envie: um por um (<strong>Enviar</strong> abre o WhatsApp com a mensagem pronta) ou,
              com o WhatsApp automático do salão conectado,{' '}
              <strong>Enviar todos automaticamente</strong> (uma mensagem a cada ~2 segundos).
            </>,
          ]}
        />
        <Tip>
          Comece pelos sumidos: é o grupo que mais volta com uma mensagem simples. Quem pediu para
          não receber promoções fica de fora sozinho.
        </Tip>
      </Section>

      <Section id="indicacoes" title="Indicações">
        <p>
          Pergunte &quot;como conheceu a gente?&quot; no primeiro atendimento e registre quem
          indicou.
        </p>
        <Steps
          items={[
            'Em Indicações, informe quem indicou, quem foi indicado e a recompensa combinada (Ex.: 10% no próximo serviço).',
            <>
              Escolha a condição: <strong>primeiro atendimento concluído</strong> ou{' '}
              <strong>primeiro pagamento recebido</strong>.
            </>,
            <>
              Quando a condição acontece, a indicação muda para{' '}
              <strong>Condição cumprida — recompensa liberada</strong>. Entregue a recompensa e
              registre o que foi concedido.
            </>,
          ]}
        />
        <p>
          O sistema não deixa indicar a si mesmo nem duplicar a indicação. Se o atendimento for
          desfeito antes da recompensa, a indicação volta a aguardar.
        </p>
      </Section>

      <Section id="avaliacoes" title="Avaliações">
        <Bullets
          items={[
            'Peça a avaliação logo depois de cobrar: é quando o cliente mais responde (sai sozinha com o WhatsApp automático ligado).',
            'O cliente dá a nota pelo link. Depois de avaliar, qualquer nota, ele recebe o convite opcional para avaliar no Google.',
            <>
              Nota baixa? Use <strong>Criar tarefa para tratar</strong>: vira uma tarefa em
              Atividades (uma por avaliação). Nada é enviado ao cliente sozinho.
            </>,
          ]}
        />
      </Section>

      <Section id="duvidas" title="Dúvidas comuns">
        <Faq
          items={[
            [
              'Posso usar cupom e vale-presente juntos?',
              'Sim. Na comanda, o cupom dá o desconto e o vale paga o que sobrar.',
            ],
            [
              'Mensagens e Indicações aparecem bloqueadas.',
              'As duas estão no plano Profissional. No Básico, Indicações pode ser testada grátis por 3 dias; Mensagens para grupos ficam fora do teste, para nenhum cliente receber mensagem de um teste.',
            ],
            [
              'O cliente pediu para não receber promoções.',
              'Na ficha do cliente, desligue "Recebe promoções". Ele sai das campanhas e do parabéns; confirmação e lembrete continuam.',
            ],
          ]}
        />
      </Section>
    </TutorialPage>
  );
}

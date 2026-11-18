import { STOCK_UNITS } from '@/lib/stock-units';
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

const SECTIONS = [
  { id: 'unidade', label: 'Escolher a unidade' },
  { id: 'produto', label: 'Cadastrar um produto' },
  { id: 'servico', label: 'Materiais de cada serviço' },
  { id: 'entrada', label: 'Entrada de mercadoria' },
  { id: 'movimentacao', label: 'Ajustes e perdas' },
  { id: 'venda', label: 'Vender produtos' },
  { id: 'alertas', label: 'Estoque baixo e avisos' },
  { id: 'exemplo', label: 'Exemplo: limpeza de pele' },
  { id: 'duvidas', label: 'Dúvidas comuns' },
] as const;

export function StockTutorial() {
  return (
    <TutorialPage
      title="Como usar o Estoque"
      description="Produtos de revenda e materiais de uso, baixados sozinhos a cada atendimento, com custo médio e aviso de estoque baixo."
      backHref="/estoque"
      backLabel="Voltar ao Estoque"
      sections={SECTIONS}
    >
      <Section id="unidade" eyebrow="Comece por aqui" title="Escolher a unidade de controle">
        <p>
          Cada produto é contado numa unidade. É nela que você informa o estoque, o custo e quanto
          cada serviço gasta. Escolha a unidade em que o produto é <strong>usado</strong>, não a em
          que ele é comprado.
        </p>
        <Fields rows={STOCK_UNITS.map((u) => [u.label, unitHint(u.value)])} />
        <Tip>
          Sérum comprado em frasco de 500 ml e usado de 20 em 20 ml: cadastre em <strong>ml</strong>
          , com estoque 500 e custo por ml (R$ 80 ÷ 500 = R$ 0,16).
        </Tip>
      </Section>

      <Section id="produto" title="Cadastrar um produto">
        <Path items={['Estoque', 'Novo produto']} />
        <Fields
          rows={[
            ['Nome', 'Como aparece nas listas, na comanda e nos avisos.'],
            ['SKU (opcional)', 'Código interno ou de barras, para achar pela busca.'],
            ['Unidade de controle', 'un, par, ml, g, cx, pct ou fl (veja acima).'],
            [
              'Custo por unidade',
              'Quanto custa 1 unidade de controle. Depois, cada entrada de mercadoria recalcula o custo médio sozinha.',
            ],
            ['Preço de venda', 'Para produtos de revenda. Material só de uso pode ficar em 0.'],
            ['Estoque inicial', 'Quanto você tem hoje, na unidade escolhida.'],
            [
              'Estoque mínimo',
              'Abaixo disso, o produto entra em "Estoque baixo". Em 0, não avisa.',
            ],
          ]}
        />
      </Section>

      <Section id="servico" title="Materiais de cada serviço">
        <p>
          O jeito mais prático de controlar material: dizer uma vez o que cada serviço gasta. A cada
          atendimento <strong>concluído</strong>, os materiais saem do estoque sozinhos.
        </p>
        <Steps
          items={[
            <>
              Em <strong>Serviços</strong>, abra o serviço e ligue{' '}
              <strong>Este serviço consome algo do estoque?</strong>
            </>,
            <>
              Escolha cada material e a quantidade por atendimento, na unidade dele (1 par de luvas,
              20 ml de sérum). O material ainda não existe? Use{' '}
              <strong>+ Cadastrar material novo</strong> ali mesmo.
            </>,
            <>
              Embaixo de cada material aparece quanto há em estoque e para quantos atendimentos ele
              dá. No fim, o <strong>custo de material por atendimento</strong>.
            </>,
          ]}
        />
        <Tip tone="warn">
          Se a conclusão do atendimento for desfeita, ou ele for cancelado, os materiais voltam para
          o estoque. Se faltar material, o sistema baixa o que houver e registra quanto faltou: o
          estoque nunca fica negativo por causa de um atendimento.
        </Tip>
      </Section>

      <Section id="entrada" title="Entrada de mercadoria (compra do fornecedor)">
        <Path items={['Estoque', 'Entrada de mercadoria']} />
        <p>Num passo só, a compra entra no estoque, atualiza o custo e vai para o Financeiro.</p>
        <Steps
          items={[
            'Informe o fornecedor e o número da nota, se quiser (os dois são opcionais).',
            'Adicione cada produto com a quantidade e o custo por unidade desta compra.',
            <>
              Escolha <strong>Paga agora</strong> (com a forma de pagamento) ou{' '}
              <strong>Conta a pagar</strong> (com o vencimento).
            </>,
          ]}
        />
        <p>
          O custo do produto vira o <strong>custo médio</strong>: 10 un a R$ 5 em estoque + 10 un
          compradas a R$ 7 = 20 un a R$ 6. É esse custo que a Precificação e o Lucro usam.
        </p>
        <p>
          O botão <strong>Compras</strong> mostra as últimas 50 entradas. Entrada de mercadoria e
          Compras aparecem só para o dono e os administradores.
        </p>
      </Section>

      <Section id="movimentacao" title="Ajustes, perdas e contagem">
        <Path items={['Estoque', 'Nova movimentação']} />
        <p>
          Para o que não é compra nem atendimento: um frasco que quebrou, um brinde, a correção
          depois de contar o estoque. Escolha o produto, entrada ou saída, a quantidade e o motivo.
        </p>
        <p>
          O botão <strong>Histórico</strong> mostra as 100 movimentações mais recentes, com o motivo
          de cada uma (compra, consumo no atendimento, estorno, venda, ajuste).
        </p>
      </Section>

      <Section id="venda" title="Vender produtos">
        <Bullets
          items={[
            <>
              <strong>Na comanda do atendimento:</strong> em &quot;Produtos vendidos&quot;, adicione
              o produto. Ele sai do estoque e entra no caixa junto com o atendimento.
            </>,
            <>
              <strong>No balcão, sem atendimento:</strong> em <strong>Caixa › Nova venda</strong>,
              aba Produtos. Dá para receber na hora ou deixar no fiado do cliente.
            </>,
          ]}
        />
        <p>
          Nas duas, o sistema não deixa vender mais do que há em estoque e guarda o custo e o preço
          do dia da venda (o lucro do mês não muda se o custo mudar depois).
        </p>
      </Section>

      <Section id="alertas" title="Estoque baixo e avisos">
        <Bullets
          items={[
            <>
              Quando algum produto chega ao mínimo, aparece uma faixa vermelha no topo do Estoque.
              Toque nela para ver só os produtos em <strong>Estoque baixo</strong>.
            </>,
            <>
              O sino de avisos mostra os materiais que vão faltar para os atendimentos já marcados
              nos próximos dias, antes de acabarem.
            </>,
          ]}
        />
      </Section>

      <Section id="exemplo" title="Exemplo: limpeza de pele">
        <p>
          A limpeza de pele gasta 1 par de luvas, 1 máscara, 1 touca e 20 ml de sérum. No estoque:
          50 pares de luva, 40 máscaras, 40 toucas e 500 ml de sérum.
        </p>
        <Steps
          items={[
            'Cadastre luva em "par", máscara e touca em "un" e sérum em "ml".',
            'No serviço Limpeza de pele, ligue o consumo e coloque 1, 1, 1 e 20.',
            'Conclua um atendimento: ficam 49 pares, 39 máscaras, 39 toucas e 480 ml.',
            'O sérum dá para 24 atendimentos (480 ÷ 20). O serviço mostra isso ao lado do material.',
          ]}
        />
      </Section>

      <Section id="duvidas" title="Dúvidas comuns">
        <Faq
          items={[
            [
              'O material não saiu do estoque. Por quê?',
              'A baixa acontece quando o atendimento é concluído (comanda), não ao agendar. Confira também se o serviço tem os materiais cadastrados.',
            ],
            [
              'Comprei em caixa e uso por unidade. Como cadastro?',
              'Cadastre na unidade de uso (un) e, na entrada de mercadoria, informe a quantidade de unidades e o custo de cada unidade.',
            ],
            [
              'Posso apagar um produto?',
              'Desative-o (coluna Ativo). Ele some das listas, mas o histórico de compras e vendas continua guardado.',
            ],
            [
              'A profissional vê o estoque?',
              'Não. Quem entra com o login de profissional vê só a agenda, os clientes e os ganhos dela.',
            ],
          ]}
        />
        <Sub>Quer saber o custo de cada atendimento em reais?</Sub>
        <p>
          A Precificação, no Financeiro, usa esses materiais para mostrar o custo do serviço, o
          preço mínimo e o lucro por hora.
        </p>
      </Section>
    </TutorialPage>
  );
}

function unitHint(unit: string): string {
  switch (unit) {
    case 'un':
      return 'Peças contadas uma a uma: máscara, touca, lâmina.';
    case 'par':
      return 'Luvas e outros itens que se usam em par.';
    case 'ml':
      return 'Líquidos usados aos poucos: sérum, óleo, loção.';
    case 'g':
      return 'Pós, cremes e ceras pesados: argila, pasta, cera.';
    case 'cx':
      return 'Quando o uso é a caixa inteira.';
    case 'pct':
      return 'Quando o uso é o pacote inteiro.';
    case 'fl':
      return 'Folhas: papel, lençol descartável em folha.';
    default:
      return '';
  }
}

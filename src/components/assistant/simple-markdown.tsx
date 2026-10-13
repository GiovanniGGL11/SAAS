import * as React from 'react';

/*
  Markdown mínimo para as respostas do assistente: parágrafos, listas com "-", "*" ou "1." e
  **negrito**. Monta elementos React (nada de HTML cru), então texto vindo do modelo ou de dados
  de cliente nunca vira marcação na página.
*/

function inline(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
      <strong key={i} className="font-semibold">
        {part.slice(2, -2)}
      </strong>
    ) : (
      part
    ),
  );
}

type Block = { type: 'p' | 'ul' | 'ol'; lines: string[] };

function toBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    const type = bullet ? 'ul' : numbered ? 'ol' : 'p';
    const content = bullet?.[1] ?? numbered?.[1] ?? line;
    const last = blocks.at(-1);
    if (!content.trim()) {
      blocks.push({ type: 'p', lines: [] });
    } else if (last && last.type === type && (type !== 'p' || last.lines.length > 0)) {
      last.lines.push(content);
    } else {
      blocks.push({ type, lines: [content] });
    }
  }
  return blocks.filter((b) => b.lines.length > 0);
}

export function SimpleMarkdown({ text }: { text: string }) {
  return (
    <div className="space-y-2">
      {toBlocks(text).map((block, i) => {
        if (block.type === 'p') {
          return (
            <p key={i}>
              {block.lines.map((line, j) => (
                <React.Fragment key={j}>
                  {j > 0 && <br />}
                  {inline(line)}
                </React.Fragment>
              ))}
            </p>
          );
        }
        const List = block.type;
        return (
          <List
            key={i}
            className={
              block.type === 'ul' ? 'list-disc space-y-0.5 pl-5' : 'list-decimal space-y-0.5 pl-5'
            }
          >
            {block.lines.map((line, j) => (
              <li key={j}>{inline(line)}</li>
            ))}
          </List>
        );
      })}
    </div>
  );
}

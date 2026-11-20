import React from 'react';

export interface MarkdownRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  code?: boolean;
}

export interface MarkdownBlock {
  type: 'heading' | 'quote' | 'list-item' | 'hr' | 'paragraph' | 'blank';
  level?: number; // 1 | 2 | 3 for heading
  marker?: string; // bullet or '1.'
  rawText: string;
  runs: MarkdownRun[];
}

/**
 * Detect whether user input contains intentional Markdown formatting syntax.
 * Avoids false positives on dates (2026-10-01), camera apertures (f/2.8), or hashtags (#日常).
 */
export function hasMarkdownSyntax(text: string): boolean {
  if (!text || !text.trim()) return false;

  const patterns = [
    /\*\*[^*\n]+?\*\*/, // **bold**
    /__[^_\n]+?__/, // __bold__
    /~~[^~\n]+?~~/, // ~~strike~~
    /`[^`\n]+`/, // `code/highlight`
    /(?:^|[^\w*])\*[^\s*\n](?:[^*\n]*?[^\s*\n])?\*(?=[^\w*]|$)/, // *italic*
    /^#{1,6}\s+\S/m, // # heading
    /^#{2,6}[^\s#]/m, // ##heading without space
    /^>\s*\S/m, // > quote (with or without space)
    /^[-*+]\s+\S/m, // - list item
    /^\d+\.\s+\S/m, // 1. ordered list
    /^(?:---|\*\*\*)\s*$/m, // --- divider
  ];

  return patterns.some((re) => re.test(text));
}

const INLINE_TOKEN_SOURCE =
  '(\\*{3}[^*\\n]+?\\*{3}|\\*{2}[^*\\n]+?\\*{2}|__[^_\\n]+?__|~~[^~\\n]+?~~|`[^`\\n]+`|\\*[^\\s*\\n](?:[^*\\n]*?[^\\s*\\n])?\\*)';

export function parseInlineMarkdown(
  text: string,
  enabled = true,
  inheritedStyle: Omit<MarkdownRun, 'text'> = {},
  depth = 0
): MarkdownRun[] {
  if (!enabled || !text || depth > 6) {
    return text ? [{ text, ...inheritedStyle }] : [];
  }

  const runs: MarkdownRun[] = [];
  const tokenRe = new RegExp(INLINE_TOKEN_SOURCE, 'g');
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRe.exec(text)) !== null) {
    if (match.index > lastIndex) {
      runs.push({
        text: text.slice(lastIndex, match.index),
        ...inheritedStyle,
      });
    }

    const token = match[0];
    if (token.startsWith('***') && token.endsWith('***') && token.length > 6) {
      runs.push(
        ...parseInlineMarkdown(
          token.slice(3, -3),
          true,
          { ...inheritedStyle, bold: true, italic: true },
          depth + 1
        )
      );
    } else if (
      ((token.startsWith('**') && token.endsWith('**')) ||
        (token.startsWith('__') && token.endsWith('__'))) &&
      token.length > 4
    ) {
      runs.push(
        ...parseInlineMarkdown(
          token.slice(2, -2),
          true,
          { ...inheritedStyle, bold: true },
          depth + 1
        )
      );
    } else if (token.startsWith('~~') && token.endsWith('~~') && token.length > 4) {
      runs.push(
        ...parseInlineMarkdown(
          token.slice(2, -2),
          true,
          { ...inheritedStyle, strike: true },
          depth + 1
        )
      );
    } else if (token.startsWith('`') && token.endsWith('`') && token.length > 2) {
      runs.push({
        text: token.slice(1, -1),
        ...inheritedStyle,
        code: true,
      });
    } else if (token.startsWith('*') && token.endsWith('*') && token.length > 2) {
      runs.push(
        ...parseInlineMarkdown(
          token.slice(1, -1),
          true,
          { ...inheritedStyle, italic: true },
          depth + 1
        )
      );
    } else {
      runs.push({ text: token, ...inheritedStyle });
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    runs.push({
      text: text.slice(lastIndex),
      ...inheritedStyle,
    });
  }

  return runs.length > 0 ? runs : [{ text, ...inheritedStyle }];
}

export function parseMarkdownBlocks(text: string, enabled = true): MarkdownBlock[] {
  const lines = text.split('\n');
  if (!enabled) {
    return lines.map((line) =>
      !line.trim()
        ? { type: 'blank', rawText: '', runs: [] }
        : { type: 'paragraph', rawText: line, runs: [{ text: line }] }
    );
  }

  return lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return { type: 'blank', rawText: '', runs: [] };
    }

    if (/^(?:---|\*\*\*)\s*$/.test(trimmed)) {
      return { type: 'hr', rawText: '', runs: [] };
    }

    const headingMatch =
      line.match(/^(#{1,6})\s+(.+)$/) || line.match(/^(#{2,6})([^\s#].*)$/);
    if (headingMatch) {
      const level = Math.min(3, headingMatch[1].length);
      const body = headingMatch[2].trim();
      return {
        type: 'heading',
        level,
        rawText: body,
        runs: parseInlineMarkdown(body, true, { bold: true }),
      };
    }

    const quoteMatch = line.match(/^>\s?(.*)$/);
    if (quoteMatch) {
      const body = quoteMatch[1];
      return {
        type: 'quote',
        rawText: body,
        runs: parseInlineMarkdown(body, true),
      };
    }

    const ulMatch = line.match(/^[-*+]\s+(.+)$/);
    if (ulMatch) {
      const body = ulMatch[1];
      return {
        type: 'list-item',
        marker: '•',
        rawText: body,
        runs: parseInlineMarkdown(body, true),
      };
    }

    const olMatch = line.match(/^(\d+\.)\s+(.+)$/);
    if (olMatch) {
      const body = olMatch[2];
      return {
        type: 'list-item',
        marker: olMatch[1],
        rawText: body,
        runs: parseInlineMarkdown(body, true),
      };
    }

    return {
      type: 'paragraph',
      rawText: line,
      runs: parseInlineMarkdown(line, true),
    };
  });
}

function renderRuns(runs: MarkdownRun[]): React.ReactNode {
  return runs.map((run, idx) => {
    let node: React.ReactNode = run.text;

    if (run.code) {
      node = (
        <span className="px-1.5 py-0.5 mx-0.5 rounded bg-stone-200/80 dark:bg-stone-800 text-[#284152] dark:text-[#E7E5E0] text-[0.92em]">
          {node}
        </span>
      );
    }
    if (run.strike) {
      node = <del className="line-through opacity-70 decoration-[1.5px]">{node}</del>;
    }
    if (run.italic) {
      node = <em className="italic text-stone-700 dark:text-stone-300">{node}</em>;
    }
    if (run.bold) {
      node = <strong className="font-bold text-stone-950 dark:text-white">{node}</strong>;
    }

    return <React.Fragment key={idx}>{node}</React.Fragment>;
  });
}

interface MarkdownTextProps {
  content: string;
  enabled?: boolean;
  className?: string;
}

export const MarkdownText: React.FC<MarkdownTextProps> = ({
  content,
  enabled = false,
  className = '',
}) => {
  if (!enabled) {
    return <div className={`whitespace-pre-line ${className}`}>{content}</div>;
  }

  const blocks = parseMarkdownBlocks(content, true);

  return (
    <div className={`space-y-2 ${className}`}>
      {blocks.map((block, idx) => {
        if (block.type === 'blank') {
          return <div key={idx} className="h-3" aria-hidden="true" />;
        }
        if (block.type === 'hr') {
          return (
            <hr
              key={idx}
              className="my-5 border-0 border-t border-stone-300/80 dark:border-stone-700/80 w-24"
            />
          );
        }
        if (block.type === 'heading') {
          const sizeClass =
            block.level === 1
              ? 'text-2xl sm:text-[26px] pt-3 pb-1'
              : block.level === 2
              ? 'text-xl sm:text-[22px] pt-2.5 pb-0.5'
              : 'text-lg sm:text-[19px] pt-2';
          return (
            <div
              key={idx}
              className={`font-editorial font-bold text-stone-950 dark:text-white leading-snug ${sizeClass}`}
            >
              {renderRuns(block.runs)}
            </div>
          );
        }
        if (block.type === 'quote') {
          return (
            <blockquote
              key={idx}
              className="pl-4 py-1 my-1 border-l-2 border-[#9E3B33]/65 dark:border-[#C96458]/70 text-stone-600 dark:text-stone-300 italic"
            >
              {renderRuns(block.runs)}
            </blockquote>
          );
        }
        if (block.type === 'list-item') {
          return (
            <div key={idx} className="flex items-start gap-2.5 pl-1">
              <span className="shrink-0 text-stone-400 dark:text-stone-500 select-none">
                {block.marker}
              </span>
              <span className="flex-1 min-w-0">{renderRuns(block.runs)}</span>
            </div>
          );
        }
        return (
          <p key={idx} className="leading-[inherit]">
            {renderRuns(block.runs)}
          </p>
        );
      })}
    </div>
  );
};

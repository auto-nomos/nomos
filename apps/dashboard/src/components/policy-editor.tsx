'use client';

import { Editor, type Monaco } from '@monaco-editor/react';
import { useEffect, useRef, useState } from 'react';

const CEDAR_LANGUAGE_ID = 'cedar';

const CEDAR_KEYWORDS = [
  'permit',
  'forbid',
  'when',
  'unless',
  'principal',
  'action',
  'resource',
  'context',
  'in',
  'has',
  'like',
  'is',
  'if',
  'then',
  'else',
  'true',
  'false',
];

function registerCedarLanguage(monaco: Monaco) {
  if (monaco.languages.getLanguages().some((l: { id: string }) => l.id === CEDAR_LANGUAGE_ID))
    return;
  monaco.languages.register({ id: CEDAR_LANGUAGE_ID });
  monaco.languages.setMonarchTokensProvider(CEDAR_LANGUAGE_ID, {
    keywords: CEDAR_KEYWORDS,
    tokenizer: {
      root: [
        [/\/\/.*$/, 'comment'],
        [/\/\*/, 'comment', '@comment'],
        [/"([^"\\]|\\.)*"/, 'string'],
        [/[A-Z][\w]*::"[^"]*"/, 'type.identifier'],
        [
          /[a-zA-Z_][\w]*/,
          {
            cases: {
              '@keywords': 'keyword',
              '@default': 'identifier',
            },
          },
        ],
        [/[{}()[\];,]/, 'delimiter'],
        [/[<>=!]+|&&|\|\|/, 'operator'],
        [/\d+/, 'number'],
      ],
      comment: [
        [/[^*/]+/, 'comment'],
        [/\*\//, 'comment', '@pop'],
        [/[*/]/, 'comment'],
      ],
    },
  });
  monaco.languages.setLanguageConfiguration(CEDAR_LANGUAGE_ID, {
    comments: { lineComment: '//', blockComment: ['/*', '*/'] },
    brackets: [
      ['{', '}'],
      ['[', ']'],
      ['(', ')'],
    ],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
    ],
  });
}

export interface PolicyEditorProps {
  value: string;
  onChange: (next: string) => void;
  height?: string | number;
  readOnly?: boolean;
}

export function PolicyEditor({
  value,
  onChange,
  height = '420px',
  readOnly = false,
}: PolicyEditorProps) {
  const monacoRef = useRef<Monaco | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (mounted && monacoRef.current) {
      registerCedarLanguage(monacoRef.current);
    }
  }, [mounted]);

  return (
    <div className="overflow-hidden rounded-md border">
      <Editor
        height={height}
        defaultLanguage={CEDAR_LANGUAGE_ID}
        value={value}
        onChange={(v) => onChange(v ?? '')}
        beforeMount={(monaco) => {
          monacoRef.current = monaco;
          registerCedarLanguage(monaco);
        }}
        onMount={() => setMounted(true)}
        options={{
          minimap: { enabled: false },
          lineNumbers: 'on',
          fontSize: 13,
          fontFamily: 'JetBrains Mono, ui-monospace, monospace',
          tabSize: 2,
          insertSpaces: true,
          renderWhitespace: 'selection',
          scrollBeyondLastLine: false,
          readOnly,
          wordWrap: 'on',
        }}
      />
    </div>
  );
}

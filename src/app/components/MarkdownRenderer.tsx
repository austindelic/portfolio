// MarkdownRenderer.tsx
"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import { useMDXComponents } from "../../mdx-components";

export default function MarkdownRenderer({ markdown }: { markdown: string }) {
  const components = useMDXComponents();

  return (
    <ReactMarkdown
      components={{
        h1: components.h1,
        h2: components.h2,
        h3: components.h3,
        h4: components.h4,
        p: components.p,
        ol: components.ol,
        ul: components.ul,
        li: components.li,
        em: components.em,
        strong: components.strong,
        a: components.a,
        blockquote: components.blockquote,
        code: (props) => {
          const { inline, className, children, ...rest } = props as { inline?: boolean, className?: string, children: React.ReactNode };
          if (inline) {
            return components.code({ children: children as string, ...rest });
          }
          return (
            <pre>
              <code {...rest}>{children}</code>
            </pre>
          );
        },
      }}
    >
      {markdown}
    </ReactMarkdown>
  );
}
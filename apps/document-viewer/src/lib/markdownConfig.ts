import Latex from '@ant-design/x-markdown/plugins/Latex'
import highlight from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import css from 'highlight.js/lib/languages/css'
import go from 'highlight.js/lib/languages/go'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import markdown from 'highlight.js/lib/languages/markdown'
import python from 'highlight.js/lib/languages/python'
import sql from 'highlight.js/lib/languages/sql'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'
import type { MarkedExtension } from 'marked'
import { gfmHeadingId } from 'marked-gfm-heading-id'
import { markedHighlight } from 'marked-highlight'

highlight.registerLanguage('bash', bash)
highlight.registerLanguage('shell', bash)
highlight.registerLanguage('css', css)
highlight.registerLanguage('go', go)
highlight.registerLanguage('java', java)
highlight.registerLanguage('javascript', javascript)
highlight.registerLanguage('js', javascript)
highlight.registerLanguage('json', json)
highlight.registerLanguage('markdown', markdown)
highlight.registerLanguage('md', markdown)
highlight.registerLanguage('python', python)
highlight.registerLanguage('py', python)
highlight.registerLanguage('sql', sql)
highlight.registerLanguage('typescript', typescript)
highlight.registerLanguage('ts', typescript)
highlight.registerLanguage('html', xml)
highlight.registerLanguage('xml', xml)
highlight.registerLanguage('yaml', yaml)
highlight.registerLanguage('yml', yaml)

export function createMarkdownConfig(): MarkedExtension {
  const headingIds = gfmHeadingId()
  const syntaxHighlighting = markedHighlight({
    emptyLangClass: 'hljs',
    langPrefix: 'hljs language-',
    highlight(code, language) {
      if (language === 'mermaid') return code
      if (language && highlight.getLanguage(language)) {
        return highlight.highlight(code, { language }).value
      }
      return highlight.highlightAuto(code).value
    },
  })

  return {
    ...headingIds,
    ...syntaxHighlighting,
    extensions: [
      ...(headingIds.extensions ?? []),
      ...(syntaxHighlighting.extensions ?? []),
      ...Latex({ katexOptions: { throwOnError: false } }),
    ],
    hooks: {
      ...headingIds.hooks,
      ...syntaxHighlighting.hooks,
    },
    renderer: {
      ...headingIds.renderer,
      ...syntaxHighlighting.renderer,
    },
  }
}

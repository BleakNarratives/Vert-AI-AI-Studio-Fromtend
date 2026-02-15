import React from 'react';

interface CodeEditorProps {
  code: string;
  language?: string;
  className?: string;
}

const CodeEditor: React.FC<CodeEditorProps> = ({
  code,
  language = 'plaintext',
  className,
}) => {
  // A simple conceptual syntax highlighter. For a real app,
  // you'd integrate a library like 'react-syntax-highlighter' or 'prismjs'.
  const highlightCode = (rawCode: string, lang: string) => {
    let highlighted = rawCode;
    if (lang === 'markdown') {
      highlighted = highlighted.replace(/^#\s(.+)$/gm, '<span class="text-indigo-400 font-bold">$1</span>'); // Headers
      highlighted = highlighted.replace(/^##\s(.+)$/gm, '<span class="text-purple-400 font-bold">$1</span>'); // Subheaders
      highlighted = highlighted.replace(/\*\*(.*?)\*\*/g, '<span class="font-bold text-yellow-300">$1</span>'); // Bold
      highlighted = highlighted.replace(/`(.*?)`/g, '<span class="text-green-400 font-mono">$1</span>'); // Inline code
      highlighted = highlighted.replace(/```(.*?)(\n[\s\S]*?)```/g, (match, codeLang, codeContent) => {
        return `<pre class="bg-gray-800 p-2 rounded text-sm text-sky-400 mt-2 mb-2"><code>${codeContent.trim()}</code></pre>`;
      });
    }
    // Basic JS/TS keyword highlighting (very rudimentary)
    if (lang === 'typescript' || lang === 'javascript') {
      highlighted = highlighted.replace(/\b(const|let|var|function|class|export|import|return|await|async|interface|type)\b/g, '<span class="text-purple-400 font-bold">$&</span>');
      highlighted = highlighted.replace(/\b(string|number|boolean|any|void)\b/g, '<span class="text-cyan-400">$&</span>');
      highlighted = highlighted.replace(/('.*?'|".*?"|`.*?`)/g, '<span class="text-green-400">$&</span>'); // Strings
      highlighted = highlighted.replace(/(\/\/.*)/g, '<span class="text-gray-500 italic">$&</span>'); // Comments
      highlighted = highlighted.replace(/(\b\d+\b)/g, '<span class="text-orange-400">$&</span>'); // Numbers
    }
    return highlighted;
  };

  const displayedCode = highlightCode(code, language);

  return (
    <pre
      className={`overflow-auto whitespace-pre-wrap rounded bg-gray-800 p-4 font-mono text-sm text-gray-200 scrollbar-thin scrollbar-thumb-indigo-600 scrollbar-track-gray-900 ${className}`}
      style={{ minHeight: '100px' }}
      dangerouslySetInnerHTML={{ __html: displayedCode }}
    />
  );
};

export default CodeEditor;
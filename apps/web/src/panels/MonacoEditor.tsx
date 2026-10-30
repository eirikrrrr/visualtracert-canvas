// Monaco (the editor of VS Code), bundled with only what the document needs:
// YAML highlighting and the JSON language, and the features of the editor
// used on it (folding, find, hovers over problems, bracket matching). Loaded
// lazily with the Documento tab. No CDN: it works without Internet access.
import * as monaco from "monaco-editor/editor/editor.api.js";
import "monaco-editor/features/folding/register.js";
import "monaco-editor/features/find/register.js";
import "monaco-editor/features/hover/register.js";
import "monaco-editor/features/bracketMatching/register.js";
import "monaco-editor/languages/definitions/yaml/register.js";
import "monaco-editor/language/json/monaco.contribution.js";
import EditorWorker from "monaco-editor/editor/editor.worker.js?worker";
import JsonWorker from "monaco-editor/language/json/json.worker.js?worker";
import { useEffect, useRef } from "react";
import { isLightTheme, type Theme } from "../app/store";
import type { DocProblem } from "@visual-tracert/model";

self.MonacoEnvironment = {
  getWorker: (_: string, label: string) => (label === "json" ? new JsonWorker() : new EditorWorker()),
};

// Monaco's theme is built from the app theme's CSS tokens, so the editor
// always matches the panel around it.
function applyTheme(light: boolean) {
  const css = getComputedStyle(document.body);
  const token = (name: string) => css.getPropertyValue(name).trim();
  monaco.editor.defineTheme("visual", {
    base: light ? "vs" : "vs-dark", inherit: true, rules: [],
    colors: {
      "editor.background": token("--canvas"),
      "editorGutter.background": token("--canvas"),
      "editor.lineHighlightBackground": token("--surface-2"),
      "editor.lineHighlightBorder": token("--surface-2"),
      "editorLineNumber.foreground": token("--ink-3"),
      "editorLineNumber.activeForeground": token("--ink-2"),
      "editorCursor.foreground": token("--accent"),
      "editor.selectionBackground": token("--accent-soft"),
      "editorWidget.background": token("--surface"),
      "editorWidget.border": token("--line-strong"),
      "scrollbarSlider.background": token("--surface-3"),
    },
  });
  monaco.editor.setTheme("visual");
}

export interface MonacoEditorProps {
  value: string;
  language: "yaml" | "json";
  theme: Theme;
  problems: DocProblem[];
  onChange: (value: string) => void;
  /** a line to bring into view (changes each time it is asked) */
  reveal: { line: number; at: number } | null;
}

export default function MonacoEditor({ value, language, theme, problems, onChange, reveal }: MonacoEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const changeRef = useRef(onChange);
  changeRef.current = onChange;

  useEffect(() => {
    const instance = monaco.editor.create(host.current!, {
      value, language,
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 13,
      tabSize: 2,
      scrollBeyondLastLine: false,
      renderLineHighlight: "line",
      wordWrap: "off",
      // fold the topologies, devices and lists from the gutter (Ctrl+Shift+[ / ])
      folding: true,
      foldingStrategy: "auto",
      showFoldingControls: "always",
      foldingHighlight: true,
    });
    instance.onDidChangeModelContent(() => changeRef.current(instance.getValue()));
    editor.current = instance;
    return () => instance.dispose();
    // the editor is created once; props are applied below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // a new document from outside (the canvas changed): keep the cursor where it was
  useEffect(() => {
    const instance = editor.current;
    if(instance && instance.getValue() !== value){
      const position = instance.getPosition();
      instance.setValue(value);
      if(position) instance.setPosition(position);
    }
  }, [value]);

  useEffect(() => {
    const model = editor.current?.getModel();
    if(model) monaco.editor.setModelLanguage(model, language);
  }, [language]);

  useEffect(() => {
    // after the page applied the new theme's tokens
    requestAnimationFrame(() => applyTheme(isLightTheme(theme)));
  }, [theme]);

  useEffect(() => {
    const model = editor.current?.getModel();
    if(!model) return;
    monaco.editor.setModelMarkers(model, "visual", problems.filter(problem => problem.line).map(problem => ({
      severity: monaco.MarkerSeverity.Error,
      message: problem.message,
      startLineNumber: problem.line!, endLineNumber: problem.line!,
      startColumn: 1, endColumn: model.getLineMaxColumn(problem.line!),
    })));
  }, [problems]);

  useEffect(() => {
    if(!reveal || !editor.current) return;
    editor.current.revealLineInCenter(reveal.line);
    editor.current.setPosition({ lineNumber: reveal.line, column: 1 });
    editor.current.focus();
  }, [reveal]);

  return <div className="monaco" ref={host} />;
}

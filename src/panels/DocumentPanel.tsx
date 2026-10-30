// The topology as a document, kept in sync both ways: editing the canvas
// rewrites the document; a valid edit of the document redraws the canvas.
// An invalid document shows its problems and leaves the canvas as it was.
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useStore } from "../app/store";
import { Icon } from "../editor/icons";
import { parse, serialize, type DocFormat, type DocProblem } from "../model/document";
import type { Topology } from "../model/types";

const MonacoEditor = lazy(() => import("./MonacoEditor"));
const APPLY_DELAY_MS = 500;

export function DocumentPanel() {
  const topology = useStore(state => state.topology);
  const theme = useStore(state => state.theme);
  const [format, setFormat] = useState<DocFormat>("yaml");
  const [text, setText] = useState(() => serialize(topology, "yaml"));
  const [problems, setProblems] = useState<DocProblem[]>([]);
  const [reveal, setReveal] = useState<{ line: number; at: number } | null>(null);
  const [copied, setCopied] = useState(false);
  // the topology that came from this document: no need to rewrite it
  const fromDocument = useRef<Topology | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if(topology === fromDocument.current) return;
    setText(serialize(topology, format));
    setProblems([]);
  }, [topology, format]);

  const edit = (next: string) => {
    setText(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const result = parse(next, format);
      setProblems(result.problems);
      if(result.topology){
        fromDocument.current = result.topology;
        useStore.getState().commit(result.topology);
      }
    }, APPLY_DELAY_MS);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  const switchFormat = (next: DocFormat) => {
    if(next === format) return;
    clearTimeout(timer.current);
    fromDocument.current = null;
    setFormat(next);
  };

  const importFile = async (file: File) => {
    const kind: DocFormat = /\.json$/i.test(file.name) ? "json" : "yaml";
    const result = parse(await file.text(), kind);
    if(!result.topology){
      setProblems(result.problems);
      useStore.getState().notify(`${file.name} tiene errores: no se cargó.`, "error");
      return;
    }
    useStore.getState().replace(result.topology);
    useStore.getState().notify(`Cargado ${file.name}: ${result.topology.devices.length} dispositivos.`, "ok");
  };

  const exportFile = () => {
    const blob = new Blob([serialize(topology, format)], { type: format === "json" ? "application/json" : "text/yaml" });
    const url = URL.createObjectURL(blob);
    const link = Object.assign(document.createElement("a"), { href: url, download: `${slug(topology.name)}.${format === "json" ? "json" : "yaml"}` });
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="doc">
      <div className="doc-bar">
        <div className="segmented" role="radiogroup" aria-label="Formato">
          {(["yaml", "json"] as const).map(item => (
            <button key={item} type="button" role="radio" aria-checked={format === item} className={format === item ? "active" : ""}
              onClick={() => switchFormat(item)}>{item.toUpperCase()}</button>
          ))}
        </div>
        <div className="doc-actions">
          <button type="button" className="icon-button" title="Importar un archivo YAML o JSON" aria-label="Importar" onClick={() => fileInput.current?.click()}><Icon name="upload" size={18} /></button>
          <button type="button" className="icon-button" title="Descargar el documento" aria-label="Exportar" onClick={exportFile}><Icon name="download" size={18} /></button>
          <button type="button" className="icon-button" title={copied ? "Copiado" : "Copiar el documento"} aria-label="Copiar"
            onClick={async () => {
              try{ await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1400); }
              catch(_){ useStore.getState().notify("No se pudo copiar al portapapeles.", "error"); }
            }}><Icon name="copy" size={18} /></button>
          <input ref={fileInput} type="file" accept=".yaml,.yml,.json" hidden
            onChange={event => { const file = event.target.files?.[0]; if(file) importFile(file); event.target.value = ""; }} />
        </div>
      </div>

      <div className="doc-editor">
        <Suspense fallback={<div className="doc-loading muted">Cargando el editor…</div>}>
          <MonacoEditor value={text} language={format} theme={theme} problems={problems} onChange={edit} reveal={reveal} />
        </Suspense>
      </div>

      <div className={`doc-status${problems.length ? " has-problems" : ""}`} role="status">
        {problems.length ? (
          <ul>
            {problems.map((problem, index) => (
              <li key={index}>
                <button type="button" className="link" disabled={!problem.line} onClick={() => problem.line && setReveal({ line: problem.line, at: Date.now() })}>
                  {problem.line ? `Línea ${problem.line}: ` : ""}{problem.message}
                </button>
              </li>
            ))}
          </ul>
        ) : <span className="muted small">Sincronizado con el lienzo. Los cambios válidos se aplican al dejar de escribir.</span>}
      </div>
    </div>
  );
}

const slug = (text: string) => text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "laboratorio";

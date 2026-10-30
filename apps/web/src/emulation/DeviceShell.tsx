// A device's CLI: a terminal (xterm.js) joined by a WebSocket to a shell on
// its container in the emulated lab. Closing it (or the window) ends the
// shell; "Reconectar" opens a new one.
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef, useState } from "react";
import { t as translate, useT } from "../i18n";
import { emulator } from "./api";

type Status = { kind: "connecting" } | { kind: "open" } | { kind: "closed"; message?: string };

// a terminal is dark on every theme
const THEME = {
  background: "#0b0f17", foreground: "#e3e8f0", cursor: "#e3e8f0", selectionBackground: "#2f4a7a",
  black: "#1b2230", red: "#ff6b6b", green: "#5fd38d", yellow: "#f2c55c", blue: "#6ea8ff", magenta: "#c792ea", cyan: "#5ccfe6", white: "#d7dce4",
  brightBlack: "#5c6678", brightRed: "#ff8787", brightGreen: "#7ee2a8", brightYellow: "#ffd479", brightBlue: "#8fbcff", brightMagenta: "#dab2ff", brightCyan: "#86e1f0", brightWhite: "#ffffff",
};

export function DeviceShell({ lab, device, shell }: { lab: string; device: string; shell?: string }) {
  const t = useT();
  const box = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>({ kind: "connecting" });
  // a new number, a new session
  const [session, setSession] = useState(0);

  useEffect(() => {
    const element = box.current!;
    const term = new Terminal({
      cursorBlink: true, fontSize: 13, scrollback: 3000, theme: THEME,
      fontFamily: "ui-monospace, 'JetBrains Mono', 'SFMono-Regular', Menlo, Consolas, monospace",
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(element);
    const refit = () => { if(element.offsetWidth && element.offsetHeight) try{ fit.fit(); }catch(_){ /* not laid out yet */ } };
    refit();

    setStatus({ kind: "connecting" });
    const socket = new WebSocket(emulator.shellUrl(lab, device, { cols: term.cols, rows: term.rows }, shell));
    socket.binaryType = "arraybuffer";
    const encoder = new TextEncoder();
    let failure: string | undefined;
    socket.onopen = () => { setStatus({ kind: "open" }); term.focus(); };
    socket.onmessage = event => {
      if(typeof event.data !== "string"){ term.write(new Uint8Array(event.data as ArrayBuffer)); return; }
      try{
        const message = JSON.parse(event.data);
        if(message.type === "error") failure = String(message.message);
      }catch(_){ /* not ours */ }
    };
    socket.onclose = () => {
      setStatus({ kind: "closed", message: failure });
      term.write(`\r\n\x1b[2m${failure ?? translate("Sesión cerrada.")}\x1b[0m\r\n`);
    };
    const send = (data: string | Uint8Array<ArrayBuffer>) => { if(socket.readyState === WebSocket.OPEN) socket.send(typeof data === "string" ? encoder.encode(data) : data); };
    const typed = term.onData(send);
    const binary = term.onBinary(data => send(Uint8Array.from(data, char => char.charCodeAt(0))));
    const resized = term.onResize(size => {
      if(socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "resize", cols: size.cols, rows: size.rows }));
    });
    // the window resized, or shown again after another tab (it may be a
    // window of its own: its own observer)
    const Observer = element.ownerDocument.defaultView?.ResizeObserver ?? ResizeObserver;
    const observer = new Observer(refit);
    observer.observe(element);
    return () => {
      observer.disconnect();
      typed.dispose(); binary.dispose(); resized.dispose();
      socket.close();
      term.dispose();
    };
  }, [lab, device, shell, session]);

  return (
    <div className="shell">
      <div className="shell-status">
        <span className={`emu-state ${status.kind === "open" ? "on" : "off"}`}>
          {status.kind === "connecting" ? t("Conectando…") : status.kind === "open" ? t("Conectado") : t("Desconectado")}
        </span>
        {status.kind === "closed" && status.message && <span className="field-error small">{status.message}</span>}
        {status.kind === "closed" && (
          <button type="button" className="ghost small" onClick={() => setSession(session + 1)}>{t("Reconectar")}</button>
        )}
      </div>
      <div className="shell-term" ref={box} aria-label={t("Terminal del dispositivo")} />
    </div>
  );
}

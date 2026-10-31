// A window of the browser of its own (window.open) with part of the page in
// it: React draws it there through a portal, so it shares this page's state
// and is kept in step with it. It gets the page's styles and theme. Closing
// it calls onClose; closing the page closes it.
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useStore } from "../app/store";
import { t } from "../i18n";

export function Popup({ name, title, onClose, children }: { name: string; title: string; onClose: () => void; children: ReactNode }) {
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const theme = useStore(state => state.theme);

  useEffect(() => {
    const popup = window.open("", name, "popup=yes,width=660,height=780");
    if(!popup){
      useStore.getState().notify(t("El navegador bloqueó la ventana: permite las ventanas emergentes de esta página."), "error");
      onClose();
      return;
    }
    const doc = popup.document;
    doc.head.replaceChildren();
    const charset = doc.createElement("meta");
    charset.setAttribute("charset", "utf-8");
    doc.head.append(charset);
    // the page's styles, with their full addresses (the new window has none of
    // its own); and those that come later (a part loaded when first shown, as
    // the terminal's)
    const copyStyle = (node: Node) => {
      if(!(node instanceof HTMLElement) || !(node.tagName === "STYLE" || (node.tagName === "LINK" && (node as HTMLLinkElement).rel === "stylesheet"))) return;
      const copy = node.cloneNode(true) as HTMLLinkElement | HTMLStyleElement;
      if(node.tagName === "LINK") (copy as HTMLLinkElement).href = (node as HTMLLinkElement).href;
      doc.head.append(copy);
    };
    document.head.querySelectorAll('link[rel="stylesheet"], style').forEach(copyStyle);
    const styles = new MutationObserver(changes => changes.forEach(change => change.addedNodes.forEach(copyStyle)));
    styles.observe(document.head, { childList: true });
    doc.documentElement.lang = document.documentElement.lang;
    doc.body.replaceChildren();
    doc.body.className = "popup-body";
    const container = doc.createElement("div");
    container.className = "popup-root";
    doc.body.append(container);
    setRoot(container);

    // closed by the user: tell the page; the page goes: it goes too
    const closed = () => onClose();
    const leaving = () => popup.close();
    popup.addEventListener("pagehide", closed);
    window.addEventListener("pagehide", leaving);
    return () => {
      styles.disconnect();
      popup.removeEventListener("pagehide", closed);
      window.removeEventListener("pagehide", leaving);
      popup.close();
      setRoot(null);
    };
    // opened once per name; the title and the theme follow below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  useEffect(() => { if(root) root.ownerDocument.title = title; }, [root, title]);
  useEffect(() => { if(root) root.ownerDocument.body.dataset.theme = theme; }, [root, theme]);

  return root ? createPortal(children, root) : null;
}

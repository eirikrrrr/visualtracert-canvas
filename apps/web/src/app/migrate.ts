// The app was first called visor-tracert: what it saved in this browser
// (labs, theme, profile, panel layout) moves to the visual-tracert keys
// before anything reads them. Runs once; the old keys are removed.
const OLD = "visor-tracert.";
const NEW = "visual-tracert.";

try{
  const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).filter((key): key is string => Boolean(key?.startsWith(OLD)));
  keys.forEach(key => {
    const value = localStorage.getItem(key);
    const target = NEW + key.slice(OLD.length);
    if(value !== null && localStorage.getItem(target) === null) localStorage.setItem(target, value);
    localStorage.removeItem(key);
  });
}catch(_){ /* no storage: nothing to move */ }

export {};

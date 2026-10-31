// The addresses the lab's running devices have now, asked every few seconds
// while emulating a deployed lab: what their CLI may have changed, which the
// document does not say. The canvas shows them.
import { useEffect, useState } from "react";
import { emulator } from "./api";

const EVERY_MS = 4000;

/** device → its addresses now ("10.0.0.1/24"); a device absent is not known */
export function useLiveAddresses(lab: string, active: boolean): Record<string, string[]> {
  const [live, setLive] = useState<Record<string, string[]>>({});
  useEffect(() => {
    if(!active){ setLive({}); return; }
    let stopped = false;
    const ask = async () => {
      try{
        const found = await emulator.addresses(lab);
        if(!stopped) setLive(Object.fromEntries(Object.entries(found).map(([device, list]) => [device, list.map(item => item.address)])));
      }catch(_){ /* the emulator does not answer: nothing to show */ }
    };
    void ask();
    const timer = setInterval(ask, EVERY_MS);
    return () => { stopped = true; clearInterval(timer); };
  }, [lab, active]);
  return live;
}

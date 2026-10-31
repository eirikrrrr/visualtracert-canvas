// What the web knows of the emulated lab: whether the emulator answers, what
// of the lab is running, what it could not emulate, and the commands run on
// its devices (a console history).
import { create } from "zustand";
import type { Topology } from "@visual-tracert/model";
import { emulator, type Command, type Health, type LabState } from "./api";

export interface ConsoleEntry {
  id: number;
  device: string;
  command: string;
  output: string;
  exitCode: number;
}

const CONSOLE_LIMIT = 30;

interface EmulationState {
  /** null until the first answer */
  reachable: boolean | null;
  lab: LabState | null;
  /** what the last deployment left out */
  warnings: string[];
  /** deploy and destroy: the whole lab; start, stop and restart: some devices */
  busy: "deploy" | "destroy" | "run" | "start" | "stop" | "restart" | null;
  /** the devices being started, stopped or restarted */
  pending: string[];
  /** the emulator, as its health says */
  health: Health | null;
  error: string | null;
  console: ConsoleEntry[];
  refresh: (lab: string) => Promise<void>;
  deploy: (lab: string, topology: Topology, expires?: number) => Promise<void>;
  destroy: (lab: string) => Promise<void>;
  devices: (action: "start" | "stop" | "restart", lab: string, topology: Topology, devices: string[]) => Promise<void>;
  checkHealth: () => Promise<void>;
  run: (lab: string, device: string, command: Command, target?: string) => Promise<void>;
  clearConsole: () => void;
}

let entryId = 0;

export const useEmulation = create<EmulationState>((set, get) => {
  // a change of the lab: the state it leaves, or the error that stopped it
  const act = async (busy: EmulationState["busy"], task: () => Promise<Partial<EmulationState>>) => {
    set({ busy, error: null });
    try{
      set({ ...(await task()), reachable: true });
    }catch(error){
      set({ error: (error as Error).message });
    }finally{
      set({ busy: null });
    }
  };

  return {
    reachable: null,
    lab: null,
    warnings: [],
    busy: null,
    pending: [],
    health: null,
    error: null,
    console: [],
    refresh: async lab => {
      try{
        const state = await emulator.status(lab);
        // another lab was opened meanwhile: its own refresh will come
        set(current => ({ reachable: true, lab: state, ...(current.lab?.lab !== lab ? { warnings: [], console: [] } : {}) }));
      }catch(_){
        set({ reachable: false });
      }
    },
    deploy: (lab, topology, expires) => act("deploy", async () => {
      const { warnings, ...state } = await emulator.deploy(lab, topology, expires);
      return { lab: state, warnings };
    }),
    destroy: lab => act("destroy", async () => ({ lab: await emulator.stop(lab), warnings: [] })),
    devices: async (action, lab, topology, devices) => {
      if(!devices.length) return;
      set({ pending: devices });
      await act(action, async () => {
        if(action === "stop") return { lab: await emulator.stopDevices(lab, devices) };
        const { warnings, ...state } = await emulator[action](lab, topology, devices);
        return { lab: state, warnings };
      });
      set({ pending: [] });
    },
    checkHealth: async () => {
      try{ set({ health: await emulator.health() }); }catch(_){ set({ health: null }); }
    },
    run: (lab, device, command, target) => act("run", async () => {
      const result = await emulator.run(lab, device, command, target);
      return { console: [...get().console, { id: ++entryId, device, ...result }].slice(-CONSOLE_LIMIT) };
    }),
    clearConsole: () => set({ console: [] }),
  };
});

// Global typing for the `window.lumox.*` API exposed by preload.cjs via
// contextBridge. Mirrors the namespaces and methods in preload.cjs. Where the
// returned shape is complex the engine-side return is left as `Promise<any>`.

export {};

export interface LumoxApi {
  outputs: {
    list(): Promise<any>;
    available(): Promise<any>;
    create(type: string, config: any): Promise<any>;
    update(opts: any): Promise<any>;
    remove(id: string): Promise<any>;
  };
  universes: {
    list(): Promise<any[]>;
    ensure(id: number, name?: string): Promise<any>;
    setChannel(id: number, channel: number, value: number): Promise<any>;
    read(id: number): Promise<number[] | null | undefined>;
  };
  master: {
    set(value: number): Promise<any>;
  };
  blackout: {
    set(active: boolean): Promise<any>;
  };
  engine: {
    start(): Promise<any>;
    stop(): Promise<any>;
    status(): Promise<any>;
  };
  library: {
    list(): Promise<any[]>;
    channelTypes(): Promise<any[]>;
    add(def: any): Promise<any>;
    onChanged(cb: () => void): void;
  };
  editor: {
    open(): Promise<any>;
  };
  project: {
    save(): Promise<any>;
    open(): Promise<any>;
    onLoaded(cb: () => void): void;
  };
  patch: {
    list(): Promise<any[]>;
    add(opts: any): Promise<any>;
    move(opts: any): Promise<any>;
    remove(id: string): Promise<any>;
    rename(id: string, name: string): Promise<any>;
    overlaps(): Promise<any>;
  };
  groups: {
    list(): Promise<any[]>;
    add(opts: any): Promise<any>;
    remove(id: string): Promise<any>;
    setFixtures(id: string, fixtureIds: string[]): Promise<any>;
    rename(id: string, name: string, color?: string): Promise<any>;
  };
  fixtures: {
    setChannel(fixtureId: string, channel: number, value: number): Promise<any>;
  };
  scenes: {
    list(): Promise<any[]>;
    capture(bankId: string, name?: string): Promise<any>;
    recall(id: string, on: boolean): Promise<any>;
    remove(id: string): Promise<any>;
    rename(id: string, name: string): Promise<any>;
    update(id: string): Promise<any>;
    setColor(id: string, color: string): Promise<any>;
    duplicate(id: string): Promise<any>;
  };
  banks: {
    list(): Promise<any[]>;
    add(name?: string): Promise<any>;
    rename(id: string, name: string): Promise<any>;
    remove(id: string): Promise<any>;
  };
  win: {
    minimize(): Promise<any>;
    maximize(): Promise<any>;
    close(): Promise<any>;
    isMaximized(): Promise<boolean>;
    onMaximized(cb: (isMax: boolean) => void): void;
    closeSelf(): Promise<any>;
  };
}

declare global {
  interface Window {
    lumox: LumoxApi;
  }
}

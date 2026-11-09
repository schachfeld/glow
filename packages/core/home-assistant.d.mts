export interface Socket {
  readyState: number;
  on(name: string, callback: (...args: any[]) => void): unknown;
  send(data: string): void | Promise<void>;
  close(): void;
  terminate(): void;
}
export class HomeAssistant {
  constructor(options: {
    url: string;
    token?: string;
    getToken?: () => Promise<string>;
    retryMs?: number;
    timeoutMs?: number;
    createSocket: (url: string) => Socket;
    apiUrl?: string;
    sceneRequest?: (
      request: SceneRequest,
    ) => Promise<{ status: number; body: any }>;
    registryDelayMs?: number;
  });
  url: string;
  apiUrl?: string;
  getToken: () => Promise<string>;
  connected: boolean;
  stopped: boolean;
  error: string | null;
  on(name: string, callback: () => void): this;
  off(name: string, callback: () => void): this;
  start(): void;
  stop(): void;
  reconnect(): void;
  sceneConfig(
    method: "POST" | "DELETE",
    id: string,
    config?: object,
  ): Promise<unknown>;
  call(
    domain: string,
    service: string,
    data?: object,
    target?: object,
  ): Promise<unknown>;
}

export interface SceneRequest {
  url: string;
  method: "POST" | "DELETE";
  token: string;
  body?: object;
  timeoutMs: number;
}

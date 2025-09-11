declare module 'jsxapi' {
  export interface XAPI {
    on?: (event: string, listener: (...args: any[]) => void) => void;
    Command: any;
    Status: any;
    [key: string]: any;
  }

  export function connect(options: {
    host: string;
    username: string;
    password: string;
    protocol?: string;
  }): Promise<XAPI>;
}


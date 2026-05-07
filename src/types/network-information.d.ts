declare global {
  interface Navigator {
    connection?: NetworkInformation;
    mozConnection?: NetworkInformation;
    webkitConnection?: NetworkInformation;
  }

  interface NetworkInformation extends EventTarget {
    readonly downlink?: number;
    readonly effectiveType?: "slow-2g" | "2g" | "3g" | "4g";
    readonly rtt?: number;
    readonly saveData?: boolean;

    addEventListener(type: "change", listener: EventListenerOrEventListenerObject): void;

    removeEventListener(type: "change", listener: EventListenerOrEventListenerObject): void;
  }
}

export {};

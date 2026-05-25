declare module "@metamask/logo" {
  interface MetaMaskLogoOptions {
    pxNotRatio?: boolean;
    width?: number;
    height?: number;
    followMouse?: boolean;
    slowDrift?: boolean;
  }

  interface MetaMaskLogoViewer {
    container: HTMLElement;
    stopAnimation: () => void;
    lookAt: (point: { x: number; y: number }) => void;
  }

  function MetaMaskLogo(options: MetaMaskLogoOptions): MetaMaskLogoViewer;
  export = MetaMaskLogo;
}

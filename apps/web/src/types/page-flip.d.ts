declare module "page-flip" {
  export class PageFlip {
    constructor(element: HTMLElement, settings: Record<string, string | number | boolean>);
    loadFromHTML(items: HTMLElement[] | NodeListOf<HTMLElement>): void;
    flipNext(corner?: "top" | "bottom"): void;
    flipPrev(corner?: "top" | "bottom"): void;
    getCurrentPageIndex(): number;
    getPageCount(): number;
    getOrientation(): string;
    update(): void;
    destroy(): void;
    on(event: "flip", callback: (event: { data: number }) => void): this;
    on(event: string, callback: (event: { data: unknown }) => void): this;
  }
}

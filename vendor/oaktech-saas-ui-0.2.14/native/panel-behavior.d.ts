export interface AccountDialogOptions {
    document: Document;
    title: string;
    content: HTMLElement;
    returnFocus?: HTMLElement | null;
    onClose?: () => void;
}
/** A real modal shared by React portals and the native application adapter. */
export declare function openAccountDialog(options: AccountDialogOptions): () => void;
export interface QuickAccessPanelOptions extends AccountDialogOptions {
    returnFocus: HTMLElement;
}
/** The same dialog lifecycle, with an anchored desktop / compact mobile presentation. */
export declare function openQuickAccessPanel(options: QuickAccessPanelOptions): () => void;
/** Shared account-menu dismissal for React and the native browser adapter. */
export declare function bindAccountMenu(menu: HTMLDetailsElement, options?: {
    openPanel?: (panel: "account" | "settings") => void;
}): () => void;

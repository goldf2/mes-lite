/** A real modal shared by React portals and the native application adapter. */
export function openAccountDialog(options) {
    return openSharedDialog(options);
}
/** The same dialog lifecycle, with an anchored desktop / compact mobile presentation. */
export function openQuickAccessPanel(options) {
    return openSharedDialog(options, options.returnFocus);
}
function openSharedDialog({ document, title, content, returnFocus, onClose }, anchor) {
    const dialog = document.createElement("dialog");
    dialog.className = "oak-app-account-dialog";
    if (anchor)
        dialog.classList.add("oak-quick-access-panel");
    dialog.dataset.slot = "oak-app-account-dialog";
    dialog.setAttribute("aria-label", title);
    const heading = document.createElement("div");
    heading.className = "oak-app-account-dialog-header";
    const label = document.createElement("h2");
    label.className = "oak-app-account-dialog-title";
    label.textContent = title;
    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.className = "oak-app-account-dialog-close";
    dismiss.setAttribute("aria-label", "关闭窗口");
    dismiss.textContent = "×";
    heading.append(label, dismiss);
    content.classList.add("oak-app-account-dialog-content");
    content.dataset.slot = "oak-app-account-dialog-content";
    dialog.append(heading, content);
    const previousOverflow = document.body.style.overflow;
    const previousPadding = document.body.style.paddingRight;
    const previousClientWidth = document.documentElement.clientWidth;
    const previousFocus = returnFocus ?? document.activeElement;
    let closed = false;
    const view = document.defaultView;
    const position = () => {
        if (!anchor || !view || !dialog.open)
            return;
        if (view.innerWidth < 1024) {
            dialog.style.removeProperty("left");
            dialog.style.removeProperty("top");
            return;
        }
        const trigger = anchor.getBoundingClientRect();
        const panel = dialog.getBoundingClientRect();
        dialog.style.left = Math.max(12, Math.min(trigger.right - panel.width, view.innerWidth - panel.width - 12)) + "px";
        dialog.style.top = Math.max(12, Math.min(trigger.bottom + 8, view.innerHeight - panel.height - 12)) + "px";
    };
    // Portal content can grow after opening without a viewport or scroll event.
    const resizeObserver = anchor && view?.ResizeObserver ? new view.ResizeObserver(position) : null;
    const outside = (event) => {
        if (!anchor || closed)
            return;
        const pointer = event;
        const box = dialog.getBoundingClientRect();
        const path = event.composedPath();
        if ((!path.includes(dialog) && !path.includes(anchor)) || (event.target === dialog && (pointer.clientX < box.left || pointer.clientX > box.right || pointer.clientY < box.top || pointer.clientY > box.bottom)))
            close();
    };
    const trapFocus = (event) => {
        if (event.key !== "Tab" || event.ctrlKey || event.altKey || event.metaKey)
            return;
        const controls = Array.from(dialog.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')).filter(node => node.getClientRects().length > 0);
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (!first || !last)
            return;
        if (!dialog.contains(document.activeElement) || (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
            event.preventDefault();
            (event.shiftKey ? last : first).focus();
        }
    };
    const close = () => {
        if (closed)
            return;
        closed = true;
        resizeObserver?.disconnect();
        dialog.close();
        dialog.remove();
        document.removeEventListener("keydown", trapFocus, true);
        if (anchor) {
            document.removeEventListener("click", outside, true);
            view?.removeEventListener("resize", position);
            document.removeEventListener("scroll", position, true);
            document.body.style.paddingRight = previousPadding;
        }
        document.body.style.overflow = previousOverflow;
        onClose?.();
        if (previousFocus?.isConnected)
            previousFocus.focus({ preventScroll: true });
    };
    dismiss.addEventListener("click", close);
    dialog.addEventListener("cancel", event => { event.preventDefault(); close(); });
    dialog.addEventListener("click", event => {
        const box = dialog.getBoundingClientRect();
        if (event.target === dialog && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom))
            close();
    });
    document.body.append(dialog);
    // Preserve the reading width when the floating surface locks the page scroll.
    if (anchor && view) {
        document.addEventListener("click", outside, true);
        view.addEventListener("resize", position);
        document.addEventListener("scroll", position, true);
    }
    document.body.style.overflow = "hidden";
    if (anchor && view) {
        // Stable root gutters can remain after locking body overflow: compensate only
        // the space actually released, rather than counting the original gutter twice.
        const releasedWidth = Math.max(0, document.documentElement.clientWidth - previousClientWidth);
        if (releasedWidth)
            document.body.style.paddingRight = (parseFloat(view.getComputedStyle(document.body).paddingRight) + releasedWidth) + "px";
    }
    document.addEventListener("keydown", trapFocus, true);
    dialog.showModal();
    position();
    resizeObserver?.observe(dialog);
    dismiss.focus({ preventScroll: true });
    return close;
}
/** Shared account-menu dismissal for React and the native browser adapter. */
export function bindAccountMenu(menu, options = {}) {
    const document = menu.ownerDocument;
    const outside = (event) => {
        if (menu.open && !event.composedPath().includes(menu))
            menu.open = false;
    };
    const escape = (event) => {
        if (event.key !== "Escape" || event.defaultPrevented || !menu.open)
            return;
        const restoreFocus = menu.contains(document.activeElement);
        menu.open = false;
        if (restoreFocus) {
            event.preventDefault();
            menu.querySelector("summary")?.focus();
        }
    };
    const openPanel = (event) => {
        const target = event.target;
        const button = target?.closest("[data-oak-account-panel]");
        const panel = button?.dataset.oakAccountPanel;
        if (!button || !menu.contains(button) || !options.openPanel || (panel !== "account" && panel !== "settings"))
            return;
        event.preventDefault();
        menu.open = false;
        options.openPanel(panel);
    };
    // Capture also observes outside events stopped by an application-owned control.
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("click", outside, true);
    document.addEventListener("keydown", escape);
    menu.addEventListener("click", openPanel);
    return () => {
        document.removeEventListener("pointerdown", outside, true);
        document.removeEventListener("click", outside, true);
        document.removeEventListener("keydown", escape);
        menu.removeEventListener("click", openPanel);
    };
}

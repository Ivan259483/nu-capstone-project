import { useEffect, useRef, useState } from 'react';

/** Tracks hover/focus on the parent `.customer-sidebar-item` button. */
export function useCustomerSidebarItemHover<T extends HTMLElement>() {
    const ref = useRef<T>(null);
    const [hovered, setHovered] = useState(false);

    useEffect(() => {
        const item = ref.current?.closest('.customer-sidebar-item');
        if (!item) return;

        const onEnter = () => setHovered(true);
        const onLeave = () => setHovered(false);

        item.addEventListener('mouseenter', onEnter);
        item.addEventListener('mouseleave', onLeave);
        item.addEventListener('focusin', onEnter);
        item.addEventListener('focusout', onLeave);

        return () => {
            item.removeEventListener('mouseenter', onEnter);
            item.removeEventListener('mouseleave', onLeave);
            item.removeEventListener('focusin', onEnter);
            item.removeEventListener('focusout', onLeave);
        };
    }, []);

    return { ref, hovered };
}

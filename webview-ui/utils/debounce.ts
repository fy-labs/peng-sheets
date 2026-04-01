/**
 * Creates a debounced version of the given function.
 * The debounced function delays invoking `fn` until after `delay` milliseconds
 * have elapsed since the last time it was invoked.
 *
 * @returns A debounced function with `cancel()` and `flush()` methods.
 *   - `cancel()`: Clears any pending invocation.
 *   - `flush()`: Immediately invokes `fn` with the last arguments if a timer is pending;
 *     no-op otherwise.
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
    fn: T,
    delay: number
): ((...args: Parameters<T>) => void) & { cancel(): void; flush(): void } {
    let timer: number | null = null;
    let lastArgs: Parameters<T> | null = null;

    const debounced = (...args: Parameters<T>): void => {
        if (timer !== null) {
            window.clearTimeout(timer);
        }
        lastArgs = args;
        timer = window.setTimeout(() => {
            timer = null;
            lastArgs = null;
            fn(...args);
        }, delay);
    };

    debounced.cancel = (): void => {
        if (timer !== null) {
            window.clearTimeout(timer);
            timer = null;
        }
        lastArgs = null;
    };

    debounced.flush = (): void => {
        if (timer !== null) {
            window.clearTimeout(timer);
            const pendingArgs = lastArgs;
            timer = null;
            lastArgs = null;
            fn(...pendingArgs!);
        }
    };

    return debounced;
}

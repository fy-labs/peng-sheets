import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debounce } from '../../utils/debounce';

describe('debounce', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('should call the function once after the delay when invoked multiple times', () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 200);

        debounced();
        debounced();
        debounced();

        expect(fn).not.toHaveBeenCalled();

        vi.advanceTimersByTime(200);

        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should not call the function before the delay has elapsed', () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 300);

        debounced();

        vi.advanceTimersByTime(299);
        expect(fn).not.toHaveBeenCalled();

        vi.advanceTimersByTime(1);
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should pass the arguments of the last call to the function', () => {
        const fn = vi.fn();
        const debounced = debounce(fn as (...args: unknown[]) => unknown, 100);

        debounced('first');
        debounced('second');
        debounced('third');

        vi.advanceTimersByTime(100);

        expect(fn).toHaveBeenCalledWith('third');
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should not call the function after cancel()', () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 100);

        debounced();
        debounced.cancel();

        vi.advanceTimersByTime(100);

        expect(fn).not.toHaveBeenCalled();
    });

    it('should be reusable after cancel()', () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 100);

        debounced();
        debounced.cancel();

        vi.advanceTimersByTime(100);
        expect(fn).not.toHaveBeenCalled();

        // Second invocation after cancel should work normally
        debounced();
        vi.advanceTimersByTime(100);
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should reset the timer on each invocation', () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 200);

        debounced();
        vi.advanceTimersByTime(150);
        debounced(); // resets the timer

        vi.advanceTimersByTime(150); // 150ms after second call, 300ms total
        expect(fn).not.toHaveBeenCalled();

        vi.advanceTimersByTime(50); // now 200ms after second call
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('flush() should invoke the function immediately when a timer is pending', () => {
        const fn = vi.fn();
        const debounced = debounce(fn as (...args: unknown[]) => unknown, 200);

        debounced('arg1');
        debounced.flush();

        expect(fn).toHaveBeenCalledTimes(1);
        expect(fn).toHaveBeenCalledWith('arg1');

        // No additional call after the original delay
        vi.advanceTimersByTime(200);
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('flush() should be a no-op when no timer is pending', () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 200);

        debounced.flush();

        expect(fn).not.toHaveBeenCalled();
    });

    it('flush() should use the arguments from the last invocation', () => {
        const fn = vi.fn();
        const debounced = debounce(fn as (...args: unknown[]) => unknown, 200);

        debounced('first');
        debounced('second');
        debounced.flush();

        expect(fn).toHaveBeenCalledTimes(1);
        expect(fn).toHaveBeenCalledWith('second');
    });

    it('flush() should be a no-op after cancel()', () => {
        const fn = vi.fn();
        const debounced = debounce(fn as (...args: unknown[]) => unknown, 200);

        debounced('arg');
        debounced.cancel();
        debounced.flush();

        expect(fn).not.toHaveBeenCalled();
    });

    it('debounced function should work normally after flush()', () => {
        const fn = vi.fn();
        const debounced = debounce(fn as (...args: unknown[]) => unknown, 200);

        debounced('first');
        debounced.flush();

        expect(fn).toHaveBeenCalledTimes(1);

        debounced('second');
        vi.advanceTimersByTime(200);

        expect(fn).toHaveBeenCalledTimes(2);
        expect(fn).toHaveBeenLastCalledWith('second');
    });
});

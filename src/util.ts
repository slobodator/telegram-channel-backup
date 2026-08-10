export function requireNonNull<T>(value: T | null | undefined, message = "value"): T {
    return value ?? (() => {
        throw new Error(`${message} must be non-null`);
    })();
}

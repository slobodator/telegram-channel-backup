export function requireNonNull(value, message = "value") {
    if (value == null) {
        throw new Error(`${message} must be non-null`);
    }
    return value;
}

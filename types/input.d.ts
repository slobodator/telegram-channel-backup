/*
 * `input` ships no type definitions and has none on DefinitelyTyped.
 * Only the prompts this project actually uses are declared here. */
declare module "input" {
    interface Input {
        text(message?: string, options?: Record<string, unknown>): Promise<string>;

        password(message?: string, options?: Record<string, unknown>): Promise<string>;

        confirm(message?: string, options?: Record<string, unknown>): Promise<boolean>;
    }

    const input: Input;

    export default input;
}

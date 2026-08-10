/*
 * Bundles the Lambda handler and its dependencies into a single file.
 *
 *   node esbuild.mjs [outfile]
 *
 * Default outfile: build/lambda/index.mjs, which package-lambda.sh zips as-is.
 * esbuild does no type checking; run `npm run typecheck` for that.
 */
import {build} from "esbuild";

const ENTRY = "src/lambda.ts";
const OUTFILE = process.argv[2] ?? "build/lambda/index.mjs";

/*
 * The bundle has to be ESM: src/s3-client.ts loads credentials with a
 * top-level await, which the cjs output format cannot express.
 *
 * Several dependencies are CommonJS, and esbuild's ESM output routes their
 * require() calls through a helper that first looks for a global `require`.
 * In an ES module there is none, so the banner provides it, along with the
 * __filename / __dirname that CommonJS code expects to find. */
const banner = `import {createRequire as __createRequire} from "node:module";
import {dirname as __dirnameOf} from "node:path";
import {fileURLToPath as __fileURLToPath} from "node:url";
const require = __createRequire(import.meta.url);
const __filename = __fileURLToPath(import.meta.url);
const __dirname = __dirnameOf(__filename);`;

const result = await build({
    entryPoints: [ENTRY],
    outfile: OUTFILE,
    bundle: true,
    platform: "node",
    /* Must track RUNTIME in package-lambda.sh. */
    target: "node26",
    format: "esm",
    banner: {js: banner},
    /*
     * Left unminified: the artifact is small either way, and readable frames
     * in CloudWatch are worth more than the few hundred saved kilobytes.
     * Source content stays out of the map so no source is shipped. */
    sourcemap: true,
    sourcesContent: false,
    legalComments: "none",
    metafile: true,
    logLevel: "info"
});

const bytes = Object.values(result.metafile.outputs)
    .reduce((total, output) => total + output.bytes, 0);

console.log(`Bundled ${ENTRY} -> ${OUTFILE} (${(bytes / 1024 / 1024).toFixed(1)} MiB)`);

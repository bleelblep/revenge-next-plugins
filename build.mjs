// Builds every plugin in ./plugins into a Revenge Next external-plugin repository:
// one dist/<id>.zip per plugin (manifest.json + index.js) plus a root dist/index.json
// (format 1) listing every published version. See README.md for the format's origin —
// it was reverse-engineered from PalmDevs' live repo, not documented upstream.

import { createHash } from "crypto";
import { existsSync } from "fs";
import { mkdir, readFile, readdir, rm, writeFile } from "fs/promises";
import { join } from "path";

import AdmZip from "adm-zip";
import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import url from "@rollup/plugin-url";
import { rollup } from "rollup";
import esbuild from "rollup-plugin-esbuild";
import swc from "@swc/core";

const REPO_NAME = "Bleelblep's Revenge Next Plugins";
const REPO_DESCRIPTION =
    "Revenge Next ports of bleelblep/revengeplugins, built from this repository.";
// Where dist/ ends up published (GitHub Pages). Used to build each version's "url".
const BASE_URL = "https://bleelblep.github.io/revenge-next-plugins";

const extensions = [".js", ".jsx", ".mjs", ".ts", ".tsx", ".cts", ".mts"];

/** @type import("rollup").InputPluginOption */
const plugins = [
    nodeResolve(),
    commonjs(),
    url({
        include: ["**/*.svg", "**/*.png", "**/*.jpg", "**/*.gif"],
        limit: 0,
    }),
    {
        name: "swc",
        async transform(code, id) {
            const ext = extensions.find((e) => id.endsWith(e));
            if (!ext) return null;

            const ts = ext.includes("ts");
            const tsx = ts ? ext.endsWith("x") : undefined;
            const jsx = !ts ? ext.endsWith("x") : undefined;

            const result = await swc.transform(code, {
                filename: id,
                jsc: {
                    externalHelpers: true,
                    parser: {
                        syntax: ts ? "typescript" : "ecmascript",
                        tsx,
                        jsx,
                    },
                    transform: {
                        react: {
                            runtime: "automatic",
                            importSource: "revenge",
                        },
                    },
                },
                env: {
                    targets: "defaults",
                    include: ["transform-classes", "transform-arrow-functions"],
                },
            });
            return result.code;
        },
    },
    esbuild({ minify: true }),
];

async function readPreviousIndex() {
    const path = "./dist/index.json";
    if (!existsSync(path)) return null;
    try {
        return JSON.parse(await readFile(path, "utf-8"));
    } catch {
        return null;
    }
}

async function buildPlugin(dir) {
    const srcManifestPath = `./plugins/${dir}/manifest.json`;
    const manifest = JSON.parse(await readFile(srcManifestPath, "utf-8"));
    const id = manifest.id ?? `bleelblep.${dir}`;

    const outDir = `./dist/.build/${dir}`;
    await mkdir(outDir, { recursive: true });
    const outScript = `${outDir}/index.js`;

    const bundle = await rollup({
        input: `./plugins/${dir}/${manifest.main ?? "src/index.ts"}`,
        onwarn: () => {},
        external: ["revenge/jsx-runtime"],
        plugins,
    });

    await bundle.write({
        file: outScript,
        format: "iife",
        compact: true,
        exports: "named",
        globals: {
            "revenge/jsx-runtime": "revenge.react.ReactJSXRuntime",
        },
    });
    await bundle.close();

    const scriptContents = await readFile(outScript);

    /** @type any */
    const pluginManifest = {
        format: 1,
        id,
        name: manifest.name,
        description: manifest.description,
        author: manifest.author,
        version: manifest.version,
        dependencies: manifest.dependencies ?? {
            "revenge.api": { version: ">=1" },
            discord: { version: "*" },
        },
        dist: { script: "index.js" },
    };
    if (manifest.icon) pluginManifest.icon = manifest.icon;

    await writeFile(
        `${outDir}/manifest.json`,
        JSON.stringify(pluginManifest, null, "\t"),
    );

    const zip = new AdmZip();
    zip.addLocalFile(outScript);
    zip.addLocalFile(`${outDir}/manifest.json`);
    const zipBuffer = zip.toBuffer();
    const zipPath = `./dist/${id}.zip`;
    await writeFile(zipPath, zipBuffer);

    const sha256 = createHash("sha256").update(zipBuffer).digest("hex");
    const size = zipBuffer.length;

    console.log(`Built ${manifest.name} (${id}@${manifest.version}) - ${size}B`);

    return {
        id,
        entry: {
            name: manifest.name,
            description: manifest.description,
            author: manifest.author,
            ...(manifest.icon ? { icon: manifest.icon } : {}),
        },
        version: manifest.version,
        versionEntry: {
            url: `${BASE_URL}/${id}.zip`,
            sha256,
            size,
            dependencies: pluginManifest.dependencies,
        },
    };
}

async function main() {
    await mkdir("./dist", { recursive: true });

    const previous = await readPreviousIndex();
    /** @type any */
    const index = {
        format: 1,
        name: REPO_NAME,
        description: REPO_DESCRIPTION,
        // Rebuilt from scratch each run (not seeded from `previous`) so a plugin removed from
        // ./plugins drops out of index.json too, instead of leaving a stale entry pointing at
        // a zip that no longer gets built. Version *history* for plugins that are still
        // present is still inherited from `previous` below.
        plugins: {},
    };

    let failed = false;
    for (const dir of await readdir("./plugins")) {
        try {
            const { id, entry, version, versionEntry } = await buildPlugin(dir);

            const existing = previous?.plugins?.[id];
            index.plugins[id] = {
                ...entry,
                channels: { ...(existing?.channels ?? {}), latest: version },
                versions: {
                    ...(existing?.versions ?? {}),
                    [version]: versionEntry,
                },
            };
        } catch (error) {
            failed = true;
            console.error(`Failed to build plugin "${dir}":`, error);
        }
    }

    await writeFile("./dist/index.json", JSON.stringify(index, null, "\t"));
    await rm("./dist/.build", { recursive: true, force: true });

    if (failed) process.exit(1);
    console.log(`\nWrote dist/index.json with ${Object.keys(index.plugins).length} plugin(s).`);
}

await main();

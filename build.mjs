// Builds every plugin in ./plugins into a Revenge Next external-plugin repository:
// one dist/<id>.zip per plugin (manifest.json + index.js) plus a root dist/index.json
// (format 1) listing every published version. See README.md for the format's origin —
// it was reverse-engineered from PalmDevs' live repo, not documented upstream.

import { createHash } from "crypto";
import { existsSync } from "fs";
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from "fs/promises";

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

async function readRepoConfig() {
    const path = "./repo.config.json";
    if (!existsSync(path)) return null;
    try {
        return JSON.parse(await readFile(path, "utf-8"));
    } catch {
        return null;
    }
}

function parseVersion(version) {
    const [core, label = ""] = version.split("-", 2);
    const segments = core.split(".").map((s) => Number.parseInt(s, 10) || 0);
    return { segments, label: label.toLowerCase() };
}

function compareVersions(a, b) {
    const av = parseVersion(a);
    const bv = parseVersion(b);

    const len = Math.max(av.segments.length, bv.segments.length);
    for (let i = 0; i < len; i++) {
        const ai = av.segments[i] ?? 0;
        const bi = bv.segments[i] ?? 0;
        if (ai !== bi) return ai - bi;
    }

    if (av.label === bv.label) return 0;
    if (!av.label) return 1;
    if (!bv.label) return -1;
    return av.label.localeCompare(bv.label);
}

function isPrerelease(version) {
    return version.includes("-");
}

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function validateManifest(manifest, dir) {
    const where = `plugins/${dir}/manifest.json`;

    assert(manifest && typeof manifest === "object", `${where}: manifest must be an object`);
    assert(manifest.format === 1, `${where}: "format" must be 1`);
    assert(typeof manifest.id === "string" && manifest.id.length > 0, `${where}: "id" is required`);
    assert(typeof manifest.name === "string" && manifest.name.length > 0, `${where}: "name" is required`);
    assert(
        typeof manifest.description === "string" && manifest.description.length > 0,
        `${where}: "description" is required`,
    );
    assert(typeof manifest.author === "string" && manifest.author.length > 0, `${where}: "author" is required`);
    assert(typeof manifest.version === "string" && manifest.version.length > 0, `${where}: "version" is required`);

    assert(manifest.dependencies && typeof manifest.dependencies === "object", `${where}: "dependencies" is required`);
    assert(
        typeof manifest.dependencies?.["revenge.api"]?.version === "string",
        `${where}: dependencies.revenge.api.version is required`,
    );
    assert(
        typeof manifest.dependencies?.discord?.version === "string",
        `${where}: dependencies.discord.version is required`,
    );

    assert(manifest.dist && typeof manifest.dist === "object", `${where}: "dist" is required`);
    assert(typeof manifest.dist.script === "string" && manifest.dist.script.length > 0, `${where}: dist.script is required`);
    assert(
        manifest.dist.script === "index.js",
        `${where}: dist.script must be "index.js" (builder currently outputs index.js)`,
    );
}

async function buildPlugin(dir) {
    const srcManifestPath = `./plugins/${dir}/manifest.json`;
    const manifest = JSON.parse(await readFile(srcManifestPath, "utf-8"));
    validateManifest(manifest, dir);
    const id = manifest.id;

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

    /** @type any */
    const pluginManifest = {
        format: manifest.format,
        id,
        name: manifest.name,
        description: manifest.description,
        author: manifest.author,
        version: manifest.version,
        dependencies: manifest.dependencies,
        dist: manifest.dist,
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
    const artifactFile = `${id}-${manifest.version}.zip`;
    const zipPath = `./dist/${artifactFile}`;
    await writeFile(zipPath, zipBuffer);

    const sha256 = createHash("sha256").update(zipBuffer).digest("hex");
    const size = zipBuffer.length;

    console.log(`Built ${manifest.name} (${id}@${manifest.version}) - ${size}B`);

    return {
        id,
        artifactFile,
        entry: {
            name: manifest.name,
            description: manifest.description,
            author: manifest.author,
            ...(manifest.icon ? { icon: manifest.icon } : {}),
        },
        version: manifest.version,
        versionEntry: {
            url: `${BASE_URL}/${artifactFile}`,
            sha256,
            size,
            dependencies: pluginManifest.dependencies,
        },
    };
}

async function main() {
    await mkdir("./dist", { recursive: true });

    const previous = await readPreviousIndex();
    const repoConfig = await readRepoConfig();
    /** @type {Map<string, Map<string, string>>} */
    const builtArtifacts = new Map();
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
            const { id, artifactFile, entry, version, versionEntry } = await buildPlugin(dir);

            if (!builtArtifacts.has(id)) builtArtifacts.set(id, new Map());
            builtArtifacts.get(id).set(version, artifactFile);

            const existing = index.plugins[id] ?? previous?.plugins?.[id];
            index.plugins[id] = {
                ...entry,
                channels: { ...(existing?.channels ?? {}) },
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

    for (const [id, plugin] of Object.entries(index.plugins)) {
        const versions = Object.keys(plugin.versions ?? {});
        if (!versions.length) continue;

        const latestStable = versions
            .filter((v) => !isPrerelease(v))
            .sort(compareVersions)
            .at(-1);
        const newestOverall = versions.sort(compareVersions).at(-1);

        const preservedChannels = { ...(plugin.channels ?? {}) };
        delete preservedChannels.latest;
        delete preservedChannels.beta;

        plugin.channels = { ...preservedChannels };
        if (latestStable) plugin.channels.latest = latestStable;
        if (newestOverall && newestOverall !== latestStable) {
            plugin.channels.beta = newestOverall;
        }

        const overrideChannels = repoConfig?.channels?.[id];
        if (overrideChannels && typeof overrideChannels === "object") {
            for (const [channelName, version] of Object.entries(overrideChannels)) {
                if (!plugin.versions[version]) {
                    throw new Error(
                        `repo.config.json override for ${id}.${channelName} points to missing version ${version}`,
                    );
                }
                plugin.channels[channelName] = version;
            }
        }

        const aliasVersion = plugin.channels.latest ?? plugin.channels.beta ?? newestOverall;
        const artifactFile = builtArtifacts.get(id)?.get(aliasVersion);
        if (artifactFile) {
            await copyFile(`./dist/${artifactFile}`, `./dist/${id}.zip`);
        }
    }

    await writeFile("./dist/index.json", JSON.stringify(index, null, "\t"));
    await rm("./dist/.build", { recursive: true, force: true });

    if (failed) process.exit(1);
    console.log(`\nWrote dist/index.json with ${Object.keys(index.plugins).length} plugin(s).`);
}

await main();

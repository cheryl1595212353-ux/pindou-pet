import { describe, expect, it } from "vitest";

import { PETS } from "./petCatalog";
import { DOG_CLIPS } from "./pixelDogModel";
import { SCENES } from "./sceneCatalog";

const NODE_FS_MODULE: string = "node:fs";
const NODE_PATH_MODULE: string = "node:path";
const NODE_URL_MODULE: string = "node:url";

interface FileStats {
  readonly size: number;
  isFile(): boolean;
}

interface FileSystemModule {
  readFileSync(path: string, encoding: "utf8"): string;
  statSync(path: string): FileStats;
}

interface PathModule {
  dirname(path: string): string;
  join(...paths: string[]): string;
  resolve(...paths: string[]): string;
}

interface UrlModule {
  fileURLToPath(url: string | URL): string;
}

interface ManifestState {
  readonly row: number;
  readonly frames: number;
  readonly loop: boolean;
}

interface PetManifest {
  readonly id: string;
  readonly base: {
    readonly path: string;
    readonly width: number;
    readonly height: number;
  };
  readonly spritesheetPath: string;
  readonly atlas: {
    readonly width: number;
    readonly height: number;
    readonly columns: number;
    readonly rows: number;
    readonly cellWidth: number;
    readonly cellHeight: number;
  };
  readonly states: Readonly<Record<string, ManifestState>>;
}

async function loadPublicAssetTools() {
  const fileSystem = await import(NODE_FS_MODULE) as FileSystemModule;
  const path = await import(NODE_PATH_MODULE) as PathModule;
  const { fileURLToPath } = await import(NODE_URL_MODULE) as UrlModule;
  const testDirectory = path.dirname(fileURLToPath(import.meta.url));
  const publicDirectory = path.resolve(testDirectory, "../../../public");

  return {
    fileSystem,
    path,
    publicDirectory,
    fromPublicPath(publicPath: string) {
      return path.resolve(publicDirectory, publicPath.replace(/^\/+/, ""));
    },
  };
}

function expectNonemptyFile(fileSystem: FileSystemModule, filePath: string) {
  const stats = fileSystem.statSync(filePath);
  expect(stats.isFile()).toBe(true);
  expect(stats.size).toBeGreaterThan(0);
}

const assetStateIds = Object.keys(DOG_CLIPS).slice(0, 9) as Array<keyof typeof DOG_CLIPS>;

describe.each(PETS)("$displayName public pet assets", (pet) => {
  it("matches the shared nine-row manifest contract", async () => {
    const {
      fileSystem,
      path,
      publicDirectory,
      fromPublicPath,
    } = await loadPublicAssetTools();
    const petDirectory = path.join(publicDirectory, "pixel-dog", pet.id);
    const manifestPath = path.join(petDirectory, "pet.json");
    const basePath = fromPublicPath(pet.basePath);
    const spritesheetPath = fromPublicPath(pet.spritesheetPath);

    for (const assetPath of [basePath, manifestPath, spritesheetPath]) {
      expectNonemptyFile(fileSystem, assetPath);
    }

    const manifest = JSON.parse(
      fileSystem.readFileSync(manifestPath, "utf8"),
    ) as PetManifest;

    expect(manifest.id).toBe(pet.id);
    expect(manifest.base).toMatchObject({
      path: "base.png",
      width: 128,
      height: 128,
    });
    expect(manifest.atlas).toEqual({
      width: 1536,
      height: 1872,
      columns: 8,
      rows: 9,
      cellWidth: 192,
      cellHeight: 208,
    });
    expect(path.resolve(petDirectory, manifest.base.path)).toBe(basePath);
    expect(path.resolve(petDirectory, manifest.spritesheetPath)).toBe(spritesheetPath);
    expect(Object.keys(manifest.states)).toEqual(assetStateIds);

    for (const stateId of assetStateIds) {
      const clip = DOG_CLIPS[stateId];
      expect(manifest.states[stateId]).toMatchObject({
        row: clip.row,
        frames: clip.frameCount,
        loop: clip.loop,
      });
    }
  });
});

describe.each(SCENES)("$displayName public scene asset", (scene) => {
  it("resolves to a nonempty WebP file", async () => {
    const { fileSystem, fromPublicPath } = await loadPublicAssetTools();
    const scenePath = fromPublicPath(scene.backgroundPath);

    expect(scene.backgroundPath.endsWith(".webp")).toBe(true);
    expectNonemptyFile(fileSystem, scenePath);
  });
});

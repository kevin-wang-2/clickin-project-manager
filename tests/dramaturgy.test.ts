import { describe, it, expect, beforeAll } from "vitest";
import { listScenesByVersion, getSceneById, listProductionCharacters, getCharacterById, getActiveVersionId } from "@/lib/db";
import { getPool } from "@/lib/pg";
import { PROD_PLANET, PROD_CULTURE } from "./helpers";

let planetVersionId: string;
let cultureVersionId: string;

beforeAll(async () => {
  planetVersionId = (await getActiveVersionId(PROD_PLANET))!;
  cultureVersionId = (await getActiveVersionId(PROD_CULTURE))!;
});

describe("scenes", () => {
  it("listScenesByVersion returns scenes for 我们的星星", async () => {
    const scenes = await listScenesByVersion(planetVersionId);
    expect(scenes.length).toBeGreaterThan(0);
  });

  it("listScenesByVersion returns scenes for 供养2.0", async () => {
    const scenes = await listScenesByVersion(cultureVersionId);
    expect(scenes.length).toBeGreaterThan(0);
  });

  it("scene table has 100+ rows across both productions", async () => {
    const res = await getPool().query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM scene WHERE production_id = ANY($1)`,
      [[PROD_PLANET, PROD_CULTURE]]
    );
    expect(parseInt(res.rows[0].count)).toBeGreaterThanOrEqual(50);
  });

  it("getSceneById returns the correct scene", async () => {
    const scenes = await listScenesByVersion(planetVersionId);
    const first = scenes[0];
    const scene = await getSceneById(first.id, PROD_PLANET);
    expect(scene).not.toBeNull();
    expect(scene!.id).toBe(first.id);
  });

  it("getSceneById returns null for non-existent scene", async () => {
    expect(await getSceneById("no-such-scene", PROD_PLANET)).toBeNull();
  });
});

describe("characters", () => {
  it("listProductionCharacters returns characters for 我们的星星", async () => {
    const chars = await listProductionCharacters(PROD_PLANET);
    expect(chars.length).toBeGreaterThan(0);
  });

  it("getCharacterById returns the correct character", async () => {
    const chars = await listProductionCharacters(PROD_PLANET);
    const char = await getCharacterById(chars[0].id, PROD_PLANET);
    expect(char).not.toBeNull();
    expect(char!.id).toBe(chars[0].id);
  });

  it("getCharacterById returns null for wrong production", async () => {
    const chars = await listProductionCharacters(PROD_PLANET);
    expect(await getCharacterById(chars[0].id, PROD_CULTURE)).toBeNull();
  });
});

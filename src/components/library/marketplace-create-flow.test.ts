import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const filePath = join(process.cwd(), "src/components/library/MarketplaceOverview.tsx");
const source = readFileSync(filePath, "utf8");

test("Explore Drills create CTA initializes a new drill draft before navigating", () => {
  assert.equal(source.includes("await createDrill(repositoryContext)"), true);
  assert.equal(source.includes("router.push(`/studio?intent=create&drillId=${encodeURIComponent(created.drillId)}`)"), true);
});

test("Explore Drills create CTA is no longer a plain studio link", () => {
  assert.equal(source.includes("<Link className=\"pill\" href=\"/studio\""), false);
});

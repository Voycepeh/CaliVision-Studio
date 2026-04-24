import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.cwd(), "src/components/upload/UploadVideoWorkspace.tsx"), "utf8");

test("hold drill summary cards include best/total/count metrics", () => {
  assert.equal(source.includes('label: "Best hold"'), true);
  assert.equal(source.includes('label: "Total hold time"'), true);
  assert.equal(source.includes('label: "Completed holds"'), true);
});

import test from "node:test";
import assert from "node:assert/strict";
import { computeThumbnailCropRect, estimateDataUriByteSize, resolveDrillThumbnail } from "./thumbnail.ts";
import type { PortableAssetRef, PortableDrill } from "../schema/contracts.ts";

function createDrill(): PortableDrill {
  return {
    drillId: "drill-1",
    title: "Wall Handstand Hold",
    drillType: "hold",
    difficulty: "beginner",
    tags: [],
    primaryView: "side",
    phases: []
  };
}

test("resolveDrillThumbnail prefers explicit uploaded thumbnail", () => {
  const drill = createDrill();
  drill.thumbnailAssetId = "thumb-1";
  drill.previewAssetId = "prev-1";

  const assets: PortableAssetRef[] = [
    { assetId: "thumb-1", type: "image", role: "drill-thumbnail", uri: "data:image/png;base64,aaa" },
    { assetId: "prev-1", type: "image", role: "drill-preview", uri: "data:image/png;base64,bbb" }
  ];

  const resolved = resolveDrillThumbnail(drill, assets);
  assert.equal(resolved.source, "uploaded");
  assert.equal(resolved.src, "data:image/png;base64,aaa");
});

test("resolveDrillThumbnail falls back to generated asset when upload missing", () => {
  const drill = createDrill();
  drill.thumbnailAssetId = "missing";
  drill.previewAssetId = "prev-1";

  const assets: PortableAssetRef[] = [{ assetId: "prev-1", type: "image", role: "drill-preview", uri: "data:image/png;base64,bbb" }];

  const resolved = resolveDrillThumbnail(drill, assets);
  assert.equal(resolved.source, "generated");
  assert.equal(resolved.src, "data:image/png;base64,bbb");
});

test("resolveDrillThumbnail returns fallback data uri for legacy drills", () => {
  const drill = createDrill();
  const resolved = resolveDrillThumbnail(drill, []);
  assert.equal(resolved.source, "fallback");
  assert.match(resolved.src, /^data:image\/svg\+xml/);
});

test("computeThumbnailCropRect center-crops wide source images to 16:9", () => {
  const crop = computeThumbnailCropRect(3000, 1000);
  assert.equal(crop.sy, 0);
  assert.equal(crop.sh, 1000);
  assert.equal(crop.sw, 1778);
});

test("computeThumbnailCropRect center-crops tall source images to 16:9", () => {
  const crop = computeThumbnailCropRect(1000, 3000);
  assert.equal(crop.sx, 0);
  assert.equal(crop.sw, 1000);
  assert.equal(crop.sh, 563);
});

test("estimateDataUriByteSize estimates decoded byte length", () => {
  const bytes = estimateDataUriByteSize("data:image/jpeg;base64,QUJDRA==");
  assert.equal(bytes, 4);
});

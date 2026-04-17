import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("src/components/workflow-setup/DrillOriginSelector.tsx", "utf8");
const css = readFileSync("src/app/globals.css", "utf8");

test("outside pointer interaction closes the combobox", () => {
  assert.ok(source.includes("document.addEventListener(\"pointerdown\""));
  assert.ok(source.includes("!wrapperRef.current?.contains(event.target as Node)"));
  assert.ok(!source.includes("document.addEventListener(\"mousedown\""));
});

test("desktop combobox keeps explicit layering styles for visible options panel", () => {
  assert.ok(source.includes("data-combobox-open={isOpen ? \"true\" : \"false\"}"));
  assert.ok(source.includes("zIndex: isOpen && !isMobileViewport ? 120 : 1"));
  assert.ok(source.includes("drill-combobox-listbox--desktop"));
});

test("mobile combobox uses dedicated modal sheet presentation", () => {
  assert.ok(source.includes("const MOBILE_MEDIA_QUERY = \"(max-width: 760px)\""));
  assert.ok(source.includes("data-mobile-combobox={isMobileViewport ? \"true\" : \"false\"}"));
  assert.ok(source.includes("className=\"drill-combobox-mobile-overlay\""));
  assert.ok(source.includes("className=\"drill-combobox-mobile-sheet\""));
  assert.ok(source.includes("role=\"dialog\""));
});

test("public drill options render readable text labels in the options panel", () => {
  assert.ok(source.includes("className=\"drill-combobox-option-label\""));
  assert.ok(source.includes("{entry.label}"));
  assert.ok(css.includes(".drill-combobox-option-label"));
  assert.ok(css.includes("font-size: 0.9rem;"));
});

test("desktop and mobile keep search behavior in shared selector logic", () => {
  assert.ok(source.includes("searchDrillsByOrigin(visibleOptions, query)"));
  assert.ok(source.includes("placeholder=\"Search drills\""));
});

test("open selector surface uses strong contrast and separation styling", () => {
  assert.ok(css.includes(".drill-combobox-listbox"));
  assert.ok(css.includes("box-shadow: 0 16px 36px rgba(4, 10, 20, 0.56);"));
  assert.ok(css.includes("border: 1px solid rgba(168, 202, 255, 0.5);"));
  assert.ok(css.includes(".drill-combobox-option.is-selected"));
});

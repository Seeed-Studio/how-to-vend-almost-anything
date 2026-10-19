import assert from "node:assert/strict";
import test from "node:test";
import { validateProposal } from "./index.mjs";

function proposal(overrides = {}, files = []) {
  const form = new FormData();
  form.set("system", overrides.system ?? "dispensing");
  form.set("changeType", overrides.changeType ?? "idea");
  form.set("title", overrides.title ?? "Wider kit slot");
  form.set("description", overrides.description ?? "A tested idea for a wider product bay.");
  form.set("license", overrides.license ?? "MIT");
  for (const file of files) form.append("files", file);
  return form;
}

test("rejects an unknown system", () => {
  assert.throws(() => validateProposal(proposal({ system: "nope" })), /Unknown system category/);
});

test("rejects a disallowed file type", () => {
  const file = new File(["hello"], "notes.exe");
  assert.throws(() => validateProposal(proposal({}, [file])), /File type not allowed: notes.exe/);
});

test("rejects an oversized file", () => {
  const file = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "big.stl");
  assert.throws(() => validateProposal(proposal({}, [file])), /File too large: big.stl/);
});

test("accepts a small model without calling GitHub", () => {
  const file = new File(["solid"], "arm.stl");
  const result = validateProposal(proposal({}, [file]));
  assert.equal(result.system, "dispensing");
  assert.equal(result.files.length, 1);
  assert.equal(result.files[0].name, "arm.stl");
});

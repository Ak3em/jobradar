import test from "node:test"; import assert from "node:assert/strict"; import {migrate} from "../state.js";
test("v1 entries keep status and missing, gain history", () => {
  const s = migrate({a:{status:"saved"}, b:{status:"started", missing:"cover letter"}}, "T");
  assert.equal(s.schema, 2); assert.equal(s.jobs.b.missing, "cover letter"); assert.deepEqual(s.jobs.a.history, [{status:"saved", at:"T"}]);
});
test("empty and junk input yield an empty v2 state", () => { assert.deepEqual(migrate(null).jobs, {}); assert.deepEqual(migrate({x:5}).jobs, {}); });
test("v2 passes through and export round-trips", () => {
  const s = migrate({a:{status:"applied"}}); assert.deepEqual(migrate(JSON.parse(JSON.stringify(s))), s);
});
test("entry without status gets empty history", () => assert.deepEqual(migrate({a:{missing:"x"}}).jobs.a.history, []));

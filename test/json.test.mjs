import test from 'node:test';
import assert from 'node:assert/strict';
import { extractJsonObjects, createStreamingExtractor, extractStringFields } from '../dist/index.js';

test('extracts complete objects, ignores braces inside strings', () => {
  const buffer = '[{"q":"the set {1,2,3}","a":"\\\\frac{1}{2}"},{"q":"x","a":"y"}]';
  const objs = extractJsonObjects(buffer);
  assert.equal(objs.length, 2);
  assert.equal(objs[0].a, '\\frac{1}{2}');
});

test('streaming extractor yields objects only as they complete', () => {
  const ex = createStreamingExtractor();
  assert.deepEqual(ex.push('[{"a":1'), []);
  assert.deepEqual(ex.push('},{"b":2}'), [{ a: 1 }, { b: 2 }]);
});

test('field-level recovery from a truncated object', () => {
  const fields = extractStringFields('{"front":"What is \\\\pi?","back":"3.14', ['front']);
  assert.equal(fields.front, 'What is \\pi?');
});

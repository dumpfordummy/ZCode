import assert from 'node:assert/strict';
import test from 'node:test';
import { marker } from './fixture.mjs';
test('synthetic marker', () => assert.equal(marker, 'Z1_AFTER_7391'));

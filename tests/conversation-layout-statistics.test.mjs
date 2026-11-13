import test from 'node:test';
import assert from 'node:assert/strict';
import {createConversationLayoutModel} from '../src/conversation-layout-model.js';

const KEY = 'dsh-dock.floating.showStatistics';

function fixture(t, initial) {
  const data = new Map(initial === undefined ? [] : [[KEY, initial]]);
  const handlers = new Set();
  const writes = [];
  let readFailure = null;
  let writeFailure = null;
  const storage = {
    getItem(key) {
      if (readFailure) throw readFailure;
      return data.get(key) ?? null;
    },
    setItem(key, value) {
      if (writeFailure) throw writeFailure;
      writes.push([key, value]);
      data.set(key, value);
    },
  };
  const eventTarget = {
    addEventListener(type, listener) { assert.equal(type, 'storage'); handlers.add(listener); },
    removeEventListener(type, listener) { assert.equal(type, 'storage'); handlers.delete(listener); },
  };
  const model = createConversationLayoutModel({storage, eventTarget});
  t.after(() => model.dispose());
  return {
    model, data, storage, writes, handlers,
    readFailure(value) { readFailure = value; },
    writeFailure(value) { writeFailure = value; },
    event({key = KEY, storageArea = storage} = {}) {
      for (const listener of [...handlers]) listener({key, storageArea});
    },
  };
}

test('statistics default hidden and persist globally across Sessions and model recreation', t => {
  const f = fixture(t);
  assert.equal(f.model.getSnapshot().showStatistics, false);
  assert.deepEqual(f.writes, []);
  f.model.setContext({sessionId: 'a', available: true});
  f.model.setMode('floating');
  f.model.setRect({left: 200, top: 100, width: 600, height: 320});
  const rectangle = f.model.getSnapshot().rect;
  f.model.setShowStatistics(true);
  assert.equal(f.model.getSnapshot().showStatistics, true);
  assert.equal(f.data.get(KEY), 'true');
  assert.deepEqual(f.model.getSnapshot().rect, rectangle);
  f.model.setContext({sessionId: 'b', available: true});
  assert.equal(f.model.getSnapshot().showStatistics, true);
  f.model.reset();
  assert.equal(f.model.getSnapshot().showStatistics, true);
  const restored = createConversationLayoutModel({storage: f.storage, eventTarget: undefined});
  t.after(() => restored.dispose());
  assert.equal(restored.getSnapshot().showStatistics, true);
  f.model.setShowStatistics(false);
  assert.equal(f.data.get(KEY), 'false');
});

test('malformed and unavailable saved values default to hidden', t => {
  for (const raw of ['bad json', 'null', '[]', '{}', '1', '"true"', 'false']) {
    assert.equal(fixture(t, raw).model.getSnapshot().showStatistics, false, raw);
  }
  assert.equal(fixture(t, 'true').model.getSnapshot().showStatistics, true);
  const missing = createConversationLayoutModel({storage: undefined, eventTarget: undefined});
  const blocked = createConversationLayoutModel({
    storage: {getItem() { throw new Error('blocked'); }}, eventTarget: undefined,
  });
  t.after(() => { missing.dispose(); blocked.dispose(); });
  assert.equal(missing.getSnapshot().showStatistics, false);
  assert.equal(blocked.getSnapshot().showStatistics, false);
});

test('failed persistence applies the current choice and reports its unsaved state for retry', t => {
  const f = fixture(t, 'false');
  f.model.setContext({sessionId: 'a', available: true});
  const geometry = f.model.getSnapshot().rect;
  const observed = [];
  const stop = f.model.subscribe(() => observed.push(f.model.getSnapshot().showStatistics));
  f.writeFailure(new Error('quota exceeded'));
  assert.throws(() => f.model.setShowStatistics(true), error =>
    error.code === 'STATISTICS_PREFERENCE_NOT_SAVED' && /已应用.*未能保存/.test(error.message));
  assert.equal(f.model.getSnapshot().showStatistics, true);
  assert.equal(f.data.get(KEY), 'false');
  assert.deepEqual(f.model.getSnapshot().rect, geometry);
  assert.deepEqual(observed, [true]);
  stop();
  const resumed = f.model.subscribe(() => {});
  assert.equal(f.model.getSnapshot().showStatistics, true);
  f.writeFailure(null);
  assert.equal(f.model.setShowStatistics(true), false);
  assert.equal(f.data.get(KEY), 'true');
  resumed();
});

test('storage events synchronize only the matching preference and retain geometry through read failures', t => {
  const f = fixture(t, 'false');
  f.model.setContext({sessionId: 'a', available: true});
  f.model.setMode('floating');
  f.model.setRect({left: 150, top: 100, width: 500, height: 300});
  const geometry = f.model.getSnapshot().rect;
  let notifications = 0;
  const stop = f.model.subscribe(() => notifications++);
  f.data.set(KEY, 'true');
  f.event({key: 'other'});
  f.event({storageArea: {}});
  assert.equal(f.model.getSnapshot().showStatistics, false);
  f.event();
  assert.equal(f.model.getSnapshot().showStatistics, true);
  assert.deepEqual(f.model.getSnapshot().rect, geometry);
  const unchanged = f.model.getSnapshot();
  f.event();
  assert.equal(f.model.getSnapshot(), unchanged);
  f.readFailure(new Error('blocked'));
  f.data.set(KEY, 'false');
  f.event();
  assert.equal(f.model.getSnapshot(), unchanged);
  f.readFailure(null);
  f.data.set(KEY, 'malformed');
  f.event();
  assert.equal(f.model.getSnapshot().showStatistics, false);
  f.data.set(KEY, 'true');
  f.event();
  f.data.clear();
  f.event({key: null});
  assert.equal(f.model.getSnapshot().showStatistics, false);
  assert.equal(notifications, 4);
  stop();
});

test('subscriptions share storage listening and disposal releases it without changing saved preferences', t => {
  const f = fixture(t, 'true');
  const first = f.model.subscribe(() => { throw new Error('observer failed'); });
  let notifications = 0;
  const second = f.model.subscribe(() => notifications++);
  assert.equal(f.handlers.size, 1);
  assert.doesNotThrow(() => f.model.setShowStatistics(false));
  assert.equal(notifications, 1);
  assert.throws(() => f.model.setShowStatistics('false'), TypeError);
  first();
  first();
  assert.equal(f.handlers.size, 1);
  second();
  assert.equal(f.handlers.size, 0);
  f.data.set(KEY, 'true');
  const last = f.model.subscribe(() => notifications++);
  assert.equal(f.model.getSnapshot().showStatistics, true);
  assert.equal(f.handlers.size, 1);
  const snapshot = f.model.getSnapshot();
  f.model.dispose();
  f.model.dispose();
  last();
  assert.equal(f.handlers.size, 0);
  assert.equal(f.data.get(KEY), 'true');
  assert.equal(f.model.setShowStatistics(false), false);
  f.event();
  assert.equal(f.model.getSnapshot(), snapshot);
});

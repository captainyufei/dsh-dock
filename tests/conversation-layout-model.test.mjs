import test from 'node:test';
import assert from 'node:assert/strict';
import { createConversationLayoutModel } from '../src/conversation-layout-model.js';

function active(model, sessionId = 'one', title = '当前会话') {
  model.setContext({ sessionId, title, available: true });
}

test('keeps immutable snapshots stable until visible state changes', () => {
  const model = createConversationLayoutModel();
  const initial = model.getSnapshot();
  assert.equal(initial.available, false);
  assert.equal(initial.mode, 'left');
  assert.equal(model.getSnapshot(), initial);
  assert.equal(Object.isFrozen(initial), true);
  assert.equal(Object.isFrozen(initial.rect), true);
  assert.equal(Object.isFrozen(initial.displayRect), true);
  assert.equal(Object.isFrozen(initial.bubbleRect), true);

  let updates = 0;
  const stop = model.subscribe(() => updates++);
  active(model);
  const current = model.getSnapshot();
  active(model);
  model.setMode('left');
  model.setBounds({ left: 0, top: 0, width: 1280, height: 800 });
  assert.equal(model.getSnapshot(), current);
  assert.equal(updates, 1);
  model.setMode('right');
  assert.equal(updates, 2);
  stop();
  model.setMode('floating');
  assert.equal(updates, 2);
});

test('remembers each Session layout and floating position across navigation', () => {
  const model = createConversationLayoutModel();
  active(model);
  model.setMode('floating');
  model.setMinimized(true);
  model.setRect({ left: 100, top: 120, width: 450 });
  const first = model.getSnapshot();

  active(model, 'two', '另一个会话');
  assert.equal(model.getSnapshot().mode, 'left');
  model.setMode('right');
  active(model);
  assert.equal(model.getSnapshot().mode, 'floating');
  assert.equal(model.getSnapshot().minimized, true);
  assert.deepEqual(model.getSnapshot().rect, first.rect);

  model.setContext({ sessionId: 'one', title: '当前会话', available: false });
  assert.equal(model.getSnapshot().mode, 'left');
  assert.equal(model.getSnapshot().minimized, false);
  active(model);
  assert.equal(model.getSnapshot().mode, 'floating');
  assert.equal(model.getSnapshot().minimized, true);
  active(model, 'two');
  assert.equal(model.getSnapshot().mode, 'right');
});

test('keeps the default card bottom-centered and clamps a dragged card after resizing', () => {
  const model = createConversationLayoutModel();
  model.setBounds({ left: 100, top: 50, width: 1000, height: 700 });
  active(model);
  assert.deepEqual(model.getFloatingBounds(), {left: 116, top: 66, right: 1084, bottom: 734, width: 968, height: 668});
  assert.deepEqual(model.getSnapshot().rect, { left: 309.5, top: 474, width: 581, height: 260 });
  model.setBounds({ height: 800 });
  assert.deepEqual(model.getSnapshot().rect, { left: 309.5, top: 574, width: 581, height: 260 });

  model.setRect({ left: 900, top: 900, width: 700 });
  assert.deepEqual(model.getSnapshot().rect, { left: 384, top: 574, width: 700, height: 260 });
  model.setBounds({ width: 420, height: 400 });
  assert.deepEqual(model.getSnapshot().rect, { left: 116, top: 174, width: 388, height: 260 });
  model.setBounds({ floatingHeight: 340 });
  assert.equal(model.getSnapshot().rect.top, 174);
  assert.equal(model.getSnapshot().rect.height, 260);
});

test('automatic width follows the available track with comfortable limits and keeps its anchor', () => {
  const model = createConversationLayoutModel();
  active(model);
  model.setMode('floating');
  for (const [trackWidth, width] of [[1000, 581], [1600, 941], [2200, 1040], [900, 560], [500, 468], [0, 0]]) {
    model.setBounds({left: 100, top: 50, width: trackWidth, height: 700});
    const area = model.getFloatingBounds();
    const rect = model.getSnapshot().rect;
    assert.equal(rect.width, width);
    assert.equal(rect.left, area.left + (area.width - width) / 2);
    assert.equal(rect.top + rect.height, area.bottom);
  }
  model.setBounds({width: 1600});
  model.snapToEdge('right');
  model.setBounds({width: 2000});
  const area = model.getFloatingBounds();
  assert.equal(model.getSnapshot().rect.width, 1040);
  assert.equal(model.getSnapshot().rect.left + model.getSnapshot().rect.width, area.right);
  model.dispose();
});

test('moving and vertical resizing keep automatic width until an explicit horizontal resize', () => {
  const model = createConversationLayoutModel();
  active(model);
  model.setMode('floating');
  model.setFloatingPresentation('focused');
  // Title dragging passes its current width together with the moved position.
  model.setDisplayRect({...model.getSnapshot().displayRect, left: 100, top: 200});
  model.resizeFromEdge('top', -40, model.getSnapshot().displayRect);
  model.setBounds({width: 1600});
  assert.equal(model.getSnapshot().rect.width, 941);
  model.resizeFromEdge('right', -100, model.getSnapshot().displayRect);
  assert.equal(model.getSnapshot().rect.width, 841);
  model.setBounds({width: 2000});
  assert.equal(model.getSnapshot().rect.width, 841);
  model.dispose();
});

test('manual widths survive viewport clamping and stay independent for each Session', () => {
  const model = createConversationLayoutModel();
  model.setBounds({width: 1800});
  active(model);
  model.setMode('floating');
  model.setRect({width: 900});
  model.snapToEdge('right');
  model.setBounds({width: 500});
  assert.equal(model.getSnapshot().rect.width, 468);
  model.setMinimized(true);
  model.setBounds({width: 1600});
  model.setMinimized(false);
  assert.equal(model.getSnapshot().rect.width, 900);
  assert.equal(model.getSnapshot().rect.left + model.getSnapshot().rect.width, model.getFloatingBounds().right);

  active(model, 'two');
  model.setMode('floating');
  assert.equal(model.getSnapshot().rect.width, 941);
  model.setBounds({width: 1400});
  assert.equal(model.getSnapshot().rect.width, 821);
  active(model);
  assert.equal(model.getSnapshot().rect.width, 900);
  model.reset();
  assert.equal(model.getSnapshot().rect.width, 821);
  model.dispose();
});

test('fits narrow and zero-size tracks with finite coordinates', () => {
  const model = createConversationLayoutModel();
  active(model);
  for (const [width, height] of [[300, 500], [40, 100], [0, 0]]) {
    model.setBounds({ left: 30, top: 40, width, height });
    model.setRect({ left: -1000, top: 10000, width: 2000 });
    const rect = model.getSnapshot().rect;
    assert.ok(rect.width >= 0 && rect.width <= width);
    assert.ok(rect.left >= 30 && rect.left + rect.width <= 30 + width);
    assert.ok(rect.top >= 40 && rect.top <= 40 + height);
    assert.ok(rect.height >= 0 && rect.top + rect.height <= 40 + height);
    assert.ok(Object.values(rect).every(Number.isFinite));
    const bubble = model.getSnapshot().bubbleRect;
    assert.ok(bubble.left >= 30 && bubble.left + bubble.width <= 30 + width);
    assert.ok(bubble.top >= 40 && bubble.top + bubble.height <= 40 + height);
  }
});

test('ignores invalid inputs without losing the current Session preference', () => {
  const model = createConversationLayoutModel();
  active(model);
  model.setMode('floating');
  const current = model.getSnapshot();
  assert.equal(model.setMode('unknown'), false);
  assert.equal(model.setMinimized('yes'), false);
  assert.equal(model.setRect({ left: NaN, top: Infinity, width: -10 }), false);
  model.setBounds({ left: NaN, top: Infinity, width: -1, height: -1, floatingHeight: -1 });
  assert.equal(model.getSnapshot(), current);
  model.setContext(null);
  assert.equal(model.getSnapshot().sessionId, null);
  assert.equal(model.setMode('floating'), false);
  active(model);
  assert.equal(model.getSnapshot().mode, 'floating');
});

test('restoring to a pane clears minimization and reset affects only its Session', () => {
  const model = createConversationLayoutModel();
  active(model);
  model.setMode('floating');
  model.setMinimized(true);
  model.setMode('right');
  model.setMode('floating');
  assert.equal(model.getSnapshot().minimized, false);
  active(model, 'two');
  model.setMode('right');
  active(model);
  model.setRect({ left: 100, top: 100 });
  model.reset();
  assert.equal(model.getSnapshot().mode, 'left');
  assert.deepEqual(model.getSnapshot().rect, { left: 265.5, top: 524, width: 749, height: 260 });
  active(model, 'two');
  assert.equal(model.getSnapshot().mode, 'right');
});

test('disposal is idempotent and releases subscriptions without late updates', () => {
  const model = createConversationLayoutModel();
  active(model);
  let updates = 0;
  const stop = model.subscribe(() => updates++);
  model.dispose();
  model.dispose();
  const last = model.getSnapshot();
  model.setContext({ sessionId: 'two', available: true });
  model.setMode('floating');
  model.setMinimized(true);
  model.setRect({ left: 100 });
  model.setBounds({ width: 100 });
  model.reset();
  model.subscribe(() => updates++);
  stop();
  assert.equal(model.getSnapshot(), last);
  assert.equal(updates, 0);
});

test('vertical edge resizing preserves the opposite edge at minimum and maximum height', () => {
  const model = createConversationLayoutModel();
  active(model);
  model.setMode('floating');
  model.setRect({left: 200, top: 200, width: 500, height: 400});
  const origin = model.getSnapshot().rect;
  model.resizeFromEdge('top', 500, origin);
  assert.deepEqual(model.getSnapshot().rect, {left: 200, top: 510, width: 500, height: 90});
  model.resizeFromEdge('top', 800, origin);
  assert.equal(model.getSnapshot().rect.top + model.getSnapshot().rect.height, 600);
  model.resizeFromEdge('top', -1000, origin);
  assert.deepEqual(model.getSnapshot().rect, {left: 200, top: 16, width: 500, height: 584});
  model.resizeFromEdge('bottom', -1000, origin);
  assert.deepEqual(model.getSnapshot().rect, {left: 200, top: 200, width: 500, height: 90});
  model.resizeFromEdge('bottom', 1000, origin);
  assert.deepEqual(model.getSnapshot().rect, {left: 200, top: 200, width: 500, height: 584});
  assert.deepEqual(model.getResizeLimits('height'), {min: 90, max: 768});
  model.dispose();
});

test('width resizing accepts legacy rectangles and retains height and opposite edge', () => {
  const model = createConversationLayoutModel();
  active(model);
  model.setMode('floating');
  model.setRect({left: 200, top: 120, width: 560, height: 360});
  const legacyOrigin = {left: 200, top: 120, width: 560};
  model.resizeFromEdge('left', 1000, legacyOrigin);
  assert.deepEqual(model.getSnapshot().rect, {left: 440, top: 120, width: 320, height: 360});
  model.resizeFromEdge('right', 1000, legacyOrigin);
  assert.deepEqual(model.getSnapshot().rect, {left: 200, top: 120, width: 1064, height: 360});
  model.setRect({left: 210, top: 130});
  assert.equal(model.getSnapshot().rect.height, 360);
  model.dispose();
});

test('bottom snapping retains dimensions and follows viewport changes until another drag or resize', () => {
  const model = createConversationLayoutModel();
  active(model);
  model.setMode('floating');
  model.setRect({left: 100, top: 100, width: 640, height: 360});
  model.snapToBottom();
  assert.deepEqual(model.getSnapshot().rect, {left: 320, top: 424, width: 640, height: 360});
  model.setBounds({width: 1500, height: 900, floatingHeight: 40});
  assert.deepEqual(model.getSnapshot().rect, {left: 430, top: 524, width: 640, height: 360});
  model.resizeFromEdge('top', -100, model.getSnapshot().rect);
  assert.deepEqual(model.getSnapshot().rect, {left: 430, top: 424, width: 640, height: 460});
  model.setBounds({width: 1600, height: 1000});
  assert.deepEqual(model.getSnapshot().rect, {left: 430, top: 424, width: 640, height: 460});
  model.snapToBottom();
  assert.deepEqual(model.getSnapshot().rect, {left: 480, top: 524, width: 640, height: 460});
  model.setRect({left: 120, top: 80});
  model.setBounds({width: 1700, height: 1100});
  assert.deepEqual(model.getSnapshot().rect, {left: 120, top: 80, width: 640, height: 460});
  model.dispose();
});

test('minimization uses an independent corner bubble and restores the same Session dimensions', () => {
  const model = createConversationLayoutModel();
  model.setBounds({floatingHeight: 310});
  active(model);
  model.setMode('floating');
  assert.equal(model.getSnapshot().rect.height, 310);
  model.setRect({left: 200, top: 140, width: 600, height: 420});
  const expanded = model.getSnapshot().rect;
  model.setMinimized(true);
  assert.deepEqual(model.getSnapshot().rect, expanded);
  assert.deepEqual(model.getSnapshot().bubbleRect, {left: 1216, top: 736, width: 48, height: 48});
  model.setBounds({floatingHeight: 48});
  assert.deepEqual(model.getSnapshot().rect, expanded);
  model.setMinimized(false);
  assert.deepEqual(model.getSnapshot().rect, expanded);
  active(model, 'two');
  model.setMode('floating');
  model.setRect({height: 220});
  active(model);
  assert.deepEqual(model.getSnapshot().rect, expanded);
  active(model, 'two');
  assert.equal(model.getSnapshot().rect.height, 220);
  model.dispose();
});

test('edge snapping keeps floating mode and dimensions while following its viewport edge', () => {
  const model = createConversationLayoutModel();
  active(model);
  model.setMode('floating');
  model.setRect({left: 200, top: 120, width: 600, height: 300});
  model.snapToEdge('left');
  assert.equal(model.getSnapshot().mode, 'floating');
  assert.deepEqual(model.getSnapshot().rect, {left: 16, top: 120, width: 600, height: 300});
  model.setBounds({left: 100, top: 50, width: 1500, height: 900});
  assert.deepEqual(model.getSnapshot().rect, {left: 116, top: 120, width: 600, height: 300});
  model.snapToEdge('right');
  assert.deepEqual(model.getSnapshot().rect, {left: 984, top: 120, width: 600, height: 300});
  model.setBounds({width: 1600, height: 240});
  assert.deepEqual(model.getSnapshot().rect, {left: 1084, top: 66, width: 600, height: 208});
  const current = model.getSnapshot();
  assert.equal(model.snapToEdge('top'), false);
  assert.equal(model.getSnapshot(), current);
  model.dispose();
});

test('Session switching and minimization retain edge snapping until another drag or resize', () => {
  const model = createConversationLayoutModel();
  active(model);
  model.setMode('floating');
  model.setRect({left: 200, top: 120, width: 500, height: 300});
  model.snapToEdge('right');
  const expanded = model.getSnapshot().rect;
  model.setMinimized(true);
  assert.deepEqual(model.getSnapshot().rect, expanded);
  active(model, 'two');
  model.setMode('floating');
  active(model);
  model.setMinimized(false);
  assert.deepEqual(model.getSnapshot().rect, expanded);
  model.setBounds({width: 1400});
  assert.equal(model.getSnapshot().rect.left, 884);
  model.setRect({left: 100, top: 140});
  model.setBounds({width: 1500});
  assert.deepEqual(model.getSnapshot().rect, {left: 100, top: 140, width: 500, height: 300});
  model.snapToEdge('right');
  model.resizeFromEdge('left', -100, model.getSnapshot().rect);
  const resized = model.getSnapshot().rect;
  model.setBounds({width: 1600});
  assert.deepEqual(model.getSnapshot().rect, resized);
  model.snapToBottom();
  assert.deepEqual(model.getSnapshot().rect, {left: 500, top: 484, width: 600, height: 300});
  model.dispose();
});

test('drag snapping uses all four card corners and bottom center below the native header', () => {
  const cases = [
    {left: 80, top: 120, snappedLeft: 16, snappedTop: 64, resizedLeft: 116, resizedTop: 76},
    {left: 650, top: 120, snappedLeft: 704, snappedTop: 64, resizedLeft: 924, resizedTop: 76},
    {left: 80, top: 450, snappedLeft: 16, snappedTop: 524, resizedLeft: 116, resizedTop: 684},
    {left: 650, top: 450, snappedLeft: 704, snappedTop: 524, resizedLeft: 924, resizedTop: 684},
    {left: 360, top: 120, snappedLeft: 360, snappedTop: 524, resizedLeft: 520, resizedTop: 684},
  ];
  for (const position of cases) {
    const model = createConversationLayoutModel();
    model.setBounds({left: 0, top: 48, width: 1280, height: 752});
    active(model);
    model.setMode('floating');
    model.setRect({left: position.left, top: position.top, width: 560, height: 260});
    model.snapAfterDrag();
    assert.deepEqual(model.getSnapshot().rect, {
      left: position.snappedLeft, top: position.snappedTop, width: 560, height: 260,
    });
    assert.equal(model.getSnapshot().mode, 'floating');
    const expanded = model.getSnapshot().rect;
    model.setMinimized(true);
    model.setMinimized(false);
    assert.deepEqual(model.getSnapshot().rect, expanded);
    model.setBounds({left: 100, top: 60, width: 1400, height: 900});
    assert.deepEqual(model.getSnapshot().rect, {
      left: position.resizedLeft, top: position.resizedTop, width: 560, height: 260,
    });
    model.dispose();
  }
});

test('corner selection accounts for the whole card size and converges safely in a filled viewport', () => {
  const model = createConversationLayoutModel();
  active(model);
  model.setMode('floating');
  model.setFloatingPresentation('expanded');
  const area = model.getFloatingBounds();
  for (const [width, height] of [[400, 220], [900, 500]]) {
    model.setRect({
      left: area.left + (area.width - width) * 0.15,
      top: area.top + (area.height - height) * 0.2,
      width, height,
    });
    model.snapAfterDrag();
    assert.deepEqual(model.getSnapshot().rect, {left: area.left, top: area.top, width, height});
  }
  model.setBounds({width: 300, height: 220});
  model.setRect({left: -500, top: -500, width: 500, height: 500});
  model.snapAfterDrag();
  assert.deepEqual(model.getSnapshot().rect, {left: 16, top: 16, width: 268, height: 188});
  model.dispose();
});

test('floating presentations retain reading dimensions and preserve bottom or top corner anchors', () => {
  const model = createConversationLayoutModel();
  active(model);
  model.setMode('floating');
  model.setComposerHeight(106);
  const reading = model.getSnapshot().rect;
  assert.equal(model.getSnapshot().floatingPresentation, 'idle');
  assert.deepEqual(model.getSnapshot().displayRect, {left: 265.5, top: 676, width: 749, height: 108});

  model.setFloatingPresentation('focused');
  assert.deepEqual(model.getSnapshot().rect, reading);
  assert.deepEqual(model.getSnapshot().displayRect, {left: 265.5, top: 636, width: 749, height: 148});
  const focused = model.getSnapshot();
  assert.equal(model.setFloatingPresentation('focused'), false);
  assert.equal(model.getSnapshot(), focused);
  model.setFloatingPresentation('expanded');
  assert.deepEqual(model.getSnapshot().displayRect, reading);
  model.setFloatingPresentation('focused');
  model.setBounds({height: 600});
  assert.deepEqual(model.getSnapshot().displayRect, {left: 265.5, top: 436, width: 749, height: 148});

  model.setDisplayRect({left: 30, top: 30});
  model.snapAfterDrag();
  assert.equal(model.getSnapshot().displayRect.top, 16);
  model.setFloatingPresentation('expanded');
  assert.equal(model.getSnapshot().rect.top, 16);
  model.setFloatingPresentation('idle');
  model.setBounds({left: 100, top: 60, height: 700});
  assert.deepEqual(model.getSnapshot().displayRect, {left: 116, top: 76, width: 749, height: 108});
  model.dispose();
});

test('compact dragging and width resizing use visible coordinates while retaining expanded height', () => {
  const model = createConversationLayoutModel();
  active(model);
  model.setMode('floating');
  model.setComposerHeight(46);
  model.setFloatingPresentation('focused');
  model.setDisplayRect({left: 100, top: 250, width: 500});
  const origin = model.getSnapshot().displayRect;
  assert.deepEqual(origin, {left: 100, top: 250, width: 500, height: 88});
  assert.equal(model.getSnapshot().rect.height, 260);
  model.resizeFromEdge('left', 50, origin);
  assert.deepEqual(model.getSnapshot().displayRect, {left: 150, top: 250, width: 450, height: 88});
  assert.equal(model.getSnapshot().rect.height, 260);
  assert.equal(model.getSnapshot().floatingPresentation, 'focused');
  model.setDisplayRect({left: 50, top: 20});
  assert.equal(model.getSnapshot().displayRect.top, 20);
  assert.equal(model.getSnapshot().rect.height, 260);
  model.snapAfterDrag();
  assert.deepEqual(model.getSnapshot().displayRect, {left: 16, top: 16, width: 450, height: 88});
  model.setFloatingPresentation('expanded');
  assert.deepEqual(model.getSnapshot().rect, {left: 16, top: 16, width: 450, height: 260});
  model.dispose();
});

test('vertical resizing opens history continuously from the focused visible height', () => {
  const model = createConversationLayoutModel();
  active(model);
  model.setMode('floating');
  model.setComposerHeight(46);
  model.setFloatingPresentation('focused');
  const origin = model.getSnapshot().displayRect;
  const initial = model.getSnapshot();
  assert.equal(model.resizeFromEdge('top', 0, origin), false);
  assert.equal(model.getSnapshot(), initial);
  model.resizeFromEdge('top', -10, origin);
  assert.equal(model.getSnapshot().floatingPresentation, 'expanded');
  assert.equal(model.getSnapshot().rect.height, 98);
  assert.equal(model.getSnapshot().rect.top, origin.top - 10);
  assert.equal(model.getSnapshot().rect.top + model.getSnapshot().rect.height, origin.top + origin.height);
  assert.deepEqual(model.getSnapshot().displayRect, model.getSnapshot().rect);
  assert.deepEqual(model.getResizeLimits('height'), {min: 88, max: 768});

  model.setFloatingPresentation('focused');
  model.setDisplayRect({top: 300});
  const bottomOrigin = model.getSnapshot().displayRect;
  model.resizeFromEdge('bottom', 10, bottomOrigin);
  assert.equal(model.getSnapshot().floatingPresentation, 'expanded');
  assert.equal(model.getSnapshot().rect.top, 300);
  assert.equal(model.getSnapshot().rect.height, bottomOrigin.height + 10);
  model.dispose();
});

test('vertical resizing an idle card at either viewport edge keeps the expanded header inside bounds', () => {
  for (const edge of ['top', 'bottom']) {
    const model = createConversationLayoutModel();
    active(model);
    model.setMode('floating');
    const area = model.getFloatingBounds();
    const compactHeight = model.getSnapshot().displayRect.height;
    model.setDisplayRect({left: area.left, top: edge === 'top' ? area.top : area.bottom - compactHeight});
    model.snapAfterDrag();
    const origin = model.getSnapshot().displayRect;
    model.resizeFromEdge(edge, edge === 'top' ? -10 : 10, origin);
    const expanded = model.getSnapshot();
    assert.equal(expanded.floatingPresentation, 'expanded');
    assert.equal(expanded.rect.height, 90);
    assert.equal(expanded.rect.left, origin.left);
    assert.equal(expanded.rect.width, origin.width);
    assert.ok(expanded.rect.top >= area.top);
    assert.ok(expanded.rect.top + expanded.rect.height <= area.bottom);
    assert.equal(edge === 'top' ? expanded.rect.top : expanded.rect.top + expanded.rect.height,
      edge === 'top' ? area.top : area.bottom);
    assert.deepEqual(expanded.displayRect, expanded.rect);
    model.dispose();
  }
});

test('composer measurements and presentations stay with their Session through minimize and restore', () => {
  const model = createConversationLayoutModel();
  active(model, 'one');
  model.setMode('floating');
  model.setRect({height: 420});
  model.setComposerHeight(106);
  model.setFloatingPresentation('focused');
  const first = model.getSnapshot();
  model.setMinimized(true);
  assert.deepEqual(model.getSnapshot().displayRect, model.getSnapshot().bubbleRect);
  assert.deepEqual(model.getSnapshot().rect, first.rect);
  model.setMinimized(false);
  assert.deepEqual(model.getSnapshot().displayRect, first.displayRect);
  active(model, 'two');
  model.setMode('floating');
  assert.equal(model.getSnapshot().floatingPresentation, 'idle');
  assert.equal(model.getSnapshot().displayRect.height, 50);
  active(model, 'one');
  assert.equal(model.getSnapshot().floatingPresentation, 'focused');
  assert.deepEqual(model.getSnapshot().rect, first.rect);
  assert.deepEqual(model.getSnapshot().displayRect, first.displayRect);
  model.setComposerHeight(138);
  assert.equal(model.getSnapshot().displayRect.height, 180);
  assert.equal(model.getSnapshot().displayRect.top + model.getSnapshot().displayRect.height,
    first.displayRect.top + first.displayRect.height);
  assert.equal(model.getSnapshot().rect.height, 420);
  model.dispose();
});

test('presentation APIs reject invalid updates and keep visible geometry inside tiny bounds', () => {
  const model = createConversationLayoutModel();
  active(model);
  model.setMode('floating');
  const initial = model.getSnapshot();
  assert.equal(model.setFloatingPresentation('other'), false);
  for (const height of [NaN, Infinity, -1, 0, '48']) assert.equal(model.setComposerHeight(height), false);
  assert.equal(model.setDisplayRect({left: NaN, top: Infinity, width: -1, height: 50}), false);
  assert.equal(model.getSnapshot(), initial);
  for (const presentation of ['idle', 'focused', 'expanded']) {
    model.setFloatingPresentation(presentation);
    model.setBounds({left: 30, top: 40, width: 40, height: 60});
    model.setDisplayRect({left: -1000, top: 1000, width: 1000});
    const rect = model.getSnapshot().displayRect;
    assert.ok(Object.values(rect).every(Number.isFinite));
    assert.ok(rect.left >= 30 && rect.left + rect.width <= 70);
    assert.ok(rect.top >= 40 && rect.top + rect.height <= 100);
  }
  model.dispose();
  const last = model.getSnapshot();
  assert.equal(model.setComposerHeight(200), false);
  assert.equal(model.setFloatingPresentation('focused'), false);
  assert.equal(model.setDisplayRect({left: 40}), false);
  assert.equal(model.getSnapshot(), last);
});

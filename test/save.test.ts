import { describe, expect, it } from 'vitest';
import { Game } from '../src/game';
import { NIGHTS } from '../src/sim/data';
import { describe as describeSave, reevaluate, restore, snapshot } from '../src/save';

function finishNight(g: Game) {
  for (let i = 0; i < 20 && g.state.phase === 'fire'; i++) {
    g.fastForward(999);
    if (g.state.event) g.chooseEvent(0);
  }
}

function playedToFire() {
  const g = new Game();
  g.begin();
  g.enter();
  g.autoPlace();
  g.seal();
  g.feed(true);
  g.fastForward(30);
  g.feed(false);
  return g;
}

describe('save / restore (AC-18)', () => {
  it('a snapshot keeps the night, the load and the fire', () => {
    const g = playedToFire();
    const save = snapshot(g.state);
    const back = restore(save, {});
    expect(back).not.toBeNull();
    expect(back!.phase).toBe('fire');
    expect(back!.night).toBe(0);
    expect(back!.slots).toEqual(g.state.slots);
    expect(back!.fire.t).toBeCloseTo(g.state.fire.t, 5);
    expect(back!.fire.temp).toBeCloseTo(g.state.fire.temp, 5);
    expect(back!.wares.map((w) => w.def.id)).toEqual(g.state.wares.map((w) => w.def.id));
  });

  it('restores the same wares the kiln produced', () => {
    const g = playedToFire();
    finishNight(g);
    expect(g.state.phase).toBe('open');
    const save = snapshot(g.state);
    const back = restore(save, {})!;
    const again = reevaluate(back);
    expect(again.map((p) => p.verdict)).toEqual(g.state.pieces.map((p) => p.verdict));
  });

  it('keeps the collection across a restart', () => {
    const g = playedToFire();
    finishNight(g);
    g.revealAll();
    const codex = g.state.collected;
    expect(Object.keys(codex).length).toBeGreaterThan(0);

    const fresh = new Game();
    fresh.seedCodex(codex);
    const back = restore(snapshot(g.state), fresh.state.collected)!;
    expect(back.collected).toEqual(codex);
  });

  it('refuses a save that does not fit', () => {
    const g = playedToFire();
    const save = snapshot(g.state);
    expect(restore({ ...save, night: 9 }, {})).toBeNull();
    expect(restore({ ...save, wares: ['nope'] }, {})).toBeNull();
  });

  it('describes where the player left off', () => {
    const g = playedToFire();
    const line = describeSave(snapshot(g.state));
    expect(line).toContain('第一夜');
    expect(line).toContain('烧窑');
  });

  it('never saves a finished or unstarted run', () => {
    const g = new Game();
    expect(describeSave(snapshot(g.state))).toContain('未开始');
    expect(NIGHTS.length).toBe(3);
  });
});

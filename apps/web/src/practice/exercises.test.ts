import { describe, expect, it } from "vitest";
import { BOXES, EXERCISES, exercisesOf, hasDifficulty, isUnlocked, nextExercise, parse, playableExercises, rankOf, RANKS, serialize, solvedKey, spanish, xpOf } from "@visual-tracert/model";
import { checkGoals } from "./check";

describe("exercises", () => {
  it.each(EXERCISES.map(item => [item.id, item] as const))("%s starts unsolved and its solution meets every goal", (_id, exercise) => {
    const start = exercise.build(spanish);
    // a valid lab, as its document says
    expect(parse(serialize(start, "yaml"), "yaml").problems).toEqual([]);
    const before = checkGoals(start, exercise.goals, spanish);
    expect(before.some(result => !result.ok)).toBe(true);
    const after = checkGoals(exercise.solve(start), exercise.goals, spanish);
    expect(after.map((result, i) => [exercise.goals[i].text, result.ok, result.detail])).toEqual(after.map((result, i) => [exercise.goals[i].text, true, result.detail]));
  });

  it("gives every playable box exercises, its first one open from the start", () => {
    for(const box of BOXES.filter(item => !item.upcoming)){
      const exercises = exercisesOf(box.id);
      expect(exercises.length).toBeGreaterThan(0);
      expect(isUnlocked(exercises[0], {})).toBe(true);
    }
    expect(new Set(EXERCISES.map(item => item.id)).size).toBe(EXERCISES.length);
  });

  it("opens a box's levels one after another, and suggests the next one of the path", () => {
    const [first, second] = exercisesOf("basics");
    expect(isUnlocked(first, {})).toBe(true);
    expect(isUnlocked(second, {})).toBe(false);
    expect(isUnlocked(second, { [first.id]: 1 })).toBe(true);
    expect(nextExercise({})?.id).toBe(first.id);
    expect(nextExercise({ [first.id]: 1 })?.id).toBe(second.id);
  });

  it("gives every machine a medium difficulty, with its CLI steps", () => {
    for(const exercise of EXERCISES){
      // the emulator checks every kind of goal on the real devices (verify.ts)
      expect(exercise.cli?.length, exercise.id).toBeGreaterThan(0);
      expect(exercise.cliUnavailable, exercise.id).toBeUndefined();
    }
    expect(playableExercises("medium").map(item => item.id)).toEqual(playableExercises("easy").map(item => item.id));
  });

  it("keeps each difficulty's progress apart, and opens medium levels by medium ones", () => {
    const [first, second] = exercisesOf("basics");
    expect(solvedKey(first.id)).toBe(first.id);
    expect(solvedKey(first.id, "medium")).toBe(`${first.id}:medium`);
    // solved in easy: the medium level 2 stays closed
    expect(isUnlocked(second, { [first.id]: 1 }, "medium")).toBe(false);
    expect(isUnlocked(second, { [solvedKey(first.id, "medium")]: 1 }, "medium")).toBe(true);
    // the path in medium goes on to the next topic
    const solved = Object.fromEntries(exercisesOf("basics").map(item => [solvedKey(item.id, "medium"), 1]));
    expect(nextExercise(solved, "medium")?.id).toBe(exercisesOf("switching").filter(item => hasDifficulty(item, "medium"))[0].id);
  });

  it("gives every machine a name, a story and an avatar, the names apart", () => {
    for(const exercise of EXERCISES) expect([exercise.codename, exercise.story, exercise.icon].every(Boolean)).toBe(true);
    expect(new Set(EXERCISES.map(item => item.codename)).size).toBe(EXERCISES.length);
  });

  it("counts the points of what was solved, twice from the CLI, into ranks", () => {
    const first = EXERCISES.find(item => item.id === "first-network")!;
    expect(xpOf(first, "easy")).toBe(10);
    expect(xpOf(first, "medium")).toBe(20);
    expect(rankOf({})).toMatchObject({ xp: 0, rank: RANKS[0].name, level: 1, progress: 0 });
    const all = Object.fromEntries(EXERCISES.flatMap(item => [[solvedKey(item.id), 1], ...(item.cli ? [[solvedKey(item.id, "medium"), 1]] : [])]));
    // everything solved reaches the last rank
    expect(rankOf(all)).toMatchObject({ rank: RANKS[RANKS.length - 1].name, progress: 1 });
  });
});

describe("learning: the starting point and the tracks", () => {
  it("names only machines that exist", async () => {
    const { EXERCISES, TIERS, TRACKS } = await import("@visual-tracert/model");
    const ids = new Set(EXERCISES.map(item => item.id));
    for(const tier of TIERS){
      for(const id of tier.machines ?? []) expect(ids.has(id), id).toBe(true);
    }
    for(const track of TRACKS){
      for(const id of track.machines) expect(ids.has(id), `${track.id}: ${id}`).toBe(true);
      expect(track.upcoming || track.machines.length > 0, track.id).toBeTruthy();
      // the CLI track: only machines with a medium difficulty
      if(track.difficulty === "medium") for(const id of track.machines) expect(EXERCISES.find(item => item.id === id)!.cli, id).toBeDefined();
    }
  });
});

describe("the starting point's guides", () => {
  it("draws every figure they name, with a quiz of 40 questions or more", async () => {
    const { guides } = await import("@visual-tracert/model/guides/es");
    const { FIGURES } = await import("./figures");
    for(const [tier, guide] of Object.entries(guides)){
      const figures = guide.sections.flatMap(section => section.blocks.flatMap(block => ("figure" in block ? [block.figure] : [])));
      for(const id of figures) expect(FIGURES[id], `${tier}: ${id}`).toBeDefined();
      expect(guide.quiz.length, tier).toBeGreaterThanOrEqual(40);
    }
  });
});

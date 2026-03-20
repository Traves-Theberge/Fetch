import { describe, it, expect, vi, beforeEach } from 'vitest';

const fsAccessMock = vi.fn();
const fsReadFileMock = vi.fn();

vi.mock('fs/promises', () => ({
  default: {
    access: (...args: unknown[]) => fsAccessMock(...args),
    readFile: (...args: unknown[]) => fsReadFileMock(...args),
  },
}));

vi.mock('../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { loadSkill, checkRequirements } from '../../src/skills/loader.js';

describe('loadSkill', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when SKILL.md does not exist', async () => {
    fsAccessMock.mockRejectedValue(new Error('ENOENT'));

    const result = await loadSkill('/skills/missing');

    expect(result).toBeNull();
  });

  it('parses a valid SKILL.md with frontmatter', async () => {
    fsAccessMock.mockResolvedValue(undefined);
    fsReadFileMock.mockResolvedValue(`---
name: Git Ops
description: Git operations helper
version: 2.0.0
triggers:
  - git commit
  - git push
enabled: true
---

Use this skill for git operations.
`);

    const skill = await loadSkill('/skills/git-ops');

    expect(skill).not.toBeNull();
    expect(skill!.id).toBe('git-ops');
    expect(skill!.name).toBe('Git Ops');
    expect(skill!.description).toBe('Git operations helper');
    expect(skill!.version).toBe('2.0.0');
    expect(skill!.triggers).toEqual(['git commit', 'git push']);
    expect(skill!.instructions).toBe('Use this skill for git operations.');
    expect(skill!.isBuiltin).toBe(false);
    expect(skill!.enabled).toBe(true);
  });

  it('marks skill as builtin when flag is set', async () => {
    fsAccessMock.mockResolvedValue(undefined);
    fsReadFileMock.mockResolvedValue(`---
name: Core
description: Core skill
---

Instructions here.
`);

    const skill = await loadSkill('/skills/core', true);

    expect(skill!.isBuiltin).toBe(true);
  });

  it('defaults version to 1.0.0 and enabled to true', async () => {
    fsAccessMock.mockResolvedValue(undefined);
    fsReadFileMock.mockResolvedValue(`---
name: Simple
description: A simple skill
---

Do the thing.
`);

    const skill = await loadSkill('/skills/simple');

    expect(skill!.version).toBe('1.0.0');
    expect(skill!.enabled).toBe(true);
    expect(skill!.triggers).toEqual([]);
  });

  it('returns null when name is missing', async () => {
    fsAccessMock.mockResolvedValue(undefined);
    fsReadFileMock.mockResolvedValue(`---
description: No name skill
---

Instructions.
`);

    const result = await loadSkill('/skills/bad');

    expect(result).toBeNull();
  });

  it('returns null when description is missing', async () => {
    fsAccessMock.mockResolvedValue(undefined);
    fsReadFileMock.mockResolvedValue(`---
name: No Desc
---

Instructions.
`);

    const result = await loadSkill('/skills/bad');

    expect(result).toBeNull();
  });

  it('returns null on read error', async () => {
    fsAccessMock.mockResolvedValue(undefined);
    fsReadFileMock.mockRejectedValue(new Error('EPERM'));

    const result = await loadSkill('/skills/broken');

    expect(result).toBeNull();
  });

  it('sets enabled to false when frontmatter says so', async () => {
    fsAccessMock.mockResolvedValue(undefined);
    fsReadFileMock.mockResolvedValue(`---
name: Disabled Skill
description: A disabled skill
enabled: false
---

Instructions.
`);

    const skill = await loadSkill('/skills/disabled');

    expect(skill!.enabled).toBe(false);
  });
});

describe('checkRequirements', () => {
  const originalPlatform = process.platform;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns true when no requirements', async () => {
    expect(await checkRequirements()).toBe(true);
    expect(await checkRequirements(undefined)).toBe(true);
  });

  it('returns true when empty requirements', async () => {
    expect(await checkRequirements({})).toBe(true);
  });

  it('returns true when platform matches', async () => {
    const result = await checkRequirements({
      platform: [process.platform as 'linux' | 'darwin' | 'win32'],
    });

    expect(result).toBe(true);
  });

  it('returns false when platform does not match', async () => {
    // Use a platform that is definitely not the current one
    const otherPlatform = process.platform === 'linux' ? 'win32' : 'linux';

    const result = await checkRequirements({
      platform: [otherPlatform as 'linux' | 'darwin' | 'win32'],
    });

    expect(result).toBe(false);
  });

  it('returns true when required env vars are set', async () => {
    process.env.__TEST_SKILL_VAR__ = 'present';

    const result = await checkRequirements({
      envVars: ['__TEST_SKILL_VAR__'],
    });

    expect(result).toBe(true);

    delete process.env.__TEST_SKILL_VAR__;
  });

  it('returns false when required env var is missing', async () => {
    delete process.env.__NONEXISTENT_SKILL_VAR__;

    const result = await checkRequirements({
      envVars: ['__NONEXISTENT_SKILL_VAR__'],
    });

    expect(result).toBe(false);
  });
});

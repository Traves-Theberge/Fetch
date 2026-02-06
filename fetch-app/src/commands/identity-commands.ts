/**
 * @fileoverview Identity, Skill & Thread Command Handlers
 *
 * Handlers for /identity, /skill, /thread.
 *
 * @module commands/identity-commands
 */

import { Session } from '../session/types.js';
import { SessionManager } from '../session/manager.js';
import { getIdentityManager } from '../identity/manager.js';
import { getSkillManager } from '../skills/manager.js';
import type { CommandResult } from './types.js';

// ── Identity ─────────────────────────────────────────────────────────────────

export function handleIdentityCommand(
  args: string[],
  _session: Session
): CommandResult {
  const subCommand = args[0]?.toLowerCase();
  const identityManager = getIdentityManager();

  if (subCommand === 'reset' || subCommand === 'reload') {
    identityManager.reloadIdentity();
    return { handled: true, responses: ['🔄 Identity reloaded from filesystem.'] };
  }

  const identity = identityManager.getIdentity();

  if (subCommand === 'system' || subCommand === 'core') {
    return {
      handled: true,
      responses: [
        `**System Identity**\nRole: ${identity.role}\nTone: ${identity.voice.tone}\n\nPrimary Directives:\n${identity.directives.primary.join('\n- ')}`,
      ],
    };
  }

  return {
    handled: true,
    responses: [
      `🆔 **Identity: ${identity.name}** ${identity.emoji}`,
      `Role: ${identity.role}`,
      `Voice: ${identity.voice.tone}`,
      `\nUse \`/identity reset\` to reload or \`/identity system\` for details.`,
    ],
  };
}

// ── Skills ───────────────────────────────────────────────────────────────────

export function handleSkillCommand(
  args: string[],
  _session: Session
): CommandResult {
  const subCommand = args[0]?.toLowerCase();
  const skillName = args[1];
  const skillManager = getSkillManager();

  if (!subCommand || subCommand === 'list' || subCommand === 'ls') {
    const list = skillManager.listSkills();
    let message = '🧠 **Active Skills:**\n\n';

    for (const skill of list) {
      const icon = skill.id.startsWith('builtin') ? '📦' : '✨';
      message += `${icon} **${skill.name}** (v${skill.version})\n   ${skill.description}\n\n`;
    }

    return { handled: true, responses: [message] };
  }

  if (subCommand === 'enable') {
    if (!skillName) return { handled: true, responses: ['Usage: /skill enable <name>'] };
    skillManager.enableSkill(skillName);
    return { handled: true, responses: [`✅ Skill enabled: ${skillName}`] };
  }

  if (subCommand === 'disable') {
    if (!skillName) return { handled: true, responses: ['Usage: /skill disable <name>'] };
    skillManager.disableSkill(skillName);
    return { handled: true, responses: [`🚫 Skill disabled: ${skillName}`] };
  }

  if (subCommand === 'delete') {
    if (!skillName) return { handled: true, responses: ['Usage: /skill delete <name>'] };
    skillManager.deleteSkill(skillName);
    return { handled: true, responses: [`🗑️ Skill deleted: ${skillName}`] };
  }

  if (subCommand === 'create') {
    if (!skillName) return { handled: true, responses: ['Usage: /skill create <name>'] };
    try {
      skillManager.createSkill(skillName, skillName, 'New custom skill');
      return {
        handled: true,
        responses: [
          `✨ Skill created: ${skillName}\nEdit 'data/skills/${skillName}/SKILL.md' to configure.`,
        ],
      };
    } catch (e) {
      return {
        handled: true,
        responses: [`Failed to create skill: ${e instanceof Error ? e.message : String(e)}`],
      };
    }
  }

  return { handled: true, responses: [`Unknown skill command: ${subCommand}`] };
}

// ── Threads ──────────────────────────────────────────────────────────────────

export async function handleThreadCommand(
  args: string[],
  session: Session,
  sessionManager: SessionManager
): Promise<CommandResult> {
  const subCommand = args[0]?.toLowerCase();

  // LIST
  if (!subCommand || subCommand === 'list' || subCommand === 'ls') {
    const threads = sessionManager.listThreads(session);
    if (threads.length === 0) {
      return { handled: true, responses: ['No threads found.'] };
    }

    let message = '🧵 **Conversations:**\n\n';
    for (const thread of threads) {
      const isCurrent = session.currentThreadId === thread.id ? '👉' : '  ';
      const status = thread.status === 'active' ? '🟢' : '⚫';
      message += `${isCurrent} ${status} **${thread.title}** \`[ID: ${thread.id.substring(0, 6)}]\`\n`;
    }
    return { handled: true, responses: [message] };
  }

  // SWITCH
  if (subCommand === 'switch' || subCommand === 'open') {
    const target = args[1];
    if (!target) return { handled: true, responses: ['Usage: /thread switch <id>'] };

    const threads = sessionManager.listThreads(session);
    const match = threads.find((t) => t.id.startsWith(target));

    if (!match) return { handled: true, responses: [`Thread not found: ${target}`] };

    await sessionManager.switchThread(session, match.id);
    return { handled: true, responses: [`🔄 Switched to thread: **${match.title}**`] };
  }

  // CREATE
  if (subCommand === 'new' || subCommand === 'create') {
    const title = args.slice(1).join(' ') || 'New Conversation';
    const thread = await sessionManager.createThread(session, title);
    await sessionManager.switchThread(session, thread.id);
    return { handled: true, responses: [`✨ Started new thread: **${thread.title}**`] };
  }

  return { handled: true, responses: [`Unknown thread command: ${subCommand}`] };
}

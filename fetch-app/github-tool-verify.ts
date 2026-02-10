
import {
    handleWorkspaceSync,
    handleWorkspacePublish,
    handleWorkspaceSelect,
    handleWorkspaceCreate,
    handleWorkspaceDelete
} from './src/tools/workspace.js';
import { workspaceManager } from './src/workspace/manager.js';
import { logger } from './src/utils/logger.js';

async function verifyGitHubTools() {
    console.log('🐕 Starting GitHub Tool Verification...\n');

    try {
        const testWs = 'github-verify-' + Date.now();
        console.log(`--- Creating test workspace: ${testWs} ---`);
        await handleWorkspaceCreate({ name: testWs, template: 'empty' });
        await handleWorkspaceSelect({ name: testWs });

        // 1. Availability check check
        console.log('\n--- 1. Checking GitHub Availability ---');
        const isAvailable = await workspaceManager.isGitHubAvailable();
        console.log('GitHub Available:', isAvailable);

        if (!isAvailable) {
            console.error('❌ GitHub not available. Check GH_TOKEN in kennel.');
            return;
        }

        // 2. Publish (New Repo)
        console.log('\n--- 2. workspace_publish ---');
        const publishResult = await handleWorkspacePublish({
            name: testWs,
            description: 'Verification repo for Fetch GitHub tools'
        });

        console.log('Success:', publishResult.success);
        if (publishResult.success) {
            const data = JSON.parse(publishResult.output);
            console.log('Repo URL:', data.repoUrl);
        } else {
            console.error('Error:', publishResult.error);
        }

        // 3. Sync (Unpushed commit)
        console.log('\n--- 3. workspace_sync (with unpushed commit) ---');
        // Manual commit in kennel
        const { dockerExec } = await import('./src/utils/docker.js');
        const wsPath = `/workspace/${testWs}`;
        await dockerExec('git', ['-C', wsPath, 'commit', '--allow-empty', '-m', 'Manual verification commit']);

        const syncResult = await handleWorkspaceSync({ name: testWs });
        console.log('Success:', syncResult.success);
        if (syncResult.success) {
            const data = JSON.parse(syncResult.output);
            console.log('Message:', data.message);
            console.log('Pushed:', data.pushed);
        }

        // 4. Cleanup
        console.log('\n--- 4. Cleanup ---');
        // Delete the GitHub repo we just created
        await dockerExec('gh', ['repo', 'delete', `${testWs}`, '--yes']);
        await handleWorkspaceSelect({ name: 'test-demo' });
        await handleWorkspaceDelete({ name: testWs, confirm: true });
        console.log('Cleaned up local and remote.');

    } catch (err) {
        console.error('❌ Unexpected error:', err);
    }

    console.log('\n✅ GitHub Verification Complete.');
}

verifyGitHubTools().catch(console.error);

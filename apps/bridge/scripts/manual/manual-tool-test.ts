
import {
    handleWorkspaceList,
    handleWorkspaceCreate,
    handleWorkspaceSelect,
    handleWorkspaceDelete
} from '../../src/tools/workspace.js';
import {
    handleTaskCreate,
    handleTaskStatus,
    handleTaskCancel
} from '../../src/tools/task.js';
import { workspaceManager } from '../../src/workspace/manager.js';

// DO NOT silence the logger
// logger.silent = true;

async function runTests() {
    console.log('🚀 Starting Manual Tool Verification...\n');

    try {
        // 1. List Workspaces
        console.log('--- 1. workspace_list ---');
        const listResult = await handleWorkspaceList({});
        console.log('Success:', listResult.success);

        // 2. Create/Select Workspace
        console.log('\n--- 2. workspace_create/select (smoke-test) ---');
        const wsName = 'smoke-test-' + Date.now();
        await handleWorkspaceCreate({ name: wsName, template: 'empty' });
        await handleWorkspaceSelect({ name: wsName });
        console.log('Active Workspace:', workspaceManager.getActiveWorkspaceId());

        // 3. Task Create
        console.log('\n--- 3. task_create ---');
        const createResult = await handleTaskCreate(
            { goal: 'Verify task creation logic', agent: 'copilot' },
            { sessionId: 'test-session-123' }
        );

        if (!createResult.success) {
            console.error('❌ task_create failed:', createResult.error);
            return;
        }

        console.log('Success:', createResult.success);
        console.log('Output:', createResult.output);

        const taskData = JSON.parse(createResult.output);
        const taskId = taskData.id;

        // 4. Task Status
        console.log('\n--- 4. task_status ---');
        const statusResult = await handleTaskStatus({ taskId });
        console.log('Success:', statusResult.success);

        // 5. Task Cancel
        console.log('\n--- 5. task_cancel ---');
        const cancelResult = await handleTaskCancel({ taskId });
        console.log('Success:', cancelResult.success);

        // 6. Final Status check
        console.log('\n--- 6. task_status (after cancel) ---');
        const finalStatusResult = await handleTaskStatus({ taskId });
        console.log('Final Status:', JSON.parse(finalStatusResult.output).status);

        // 7. Cleanup
        console.log('\n--- 7. Cleanup ---');
        await handleWorkspaceSelect({ name: 'test-demo' });
        await handleWorkspaceDelete({ name: wsName, confirm: true });
        console.log('Cleaned up:', wsName);

    } catch (err) {
        console.error('❌ Unexpected error during test:', err);
        if (err instanceof Error) {
            console.error(err.stack);
        }
    }

    console.log('\n✅ Manual Tool Verification Complete.');
}

runTests().catch(err => {
    console.error('❌ Critical failure:', err);
    process.exit(1);
});

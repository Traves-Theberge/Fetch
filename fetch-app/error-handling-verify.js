
import { handleTaskCreate } from './dist/tools/task.js';
import { handleWorkspaceSelect } from './dist/tools/workspace.js';
import { getTaskManager } from './dist/task/manager.js';

async function verifyErrorHandling() {
    console.log('🐕 Starting Section 5: Error Handling Verification...\n');

    try {
        const manager = await getTaskManager();

        // 1. Create task without workspace
        console.log('--- 1. Testing no-workspace error ---');
        // We know from previous run that it works, but let's confirm again
        const noWsResult = await handleTaskCreate(
            { goal: 'Error test' },
            { sessionId: 'section-5-test-no-ws' }
        );
        console.log('No-Workspace Success:', noWsResult.success);
        console.log('No-Workspace Error:', noWsResult.error);

        // 2. Testing disabled agent error
        console.log('\n--- 2. Testing disabled agent (gemini) ---');
        // Select workspace first
        await handleWorkspaceSelect({ name: 'my-app' });

        const geminiResult = await handleTaskCreate(
            { goal: 'Error test', agent: 'gemini' },
            { sessionId: 'section-5-test' }
        );
        console.log('Gemini Result Success:', geminiResult.success);
        console.log('Gemini Result Error:', geminiResult.error);

        if (geminiResult.success) {
            console.error('❌ Expected failure for disabled agent gemini!');
        } else if (!geminiResult.error.includes('Requested agent gemini is not enabled')) {
            console.error('❌ Unexpected error message for disabled agent!');
        } else {
            console.log('✅ Correctly identified disabled agent.');
        }

        // 3. Testing invalid tool input (schema validation)
        console.log('\n--- 3. Testing invalid tool input (schema) ---');
        const invalidResult = await handleTaskCreate(
            { goal: '' }, // empty goal should fail validation
            { sessionId: 'section-5-test' }
        );
        console.log('Invalid Input Success:', invalidResult.success);
        // console.log('Invalid Input Error:', invalidResult.error);

        if (invalidResult.success) {
            console.error('❌ Expected failure for empty goal!');
        } else {
            console.log('✅ Correctly caught schema validation error.');
        }

    } catch (err) {
        console.error('❌ Unexpected error:', err);
    }

    console.log('\n✅ Section 5 Verification Complete.');
}

verifyErrorHandling().catch(console.error);

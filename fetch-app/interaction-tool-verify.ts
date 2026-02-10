
import { handleAskUser, handleReportProgress } from './src/tools/interaction.js';
import { handleTaskCreate, handleTaskStatus } from './src/tools/task.js';
import { handleWorkspaceSelect } from './src/tools/workspace.js';
import { getTaskManager } from './src/task/manager.js';

async function verifyInteractionTools() {
    console.log('🐕 Starting Section 4: Interaction Tools Verification...\n');

    try {
        // Ensure workspace is selected
        await handleWorkspaceSelect({ name: 'my-app' });

        // 1. Create a task to act as the "current task"
        console.log('--- 1. Creating dummy task ---');
        const createResult = await handleTaskCreate(
            { goal: 'Interaction tools test' },
            { sessionId: 'section-4-test' }
        );
        const taskData = JSON.parse(createResult.output);
        const taskId = taskData.id;
        console.log('Task ID:', taskId);

        // 2. Test report_progress
        console.log('\n--- 2. Testing report_progress ---');
        const progressResult = await handleReportProgress({
            message: 'Simulating some complex work...',
            percent: 42
        });
        console.log('Progress Update Success:', progressResult.success);

        const statusAfterProgress = await handleTaskStatus({ taskId });
        const taskAfterProgress = JSON.parse(statusAfterProgress.output);
        console.log('Task Progress Message:', taskAfterProgress.progress?.message);
        console.log('Task Progress Percent:', taskAfterProgress.progress?.percent);

        if (taskAfterProgress.progress?.percent !== 42) {
            console.error('❌ Progress percent mismatch!');
        }

        // 3. Test ask_user
        console.log('\n--- 3. Testing ask_user ---');
        const askResult = await handleAskUser({
            question: 'Which pizza topping do you prefer?',
            options: ['Pepperoni', 'Mushroom', 'Pineapple (heresy)']
        }, { autonomyLevel: 'supervised' }); // Force it to NOT auto-approve

        console.log('Ask User Success:', askResult.success);

        const statusAfterAsk = await handleTaskStatus({ taskId });
        const taskAfterAsk = JSON.parse(statusAfterAsk.output);
        console.log('Task Status:', taskAfterAsk.status);
        console.log('Pending Question:', taskAfterAsk.pendingQuestion);

        if (taskAfterAsk.status !== 'waiting_input') {
            console.error('❌ Task failed to transition to waiting_input!');
        }

    } catch (err) {
        console.error('❌ Unexpected error:', err);
    }

    console.log('\n✅ Section 4 Verification Complete.');
}

verifyInteractionTools().catch(console.error);

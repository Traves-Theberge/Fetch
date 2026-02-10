
import { handleAskUser, handleReportProgress } from './dist/tools/interaction.js';
import { handleTaskCreate, handleTaskStatus, handleTaskCancel } from './dist/tools/task.js';
import { handleWorkspaceSelect } from './dist/tools/workspace.js';
import { getTaskManager } from './dist/task/manager.js';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function verifyInteractionTools() {
    console.log('🐕 Starting Section 4: Interaction Tools Verification...\n');

    try {
        const manager = await getTaskManager();

        // Cleanup: Cancel any running task
        const existingTaskId = manager.getCurrentTaskId();
        if (existingTaskId) {
            console.log(`Cleaning up existing task: ${existingTaskId}`);
            await handleTaskCancel({ taskId: existingTaskId });
            await sleep(1000);
        }

        // Ensure workspace is selected
        await handleWorkspaceSelect({ name: 'my-app' });

        // 1. Create a task to act as the "current task"
        console.log('--- 1. Creating dummy task ---');
        const createResult = await handleTaskCreate(
            { goal: 'Interaction tools test' },
            { sessionId: 'section-4-test' }
        );

        if (!createResult.success) {
            console.error('❌ Task creation failed:', createResult.error);
            return;
        }

        const taskData = JSON.parse(createResult.output);
        const taskId = taskData.id;
        console.log('Task ID:', taskId);

        // Wait for task to start executing
        console.log('Waiting for task to start...');
        await sleep(2000);

        let taskRecord = manager.getTask(taskId);
        console.log('Task Status after wait:', taskRecord.status);

        // 2. Test report_progress
        console.log('\n--- 2. Testing report_progress ---');
        const progressResult = await handleReportProgress({
            message: 'Simulating some complex work...',
            percent: 42
        });
        console.log('Progress Update Success:', progressResult.success);
        if (!progressResult.success) console.error('Error:', progressResult.error);

        taskRecord = manager.getTask(taskId);
        // Progress is an array
        const lastProgress = taskRecord.progress[taskRecord.progress.length - 1];
        console.log('Internal Progress Message:', lastProgress?.message);
        console.log('Internal Progress Percent:', lastProgress?.percent);

        if (lastProgress?.percent !== 42) {
            console.error('❌ Progress percent mismatch!');
        }

        // 3. Test ask_user
        console.log('\n--- 3. Testing ask_user ---');
        const askResult = await handleAskUser({
            question: 'Which pizza topping do you prefer?',
            options: ['Pepperoni', 'Mushroom', 'Pineapple (heresy)']
        }, { autonomyLevel: 'supervised' }); // Force it to NOT auto-approve

        console.log('Ask User Success:', askResult.success);
        if (!askResult.success) console.error('Error:', askResult.error);

        taskRecord = manager.getTask(taskId);
        console.log('Task Status:', taskRecord.status);
        console.log('Pending Question:', taskRecord.pendingQuestion);

        if (taskRecord.status !== 'waiting_input') {
            console.error('❌ Task failed to transition to waiting_input!');
        }

        // Cleanup
        console.log('\n--- Final Cleanup ---');
        await handleTaskCancel({ taskId });

    } catch (err) {
        console.error('❌ Unexpected error:', err);
    }

    console.log('\n✅ Section 4 Verification Complete.');
}

verifyInteractionTools().catch(console.error);

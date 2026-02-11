
import { handleWorkspaceCreate } from './dist/tools/workspace.js';
import { logger } from './dist/utils/logger.js';

async function test() {
    const result = await handleWorkspaceCreate({
        name: 'github-test',
        template: 'node',
        initGit: true
    });
    console.log(JSON.stringify(result, null, 2));
}

test().catch(err => {
    console.error(err);
    process.exit(1);
});

import fs from 'fs';
import path from 'path';

let cachedVersion: string | null = null;

export function getVersion(): string {
    if (cachedVersion) return cachedVersion;

    try {
        // Try reading from VERSION file in project root (Docker container /app/VERSION)
        // Adjust path based on where we are compiled to.
        // In Docker: /app/dist/src/utils -> /app/VERSION is up 3 levels? 
        // Actually, Dockerfile WORKDIR is /app. 
        // Source code is in /app/src, compiled to /app/dist.
        // VERSION is copied to /app/VERSION.
        const versionPath = path.resolve(process.cwd(), 'VERSION');

        if (fs.existsSync(versionPath)) {
            cachedVersion = fs.readFileSync(versionPath, 'utf8').trim();
            return cachedVersion;
        }
    } catch (error) {
        // Ignore error, fallback to package.json
    }

    try {
        // Fallback to package.json
        const packageJsonPath = path.resolve(process.cwd(), 'package.json');
        if (fs.existsSync(packageJsonPath)) {
            const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
            cachedVersion = `v${pkg.version}`;
            return cachedVersion;
        }
    } catch (error) {
        // Ignore
    }

    cachedVersion = 'v0.0.0-unknown';
    return cachedVersion;
}

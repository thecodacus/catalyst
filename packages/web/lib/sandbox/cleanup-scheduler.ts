import { getCodeSandboxService } from './codesandbox-service';

let cleanupInterval: NodeJS.Timeout | null = null;

/**
 * Start the sandbox cleanup scheduler
 * @param intervalMinutes How often to run cleanup (default: 15 minutes)
 * @param inactiveThresholdMinutes Mark sandboxes inactive after this time (default: 30 minutes)
 */
export function startSandboxCleanupScheduler(
  intervalMinutes: number = 15,
  inactiveThresholdMinutes: number = 30
) {
  if (cleanupInterval) {
    console.log('⚠️ Sandbox cleanup scheduler already running');
    return;
  }

  console.log(`🗓️ Starting sandbox cleanup scheduler (every ${intervalMinutes} minutes)`);

  // Run cleanup immediately on start
  runCleanup(inactiveThresholdMinutes);

  // Schedule periodic cleanup
  cleanupInterval = setInterval(() => {
    runCleanup(inactiveThresholdMinutes);
  }, intervalMinutes * 60 * 1000);
}

/**
 * Stop the sandbox cleanup scheduler
 */
export function stopSandboxCleanupScheduler() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    console.log('🛑 Stopped sandbox cleanup scheduler');
  }
}

/**
 * Run sandbox cleanup
 */
async function runCleanup(inactiveThresholdMinutes: number) {
  try {
    console.log(`🧹 Running scheduled sandbox cleanup...`);
    const sandboxService = getCodeSandboxService();
    await sandboxService.cleanupInactiveSandboxes(inactiveThresholdMinutes);
  } catch (error) {
    console.error('Scheduled cleanup failed:', error);
  }
}

// Auto-start scheduler if enabled via environment variable
if (process.env.ENABLE_SANDBOX_CLEANUP === 'true') {
  const interval = parseInt(process.env.SANDBOX_CLEANUP_INTERVAL_MINUTES || '15');
  const threshold = parseInt(process.env.SANDBOX_INACTIVE_THRESHOLD_MINUTES || '30');
  
  // Delay startup to ensure services are initialized
  setTimeout(() => {
    startSandboxCleanupScheduler(interval, threshold);
  }, 5000);
}
import handler from 'vinext/server/fetch-handler';
import {processWelcomeEmailQueue, type WelcomeEmailBindings} from '../lib/welcome-email';

const worker = {
  fetch: handler.fetch,
  async scheduled(_controller: ScheduledController, env: WelcomeEmailBindings) {
    // Awaiting the scheduled task keeps retries alive without a visitor's session.
    await processWelcomeEmailQueue(env);
  },
};

export default worker;

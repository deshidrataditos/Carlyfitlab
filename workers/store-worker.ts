import handler from 'vinext/server/fetch-handler';
import {processWelcomeEmailQueue, type WelcomeEmailBindings} from '../lib/welcome-email';
import {processPlanEmailQueue, type PlanEmailBindings} from '../lib/plan-email';
import {processMaterialEmailQueue, type MaterialEmailBindings} from '../lib/material-email';

import {processProductReservations} from '../lib/product-availability';

const worker = {
  fetch: handler.fetch,
  async scheduled(_controller: ScheduledController, env: WelcomeEmailBindings & PlanEmailBindings & MaterialEmailBindings) {
    // Awaiting the scheduled task keeps retries alive without a visitor's session.
    await processWelcomeEmailQueue(env).catch(() => {});
    // Share provider capacity: never overlap the email queues or their boundary requests.
    await new Promise(resolve => setTimeout(resolve, 600));
    await processPlanEmailQueue(env).catch(() => {});
    await new Promise(resolve => setTimeout(resolve, 600));
    await processMaterialEmailQueue(env).catch(() => {});
    await processProductReservations(env);
  },
};

export default worker;

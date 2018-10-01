const fastify = require('fastify')({
  logger: true
});
const creds = require('./creds.json');
const webpush = require('web-push');
const Datastore = require('nedb');
const db = new Datastore({ filename: 'db', autoload: true });
const { promisify } = require('util');
const find = promisify(db.find.bind(db));
const remove = promisify(db.remove.bind(db));
const insert = promisify(db.insert.bind(db));
const loadDatabase = promisify(db.loadDatabase.bind(db));

// enable CORS for easier local development
fastify.register(require('fastify-cors'), {
  origin: true,
  methods: ['GET', 'PUT', 'POST', 'DELETE']
});

fastify.get('/public-key', async (request, reply) => {
  return {
    publicKey: creds.publicKey
  };
});

fastify.post(
  '/register',
  {
    schema: {
      body: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
          endpoint: { type: 'string' },
          keys: {
            p256dh: { type: 'string' },
            auth: { type: 'string' }
          }
        }
      }
    }
  },
  async (request, reply) => {
    fastify.log.info(`register push subscription for user ${request.body.userId}`);

    let now = Date.now();
    let document = Object.assign(request.body, {
      created: now,
      lastModified: now,
      service: new URL(request.body.endpoint).host
    });

    // check if this subscription is already registered
    let existingSub = await findOne({
      userId: request.body.userId,
      endpoint: request.body.endpoint
    });
    if (!existingSub) {
      fastify.log.info(`no subscription found, creating`);
      await insert(document);
    } else {
      fastify.log.info(`subscription found, updating`);
      await update({ _id: existingSub._id }, { $set: { lastModified: Date.now() } });
    }

    // check for old subscriptions from the same service as this one that we can drop
    let oldSubs = await find({
      userId: request.body.userId,
      service: document.service,
      endpoint: { $ne: request.body.endpoint }
    });

    if (oldSubs.length > 0) {
      fastify.log.info(`dropping ${oldSubs.length} old subscription(s)`);
      await Promise.all(oldSubs.map(sub => {
        return remove({ _id: sub._id });
      }));
    }

    reply.code(200).send('');
  }
);

fastify.post(
  '/deregister',
  {
    schema: {
      body: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
          endpoint: { type: 'string' }
        }
      }
    }
  },
  async (request, reply) => {
    fastify.log.info(`deregister push subscription for user ${request.body.userId}`);
    await remove(request.body);
    reply.code(200).send('');
  }
);

fastify.post(
  '/push',
  {
    schema: {
      body: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
          notification: { type: 'object' }
        }
      }
    }
  },
  async (request, reply) => {
    try {
      let subs = await find({ userId: request.body.userId });
      await Promise.all(subs.map(async sub => {

        let subscription = {
          endpoint: sub.endpoint,
          keys: sub.keys
        };
        let payload = JSON.stringify(request.body.notification);
        let options = {
          TTL: 60 * 60 * 24 * 30 // lives for 30 days
        };
        try {
          await webpush.sendNotification(subscription, payload, options);
        }
        catch (error) {
          // a push service will return a 410 if a subscription has been deactivated
          // See https://developers.google.com/web/fundamentals/push-notifications/common-issues-and-reporting-bugs#http_status_codes
          if (error.statusCode === 410) {
            fastify.log.info(`Removing de-registered subscription`);
            await remove({ _id: sub._id });
          } else {
            fastify.log.error(error);
          }
        }

      }));
      reply.code(200).send(`Sent ${subs.length} messages`);
    }
    catch (error) {
      fastify.log.error(error);
      reply.code(500).send(error.message);
    }
  }
)

async function start() {
  // init webpush
  webpush.setVapidDetails(
    'mailto:example@yourdomain.org',
    creds.publicKey,
    creds.privateKey
  );

  try {
    await loadDatabase();
    await fastify.listen(3000);
  }
  catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

start();

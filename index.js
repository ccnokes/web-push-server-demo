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
    let document = Object.assign(request.body, {
      timestamp: Date.now()
    });

    let docs = await find({ userId: request.body.userId, endpoint: request.body.endpoint });
    if (docs.length === 0) {
      fastify.log.info(`no subscription found, creating`);
      await insert(document);
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
      await Promise.all(subs.map(sub => {
        webpush.sendNotification({
          endpoint: sub.endpoint,
          keys: sub.keys
        }, JSON.stringify(request.body.notification));
      }));
      reply.code(200).send(`Sent ${subs.length} messages`);
    }
    catch(error) {
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

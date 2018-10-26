const app = require('fastify')({
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

// enable CORS for easier local development. Don't do this in a production app.
app.register(require('fastify-cors'), {
  origin: true,
  methods: ['GET', 'PUT', 'POST', 'DELETE']
});

app.get('/public-key', async (request, reply) => {
  return {
    publicKey: creds.publicKey
  };
});

app.post(
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
    app.log.info(`register push subscription for user ${request.body.userId}`);

    let document = Object.assign(request.body, { created: Date.now() });

    // check if this subscription is already registered
    let existingSub = await findOne({
      userId: request.body.userId,
      endpoint: request.body.endpoint
    });

    if (!existingSub) {
      app.log.info(`no subscription found, creating`);
      await insert(document);
      reply.code(201).send('');
    } else {
      app.log.info(`subscription already exists`);
      reply.code(200).send('');
    }
  }
);

app.post(
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
    app.log.info(`deregister push subscription for user ${request.body.userId}`);
    await remove(request.body);
    reply.code(200).send('');
  }
);

app.post(
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
          if (error.statusCode === 410 || error.statusCode === 404) {
            app.log.info(`Removing de-registered subscription`);
            await remove({ _id: sub._id });
          } else {
            app.log.error(error);
          }
        }

      }));
      reply.code(200).send(`Sent ${subs.length} messages`);
    }
    catch (error) {
      app.log.error(error);
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
    await app.listen(3000);
  }
  catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();

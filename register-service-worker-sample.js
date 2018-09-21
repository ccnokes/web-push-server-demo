
export function registerServiceWorker(swUrl) {
  return navigator.serviceWorker.register(swUrl)
    .then(getPushSubscription)
    .catch(console.error);
}

function getPushSubscription(registration) {
  // gets existing subscription, otherwise it's null
  return registration.pushManager.getSubscription()
    .then(subscription => {
      if (!subscription) {
        // get our public key and pass it to the browser to activate a push subscription
        return getApplicationServerKey().then(applicationServerKey => {
          return registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey
          })
        })
      } else {
        // we already have one, so just return it
        return subscription;
      }
    })
    .then(pushSubscription => updateSubscription(USER_ID, pushSubscription));
}

// gets the server's public key
function getApplicationServerKey() {
  return fetch('http://localhost:3000/public-key')
    .then(res => res.json())
    .then(({ publicKey }) => publicKey);
}

// sends the subscription to the server
function updateSubscription(userId, subscription) {
  return fetch({
    url: `http://localhost:3000/register`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      userId,
      ...subscription.toJSON()
    })
  });
}

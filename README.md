# web push backend demo
This is a web server that provides a minimal server implementation to get web push working. It's useful for prototyping or as a simple reference guide to know how to start implementing a backend for web push.

## Starting
```
npm install
npm start
```
Running npm install will also generate VAPID server keys that you will need to send requests.

See `register-service-worker-sample.js` to see how to set it up in the browser.

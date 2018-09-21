#! /bin/bash
set -e

# put your JSON here
json=$(cat <<-END
{
  "userId": "123",
  "notification": {
    "title": "Push it real good",
    "body": "$(date)",
    "tag":"test123",
    "renotify": true
  }
}
END
)

curl -i -H 'Content-Type: application/json' localhost:3000/push -d "$json"

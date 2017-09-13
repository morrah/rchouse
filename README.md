# Remote Controlled House consists of: 
* **web-app (javascript+websockets+highstock.js)** to watch temperature sensors in real-time, send commands and view historical data chart; 
* **async web-server (python2.7+django+gevent+redis)** to 2FA auth, websockets and redis pub/sub; 
* **reactor (python+redis pub/sub)** to listen for temperature messages and do things (relay switching, notify, alarm); 
* **sensor-loop (python+redis pub/sub)** to read sensor data, publish to redis and write to sqlite DB; 
* **sqlite** to keep historical data including averaged indexed values for 5 mins, 1 hour, 24 hours, etc for dynamic load via highstock.js

# Scheme

![screenshot](https://files.catbox.moe/dmt7cx.png "screenshot")

# Interface prototype

![screenshot](https://files.catbox.moe/9w3pwi.png "screenshot")

# Interface screenshot
![screenshot](https://files.catbox.moe/vtvulx.png "screenshot")